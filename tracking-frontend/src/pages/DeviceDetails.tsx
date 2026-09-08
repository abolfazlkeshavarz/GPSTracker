import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BatteryMedium,
  Check,
  Clock,
  Download,
  Gauge,
  History,
  MapPin,
  Navigation,
  Pencil,
  Route,
  Satellite,
  Signal,
  X,
  Zap,
} from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import LiveMap from "../components/map/LiveMap";
import GeofencePanel from "../components/device/GeofencePanel";
import RemoteControl from "../components/device/RemoteControl";
import AlertSettingsPanel from "../components/device/AlertSettingsPanel";
import SubscriptionCard from "../components/device/SubscriptionCard";
import { useLanguage } from "../context/LanguageContext";
import { useDeviceUpdates } from "../context/RealtimeContext";
import { getDevices, getLatestLocation, getOdometer, setOdometer, type Odometer } from "../api/devices";
import { downloadHistoryCSV, renameDevice } from "../api/account";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Meter,
  PageHeading,
  Skeleton,
  StatTile,
  StatusDot,
} from "../components/ui";

export default function DeviceDetails() {
  const { serial } = useParams();
  const { t } = useLanguage();

  const [location, setLocation] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!serial) return;
    try {
      setLoading(true);
      const data = await getLatestLocation(serial);
      setLocation(data);
      setLastUpdate(new Date());
    } catch {
      setLocation(null);
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!serial) return;
    getDevices()
      .then((data) => {
        const match = (data?.devices ?? []).find((d: any) => d.serial === serial);
        setDeviceName(match?.name?.trim() || "");
      })
      .catch(() => {});
  }, [serial]);

  const handleExport = async () => {
    if (!serial) return;
    setExporting(true);
    try {
      await downloadHistoryCSV(serial);
    } catch {
      // The export just doesn't start; nothing left in a broken state to
      // recover from — a silent no-op beats interrupting the page with an
      // alert() for what is a best-effort convenience action.
    } finally {
      setExporting(false);
    }
  };

  useDeviceUpdates((update) => {
    if (update.device !== serial) return;
    setLocation(update);
    setLastUpdate(new Date());
    setLive(true);
  });

  // "Live" should decay: one update does not make a device live forever.
  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => setLive(false), 90_000);
    return () => clearTimeout(id);
  }, [live, lastUpdate]);

  if (loading) {
    return (
      <ResponsiveLayout>
        <Skeleton className="h-8 w-56 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-card" />
      </ResponsiveLayout>
    );
  }

  if (!location) {
    return (
      <ResponsiveLayout>
        <PageHeading title={t("device.details")} subtitle={serial} />
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-6 h-6" />}
            title={t("no.data.available")}
            description={`${t("no.location.data")} ${serial}`}
            action={
              <Link to={`/device/${serial}/history`}>
                <Button variant="secondary" icon={<History className="w-4 h-4" />}>
                  {t("view.history")}
                </Button>
              </Link>
            }
          />
        </Card>
      </ResponsiveLayout>
    );
  }

  const sats = location.sat ?? location.satellites ?? 0;
  const csq = location.csq ?? 0;
  const battery = typeof location.battery === "number" ? location.battery : null;
  const gps = gpsQuality(sats, location.hdop);
  const signal = signalQuality(csq);
  const batt = batteryQuality(battery);

  return (
    <ResponsiveLayout>
      <PageHeading
        title={
          <RenameableTitle
            serial={serial || ""}
            name={deviceName}
            t={t}
            onRenamed={(name) => setDeviceName(name)}
          />
        }
        subtitle={deviceName ? serial : t("device.details")}
        actions={
          <>
            <Badge tone={live ? "good" : "neutral"} icon={<StatusDot tone={live ? "good" : "neutral"} pulse={live} />}>
              {live ? t("live.updates") : "Idle"}
            </Badge>
            <Button
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
              icon={<Download className="w-4 h-4" />}
            >
              {t("export.csv")}
            </Button>
            <Link to={`/device/${serial}/history`}>
              <Button variant="secondary" icon={<History className="w-4 h-4" />}>
                {t("view.history")}
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatTile
          label={t("speed")}
          value={`${location.speed ?? 0} km/h`}
          icon={<Gauge className="w-[18px] h-[18px]" />}
          accent="series-1"
        />
        <StatTile
          label={t("satellites")}
          value={sats}
          icon={<Satellite className="w-[18px] h-[18px]" />}
          accent="series-3"
          hint={gps.label}
        />
        <StatTile
          label={t("signal.strength")}
          value={`${csq}/31`}
          icon={<Signal className="w-[18px] h-[18px]" />}
          accent="series-4"
          hint={signal.label}
        />
        <StatTile
          label={t("battery")}
          value={battery != null ? `${battery.toFixed(2)} V` : "—"}
          icon={<BatteryMedium className="w-[18px] h-[18px]" />}
          accent={batt.tone === "critical" ? "status-critical" : "status-good"}
          hint={batt.label}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card flush className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title={t("live.location.tracking")}
            subtitle={t("last.known.position")}
            action={
              lastUpdate && (
                <span className="flex items-center gap-1.5 text-xs text-content-muted whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5" />
                  {lastUpdate.toLocaleTimeString()}
                </span>
              )
            }
          />
          <div className="h-[460px]">
            <LiveMap lat={location.lat} lng={location.lng} serial={serial || ""} heading={location.heading} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card flush>
            <CardHeader title={t("location.details")} />
            <dl className="p-5 space-y-3">
              <Row label={t("latitude")} value={`${location.lat?.toFixed(6)}°`} mono />
              <Row label={t("longitude")} value={`${location.lng?.toFixed(6)}°`} mono />
              {typeof location.heading === "number" && (
                <Row
                  label="Heading"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Navigation
                        className="w-3.5 h-3.5 text-content-muted"
                        style={{ transform: `rotate(${location.heading}deg)` }}
                      />
                      {Math.round(location.heading)}°
                    </span>
                  }
                />
              )}
              {typeof location.altitude === "number" && (
                <Row label="Altitude" value={`${Math.round(location.altitude)} m`} />
              )}
              {location.operator && <Row label={t("network.operator")} value={location.operator} />}
              {location.ignition !== undefined && (
                <Row
                  label={t("ignition")}
                  value={
                    <Badge tone={location.ignition ? "good" : "neutral"} icon={location.ignition ? <Zap className="w-3 h-3" /> : undefined}>
                      {location.ignition ? "ON" : "OFF"}
                    </Badge>
                  }
                />
              )}
            </dl>
          </Card>

          <Card flush>
            <CardHeader title={t("performance.metrics")} />
            <div className="p-5 space-y-4">
              <Meter
                value={gps.pct}
                tone={gps.tone}
                label={
                  <>
                    <span>{t("gps.accuracy")}</span>
                    <span className="font-medium text-content-secondary">{gps.label}</span>
                  </>
                }
              />
              <Meter
                value={Math.min(100, (csq / 31) * 100)}
                tone={signal.tone}
                label={
                  <>
                    <span>{t("signal.strength")}</span>
                    <span className="font-medium text-content-secondary">{signal.label}</span>
                  </>
                }
              />
              {battery != null && (
                <Meter
                  value={batt.pct}
                  tone={batt.tone}
                  label={
                    <>
                      <span>{t("battery")}</span>
                      <span className="font-medium text-content-secondary">{batt.label}</span>
                    </>
                  }
                />
              )}

              {typeof location.fix_age_ms === "number" && location.fix_age_ms > 60_000 && (
                <p className="flex items-start gap-2 text-xs text-status-warning">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  This position is {Math.round(location.fix_age_ms / 1000)}s old — the device may
                  have lost its GPS fix.
                </p>
              )}
            </div>
          </Card>

          <OdometerCard serial={serial || ""} refreshSignal={lastUpdate} t={t} />

          <SubscriptionCard serial={serial || ""} />
        </div>
      </div>

      {/* Control and configuration. Below the map because they are things you
          come to the page to do, not things you come to the page to see. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mt-4 lg:mt-6">
        <RemoteControl serial={serial || ""} online={live} />
        <AlertSettingsPanel serial={serial || ""} />
      </div>

      <div className="mt-4 lg:mt-6">
        <GeofencePanel serial={serial || ""} currentLat={location.lat} currentLng={location.lng} />
      </div>
    </ResponsiveLayout>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className={`text-sm font-medium text-content ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

/** Inline device-name editor shown in the page title. */
function RenameableTitle({
  serial,
  name,
  t,
  onRenamed,
}: {
  serial: string;
  name: string;
  t: (k: string) => string;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await renameDevice(serial, draft.trim());
      onRenamed(draft.trim());
      setEditing(false);
    } catch {
      // Leave the field open so the user can retry or cancel.
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("device.name.placeholder")}
          className="h-9 px-2.5 rounded-control bg-surface border border-line text-content text-lg font-semibold focus:border-brand transition-colors"
          maxLength={80}
        />
        <button
          type="submit"
          disabled={saving}
          aria-label={t("save")}
          className="grid place-items-center w-8 h-8 rounded-control text-status-good hover:bg-status-good/10 cursor-pointer disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
          aria-label={t("cancel")}
          className="grid place-items-center w-8 h-8 rounded-control text-content-muted hover:bg-surface-sunken cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 text-start cursor-pointer"
      aria-label={t("rename.device")}
    >
      <span className="text-display text-content">{name || serial}</span>
      <Pencil className="w-4 h-4 text-content-muted opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/**
 * Lifetime distance total for the device.
 *
 * The figure is accumulated server-side on the ingest path; this card just
 * reads it (re-fetching whenever a live point lands) and lets the owner
 * overwrite the reading — to match the vehicle's real dashboard when a
 * tracker is first fitted, or to reset it.
 */
function OdometerCard({
  serial,
  refreshSignal,
  t,
}: {
  serial: string;
  refreshSignal: unknown;
  t: (k: string) => string;
}) {
  const [odometer, setOdometerState] = useState<Odometer | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!serial) return;
    // Don't clobber the field the user is currently editing.
    if (editing) return;
    getOdometer(serial)
      .then(setOdometerState)
      .catch(() => {});
  }, [serial, refreshSignal, editing]);

  const km = odometer?.total_km ?? 0;

  const startEditing = () => {
    setDraft(String(km));
    setEditing(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) return;
    setSaving(true);
    try {
      const updated = await setOdometer(serial, value);
      setOdometerState(updated);
      setEditing(false);
    } catch {
      // Leave the field open so the user can retry or cancel.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card flush>
      <CardHeader
        title={t("odometer")}
        subtitle={t("odometer.total.distance")}
        action={
          !editing && (
            <button
              type="button"
              onClick={startEditing}
              aria-label={t("set.odometer")}
              className="grid place-items-center w-8 h-8 rounded-control text-content-muted hover:bg-surface-sunken cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )
        }
      />
      <div className="p-5">
        {editing ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 w-32 px-2.5 rounded-control bg-surface border border-line text-content text-lg font-semibold tnum focus:border-brand transition-colors"
            />
            <span className="text-sm text-content-muted">{t("kilometers.short")}</span>
            <button
              type="submit"
              disabled={saving}
              aria-label={t("save")}
              className="grid place-items-center w-8 h-8 rounded-control text-status-good hover:bg-status-good/10 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label={t("cancel")}
              className="grid place-items-center w-8 h-8 rounded-control text-content-muted hover:bg-surface-sunken cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-control bg-series-2/10 text-series-2 shrink-0">
              <Route className="w-[18px] h-[18px]" />
            </span>
            <span className="text-metric font-semibold text-content tnum">
              {odometer == null
                ? "—"
                : km.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-content-muted ms-1.5">
                {t("kilometers.short")}
              </span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- quality ---
 * Each returns a percentage for the meter plus a word, because the meters use
 * status colours and those must never carry meaning on their own.
 */

function gpsQuality(sats: number, hdop?: number) {
  // HDOP is the real accuracy measure when the firmware reports it; satellite
  // count is only a proxy.
  if (typeof hdop === "number" && hdop > 0) {
    if (hdop < 2) return { pct: 100, label: "Excellent", tone: "good" as const };
    if (hdop < 5) return { pct: 70, label: "Good", tone: "good" as const };
    if (hdop < 10) return { pct: 45, label: "Moderate", tone: "warning" as const };
    return { pct: 20, label: "Poor", tone: "critical" as const };
  }

  if (sats >= 8) return { pct: 100, label: "Excellent", tone: "good" as const };
  if (sats >= 6) return { pct: 75, label: "Good", tone: "good" as const };
  if (sats >= 4) return { pct: 50, label: "Fair", tone: "warning" as const };
  if (sats >= 1) return { pct: 25, label: "Poor", tone: "critical" as const };
  return { pct: 0, label: "No fix", tone: "critical" as const };
}

function signalQuality(csq: number) {
  if (csq === 99) return { label: "Unknown", tone: "neutral" as const };
  if (csq >= 20) return { label: "Excellent", tone: "good" as const };
  if (csq >= 15) return { label: "Good", tone: "good" as const };
  if (csq >= 10) return { label: "Fair", tone: "warning" as const };
  if (csq >= 5) return { label: "Poor", tone: "serious" as const };
  return { label: "Very poor", tone: "critical" as const };
}

function batteryQuality(v: number | null) {
  if (v == null) return { pct: 0, label: "Unknown", tone: "neutral" as const };
  // Map a 12 V lead-acid range (11.5–12.8 V) onto 0–100%.
  const pct = Math.max(0, Math.min(100, ((v - 11.5) / 1.3) * 100));
  if (v >= 12.5) return { pct, label: "Excellent", tone: "good" as const };
  if (v >= 12.2) return { pct, label: "Good", tone: "good" as const };
  if (v >= 11.8) return { pct, label: "Fair", tone: "warning" as const };
  return { pct, label: "Critical", tone: "critical" as const };
}
