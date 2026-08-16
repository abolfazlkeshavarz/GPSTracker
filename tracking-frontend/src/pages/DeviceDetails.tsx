import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BatteryMedium,
  Clock,
  Gauge,
  History,
  MapPin,
  Navigation,
  Satellite,
  Signal,
  Zap,
} from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import LiveMap from "../components/map/LiveMap";
import { useLanguage } from "../context/LanguageContext";
import { useDeviceUpdates } from "../context/RealtimeContext";
import { getLatestLocation } from "../api/devices";
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
        title={t("device.details")}
        subtitle={serial}
        actions={
          <>
            <Badge tone={live ? "good" : "neutral"} icon={<StatusDot tone={live ? "good" : "neutral"} pulse={live} />}>
              {live ? t("live.updates") : "Idle"}
            </Badge>
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
        </div>
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
