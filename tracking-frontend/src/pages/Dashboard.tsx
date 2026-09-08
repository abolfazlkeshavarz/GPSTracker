import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BatteryMedium,
  Cpu,
  Gauge,
  MapPin,
  PlusCircle,
  Radio,
  Satellite,
  Signal,
  Wifi,
} from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { useDeviceUpdates } from "../context/RealtimeContext";
import { getDevices, getLatestLocation, getDeviceStatus } from "../api/devices";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatTile,
  StatusDot,
  cx,
} from "../components/ui";
import { InstallPrompt } from "../components/pwa/PWAPrompts";

/**
 * A device is "live" if its last fix arrived within this window.
 *
 * The dashboard used to call any device with a cached location "online", so a
 * tracker that had been silent for hours still showed green. The server's own
 * status endpoint uses a 60s Redis TTL; this is the same idea, applied to the
 * timestamp so the list stays honest between polls.
 */
const LIVE_WINDOW_MS = 90_000;

interface DeviceRow {
  serial: string;
  name?: string;
  activated_at?: string;
  is_active?: boolean;
  location: any | null;
  /** Epoch ms of the most recent fix we know about. */
  lastFixAt: number | null;
  online: boolean;
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Re-evaluate freshness on a timer so a device silently goes stale without
  // needing a new message to arrive.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getDevices();
      const list: any[] = Array.isArray(data?.devices) ? data.devices : [];

      const rows = await Promise.all(
        list.map(async (device: any): Promise<DeviceRow> => {
          const [location, status] = await Promise.all([
            getLatestLocation(device.serial).catch(() => null),
            getDeviceStatus(device.serial).catch(() => null),
          ]);

          const lastFixAt = location?.timestamp
            ? location.timestamp * 1000
            : location
            ? Date.now()
            : null;

          return {
            ...device,
            location,
            lastFixAt,
            // Trust the server's own view when it answers.
            online: status?.online ?? false,
          };
        })
      );

      setDevices(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates arrive through the app-level socket, so navigating away and
  // back does not drop the connection.
  useDeviceUpdates((update) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.serial === update.device
          ? { ...d, location: update, lastFixAt: Date.now(), online: true }
          : d
      )
    );
  });

  const rows = useMemo(
    () =>
      devices.map((d) => ({
        ...d,
        live: d.online && d.lastFixAt != null && now - d.lastFixAt < LIVE_WINDOW_MS,
      })),
    [devices, now]
  );

  const stats = useMemo(() => {
    const total = rows.length;
    const live = rows.filter((d) => d.live).length;
    return { total, live, idle: total - live };
  }, [rows]);

  return (
    <ResponsiveLayout>
      {/* Hero band. The hairline grid is the one "technical" texture in the
          system and is confined here, where it frames rather than distracts. */}
      <div className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-6 px-4 sm:px-6 pt-6 pb-5 border-b border-line overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden />

        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-content">{t("dashboard.overview")}</h1>
            <p className="text-sm text-content-muted mt-1">{t("real.time.monitoring")}</p>
          </div>

          <Link to="/activate" className="shrink-0">
            <Button icon={<PlusCircle className="w-4 h-4" />}>{t("add.new.device")}</Button>
          </Link>
        </div>
      </div>

      {/* Installing is what makes push notifications reliable — on iOS it is
          the only way they work at all — so the prompt sits on the landing
          page rather than buried in settings. */}
      <InstallPrompt />

      {/* KPI row. One number each — a tile reads faster than a one-bar chart. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 stagger">
        <StatTile
          label={t("total.devices")}
          value={stats.total}
          icon={<Cpu className="w-[18px] h-[18px]" />}
          accent="series-1"
          loading={loading}
        />
        <StatTile
          label={t("online.devices")}
          value={stats.live}
          icon={<Wifi className="w-[18px] h-[18px]" />}
          accent="status-good"
          loading={loading}
          live={stats.live > 0}
          hint={`reporting within ${LIVE_WINDOW_MS / 1000}s`}
        />
        <StatTile
          label={t("offline.devices")}
          value={stats.idle}
          icon={<Radio className="w-[18px] h-[18px]" />}
          accent="series-2"
          loading={loading}
        />
        <StatTile
          label={t("active.today")}
          value={rows.filter((d) => d.lastFixAt).length}
          icon={<Activity className="w-[18px] h-[18px]" />}
          accent="series-3"
          loading={loading}
        />
      </div>

      <div className="flex items-center justify-between mb-3 min-h-[1.75rem]">
        <h2 className="text-title font-semibold text-content">{t("your.devices")}</h2>

        {/* One meaningful sentence, not a bare number: a live region that
            announces "2 of 3 devices reporting" instead of "2". */}
        {!loading && rows.length > 0 && (
          <span role="status" aria-atomic="true" className="text-xs text-content-muted tnum">
            {stats.live} of {stats.total} devices reporting
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-28 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3 mb-4" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Cpu className="w-6 h-6" />}
            title={t("no.devices.yet")}
            description="Activate a tracker with its serial number and secret to start seeing it here."
            action={
              <Link to="/activate">
                <Button icon={<PlusCircle className="w-4 h-4" />}>{t("add.new.device")}</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {rows.map((device) => (
            <DeviceCard key={device.serial} device={device} t={t} />
          ))}
        </div>
      )}
    </ResponsiveLayout>
  );
}

/* ------------------------------------------------------------------------ */

function DeviceCard({ device, t }: { device: DeviceRow & { live: boolean }; t: (k: string) => string }) {
  const loc = device.location;
  const battery = typeof loc?.battery === "number" ? loc.battery : null;
  const csq = typeof loc?.csq === "number" ? loc.csq : null;
  const sats = loc?.sat ?? loc?.satellites ?? null;
  const battTone = batteryTone(battery);
  const displayName = device.name?.trim() || device.serial;

  // The rail colour is the one place status is visible at a glance before
  // reading anything — critical battery outranks "live", since a dying
  // tracker is the more urgent thing to notice.
  const railTone = battTone === "critical" ? "bg-status-critical" : device.live ? "bg-status-good" : "bg-content-muted/30";

  return (
    <Link to={`/device/${device.serial}`} className="group block cursor-pointer">
      <Card
        flush
        className={cx(
          "h-full relative overflow-hidden transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:border-brand/40",
          device.live && "shadow-glow-good"
        )}
      >
        <span className={cx("absolute inset-x-0 top-0 h-1", railTone)} aria-hidden />

        <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="font-semibold text-content truncate">{displayName}</p>
            <p className="text-xs text-content-muted font-mono mt-0.5 truncate">
              {device.name?.trim() ? device.serial : (device.lastFixAt ? new Date(device.lastFixAt).toLocaleTimeString() : t("no.data.yet"))}
            </p>
          </div>

          {/* Dot + word: status is never carried by colour alone. */}
          <Badge tone={device.live ? "good" : "neutral"} icon={<StatusDot tone={device.live ? "good" : "neutral"} pulse={device.live} />}>
            {device.live ? "Live" : "Idle"}
          </Badge>
        </div>

        {loc ? (
          <>
            <div className="flex items-center gap-2 text-sm text-content-secondary mb-4">
              <MapPin className="w-4 h-4 text-content-muted shrink-0" />
              <span className="font-mono text-xs truncate">
                {loc.lat?.toFixed(5)}, {loc.lng?.toFixed(5)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Metric icon={<Gauge className="w-3.5 h-3.5" />} label={t("speed")} value={`${loc.speed ?? 0} km/h`} />
              <Metric icon={<Satellite className="w-3.5 h-3.5" />} label={t("satellites")} value={sats ?? "—"} />
              <Metric icon={<Signal className="w-3.5 h-3.5" />} label={t("signal")} value={csq != null ? `${csq}/31` : "—"} />
              <Metric
                icon={<BatteryMedium className="w-3.5 h-3.5" />}
                label={t("battery")}
                value={battery != null ? `${battery.toFixed(1)}V` : "—"}
                tone={batteryTone(battery)}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-content-muted py-6 text-center">{t("no.data.yet")}</p>
        )}
        </div>
      </Card>
    </Link>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "good" | "warning" | "critical";
}) {
  const toneClass =
    tone === "critical"
      ? "text-status-critical"
      : tone === "warning"
      ? "text-status-warning"
      : "text-content";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-content-muted mb-0.5">
        {icon}
        <span className="text-xs truncate">{label}</span>
      </div>
      <p className={cx("text-sm font-semibold truncate tnum", toneClass)}>{value}</p>
    </div>
  );
}

/** 12 V lead-acid thresholds: below ~11.8 V the battery is effectively flat. */
function batteryTone(v: number | null): "good" | "warning" | "critical" | undefined {
  if (v == null) return undefined;
  if (v >= 12.4) return "good";
  if (v >= 11.8) return "warning";
  return "critical";
}
