import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Crosshair, MapPinned, Pause, Play, Plus, Trash2 } from "lucide-react";

import {
  createGeofence,
  deleteGeofence,
  listGeofences,
  setGeofenceActive,
  type Geofence,
  type TriggerOn,
} from "../../api/geofences";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Skeleton, cx } from "../ui";

/*
Geofence management.

Circular zones only, centred on a point the owner picks — usually "wherever
this device is right now", since that covers the common cases (home, office,
a client site) without needing a map-drawing widget. The device side of this
lives in internal/mqtt/geofence.go: crossing detection there compares against
the last known state, not every point inside the zone, so this panel's job is
just CRUD plus a clear read of what is currently defined.
*/

interface Props {
  serial: string;
  /** Current position, if known — seeds "use current location". */
  currentLat?: number;
  currentLng?: number;
}

export default function GeofencePanel({ serial, currentLat, currentLng }: Props) {
  const { t } = useLanguage();
  const [fences, setFences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFences(await listGeofences(serial));
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (fence: Geofence) => {
    setFences((prev) => prev.map((f) => (f.id === fence.id ? { ...f, is_active: !f.is_active } : f)));
    try {
      await setGeofenceActive(serial, fence.id, !fence.is_active);
    } catch {
      load();
    }
  };

  const handleDelete = async (fence: Geofence) => {
    setFences((prev) => prev.filter((f) => f.id !== fence.id));
    try {
      await deleteGeofence(serial, fence.id);
    } catch {
      load();
    }
  };

  return (
    <Card flush>
      <CardHeader
        title={t("geofences")}
        subtitle={t("geofences.subtitle")}
        action={
          !showForm && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(true)} icon={<Plus className="w-3.5 h-3.5" />}>
              {t("add.geofence")}
            </Button>
          )
        }
      />

      <div className="p-5 space-y-3">
        {showForm && (
          <CreateForm
            serial={serial}
            currentLat={currentLat}
            currentLng={currentLng}
            t={t}
            onCreated={(fence) => {
              setFences((prev) => [fence, ...prev]);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : fences.length === 0 && !showForm ? (
          <EmptyState
            icon={<MapPinned className="w-6 h-6" />}
            title={t("no.geofences.yet")}
            description={t("no.geofences.description")}
          />
        ) : (
          fences.map((fence) => (
            <FenceRow key={fence.id} fence={fence} t={t} onToggle={handleToggle} onDelete={handleDelete} />
          ))
        )}
      </div>
    </Card>
  );
}

function FenceRow({
  fence,
  t,
  onToggle,
  onDelete,
}: {
  fence: Geofence;
  t: (k: string) => string;
  onToggle: (f: Geofence) => void;
  onDelete: (f: Geofence) => void;
}) {
  const triggerLabel = { enter: t("trigger.enter"), exit: t("trigger.exit"), both: t("trigger.both") }[fence.trigger_on];

  return (
    <div
      className={cx(
        "flex items-center gap-3 p-3 rounded-control border border-line",
        !fence.is_active && "opacity-60"
      )}
    >
      <span className="shrink-0 grid place-items-center w-9 h-9 rounded-control bg-brand-subtle text-brand-ink">
        <MapPinned className="w-4 h-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content truncate">{fence.name}</p>
        <p className="text-xs text-content-muted mt-0.5 tnum">
          {fence.radius_m} {t("meters")} · {triggerLabel}
        </p>
      </div>

      <Badge tone={fence.is_active ? "good" : "neutral"}>{fence.is_active ? t("active") : t("paused")}</Badge>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onToggle(fence)}
          aria-label={fence.is_active ? t("pause") : t("resume")}
          icon={fence.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(fence)}
          aria-label={t("delete")}
          icon={<Trash2 className="w-3.5 h-3.5" />}
          className="!text-status-critical hover:!bg-status-critical/10"
        />
      </div>
    </div>
  );
}

function CreateForm({
  serial,
  currentLat,
  currentLng,
  t,
  onCreated,
  onCancel,
}: {
  serial: string;
  currentLat?: number;
  currentLng?: number;
  t: (k: string) => string;
  onCreated: (fence: Geofence) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState<string>(currentLat != null ? String(currentLat) : "");
  const [lng, setLng] = useState<string>(currentLng != null ? String(currentLng) : "");
  const [radius, setRadius] = useState("200");
  const [triggerOn, setTriggerOn] = useState<TriggerOn>("both");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const useCurrent = () => {
    if (currentLat != null) setLat(String(currentLat));
    if (currentLng != null) setLng(String(currentLng));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius, 10);

    if (!name.trim() || Number.isNaN(latNum) || Number.isNaN(lngNum) || Number.isNaN(radiusNum)) {
      setError("Fill in every field.");
      return;
    }
    if (radiusNum < 20 || radiusNum > 50000) {
      setError("Radius must be between 20 and 50000 metres.");
      return;
    }

    setSubmitting(true);
    try {
      const fence = await createGeofence(serial, {
        name: name.trim(),
        lat: latNum,
        lng: lngNum,
        radius_m: radiusNum,
        trigger_on: triggerOn,
      });
      onCreated(fence);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not create the geofence.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-control border border-line bg-surface-sunken space-y-3">
      <Input
        label={t("geofence.name")}
        placeholder={t("geofence.name.placeholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <Input label={t("latitude")} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required />
        <Input label={t("longitude")} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required />
      </div>

      {currentLat != null && (
        <button
          type="button"
          onClick={useCurrent}
          className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
          {t("use.current.location")}
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={`${t("radius")} (${t("meters")})`}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          inputMode="numeric"
          required
        />

        <div className="w-full">
          <label className="block text-sm font-medium text-content-secondary mb-1.5">{t("trigger.on")}</label>
          <select
            value={triggerOn}
            onChange={(e) => setTriggerOn(e.target.value as TriggerOn)}
            className="w-full h-11 rounded-control bg-surface text-content border border-line px-3.5 text-sm transition-colors focus:border-brand"
          >
            <option value="both">{t("trigger.both")}</option>
            <option value="enter">{t("trigger.enter")}</option>
            <option value="exit">{t("trigger.exit")}</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-status-critical">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" loading={submitting}>
          {t("add.geofence")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
