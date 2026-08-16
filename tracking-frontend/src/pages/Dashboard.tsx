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
  PageHeading,
  Skeleton,
  StatTile,
  StatusDot,
  cx,
} from "../components/ui";

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
      <PageHeading
        title={t("dashboard.overview")}
        subtitle={t("real.time.monitoring")}
        actions={
          <Link to="/activate">
            <Button icon={<PlusCircle className="w-4 h-4" />}>{t("add.new.device")}</Button>
          </Link>
        }
      />

      {/* KPI row. One number each — a tile reads faster than a one-bar chart. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
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

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-content">{t("your.devices")}</h2>
        {!loading && rows.length > 0 && (
          <span className="text-xs text-content-muted">
            {stats.live} / {stats.total} live
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

  return (
    <Link to={`/device/${device.serial}`} className="group block">
      <Card className="h-full transition-all group-hover:shadow-md group-hover:border-line-strong">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="font-semibold text-content font-mono text-sm truncate">{device.serial}</p>
            <p className="text-xs text-content-muted mt-0.5">
              {device.lastFixAt ? new Date(device.lastFixAt).toLocaleTimeString() : t("no.data.yet")}
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
      <p className={cx("text-sm font-semibold truncate", toneClass)}>{value}</p>
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
