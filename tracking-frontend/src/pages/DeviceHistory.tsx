import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import HistoryMap from "../components/map/HistoryMap";
import { getTrack, type TrackResponse } from "../api/devices";
import SpeedProfile from "../components/device/SpeedProfile";
import { useLanguage } from "../context/LanguageContext";
import {
  Calendar,
  Clock,
  MapPin,
  Route,
  Gauge,
  ParkingCircle,
  AlertCircle,
  ArrowLeft,
  Loader2,
  History,
} from "lucide-react";

/** Local YYYY-MM-DD. toISOString() would shift the date across timezones. */
const toDateInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
};

const PRESETS = [
  { key: "today", labelKey: "history.preset.today", from: () => toDateInput(new Date()), to: () => toDateInput(new Date()) },
  { key: "yesterday", labelKey: "history.preset.yesterday", from: () => daysAgo(1), to: () => daysAgo(1) },
  { key: "7d", labelKey: "history.preset.7d", from: () => daysAgo(6), to: () => toDateInput(new Date()) },
  { key: "30d", labelKey: "history.preset.30d", from: () => daysAgo(29), to: () => toDateInput(new Date()) },
];

// Minimum dwell before a pause counts as a stop. Matches the backend default.
const STOP_THRESHOLDS = [
  { labelKey: "history.stop.1min", value: 60 },
  { labelKey: "history.stop.3min", value: 180 },
  { labelKey: "history.stop.5min", value: 300 },
  { labelKey: "history.stop.15min", value: 900 },
];

export default function DeviceHistory() {
  const { serial } = useParams();
  const { isRTL, t } = useLanguage();

  const [from, setFrom] = useState(daysAgo(1));
  const [to, setTo] = useState(toDateInput(new Date()));
  const [minStop, setMinStop] = useState(180);

  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedStop, setFocusedStop] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!serial) return;

    if (from > to) {
      setError(t("history.error.date.range"));
      return;
    }

    try {
      setLoading(true);
      setError("");
      setFocusedStop(null);

      const data = await getTrack(serial, from, to, { minStopSeconds: minStop });
      setTrack(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t("history.error.load"));
      setTrack(null);
    } finally {
      setLoading(false);
    }
  }, [serial, from, to, minStop, t]);

  // Load once on mount; afterwards the user drives it with Apply.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setFrom(preset.from());
    setTo(preset.to());
  };

  const summary = track?.summary;
  const hasPoints = (track?.points.length ?? 0) > 0;
  const backfilled = track?.points.filter((p) => p.is_backfill).length ?? 0;

  return (
    <ResponsiveLayout>
      <div className={isRTL ? "text-right" : ""}>
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <Link
              to={`/device/${serial}`}
              className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-hover mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("history.back")}
            </Link>
            <h1 className="text-3xl font-bold text-content">
              {t("history.title")}
            </h1>
            <p className="text-content-muted mt-1 font-mono text-sm">{serial}</p>
          </div>
        </div>

        {/* Range picker */}
        <div className="bg-surface rounded-card shadow-sm p-5 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((p) => {
              const active = from === p.from() && to === p.to();
              return (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded-control text-sm font-medium transition ${
                    active
                      ? "bg-brand text-white"
                      : "bg-surface-sunken text-content-secondary hover:bg-surface-sunken"
                  }`}
                >
                  {t(p.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                {t("history.from")}
              </label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                {t("history.to")}
              </label>
              <input
                type="date"
                value={to}
                min={from}
                max={toDateInput(new Date())}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                <ParkingCircle className="w-4 h-4 inline mr-1" />
                {t("history.stop.after")}
              </label>
              <select
                value={minStop}
                onChange={(e) => setMinStop(Number(e.target.value))}
                className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
              >
                {STOP_THRESHOLDS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="w-full bg-brand text-white py-2 rounded-control font-semibold hover:shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
              {loading ? t("history.loading") : t("history.apply")}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-status-critical-bg border border-status-critical/25 text-status-critical rounded-control text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {track?.truncated && (
            <div className="mt-4 p-3 bg-status-warning-bg border border-status-warning/25 text-status-warning rounded-control text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {t("history.truncated")}
            </div>
          )}
        </div>

        {/* Summary */}
        {summary && hasPoints && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <SummaryCard
              icon={<Route className="w-5 h-5 text-brand" />}
              label={t("history.summary.distance")}
              value={`${summary.distance_km} ${t("unit.km")}`}
              tone="bg-series-1/10"
            />
            <SummaryCard
              icon={<Clock className="w-5 h-5 text-series-6" />}
              label={t("history.summary.driving")}
              value={summary.moving_duration}
              tone="bg-series-6/10"
            />
            <SummaryCard
              icon={<ParkingCircle className="w-5 h-5 text-status-warning" />}
              label={t("history.summary.stopped")}
              value={summary.stopped_duration}
              tone="bg-status-warning/10"
            />
            <SummaryCard
              icon={<Gauge className="w-5 h-5 text-status-good" />}
              label={t("history.summary.max.speed")}
              value={`${summary.max_speed} ${t("unit.kmh")}`}
              tone="bg-status-good/10"
            />
            <SummaryCard
              icon={<MapPin className="w-5 h-5 text-series-6" />}
              label={t("history.summary.stops")}
              value={String(summary.stop_count)}
              tone="bg-series-6/10"
            />
          </div>
        )}

        {/* Gap-free tracking: say so when part of this range was recovered
            rather than received live, so nobody wonders why the map filled in
            after the fact. */}
        {backfilled > 0 && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-control bg-brand-subtle border border-brand/20 text-sm">
            <History className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <span className="text-content-secondary">
              <strong className="text-brand-ink">{backfilled}</strong>{" "}
              {t("history.backfill.body").replace("{total}", String(track?.points.length ?? 0))}
            </span>
          </div>
        )}

        {/* Map + stop timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface rounded-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-line bg-surface-sunken">
              <h2 className="font-semibold text-content">{t("history.route")}</h2>
            </div>
            <div className="h-[540px] relative">
              {!hasPoints && !loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-center p-6">
                  <div>
                    <MapPin className="w-12 h-12 text-content-muted mx-auto mb-3" />
                    <p className="text-content-muted font-medium">{t("history.no.movement")}</p>
                    <p className="text-content-muted text-sm mt-1">
                      {t("history.no.movement.hint")}
                    </p>
                  </div>
                </div>
              ) : (
                <HistoryMap
                  points={track?.points ?? []}
                  stops={track?.stops ?? []}
                  focusedStopIndex={focusedStop}
                  onStopClick={setFocusedStop}
                />
              )}
            </div>
          </div>

          {/* Stops + speed profile */}
          <div className="space-y-4">
          <div className="bg-surface rounded-card shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-line bg-surface-sunken">
              <h2 className="font-semibold text-content">
                {t("history.summary.stops")} {track ? `(${track.stops.length})` : ""}
              </h2>
              <p className="text-xs text-content-muted mt-0.5">
                {t("history.stops.subtitle")}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[540px] p-4 space-y-3">
              {!track?.stops.length ? (
                <p className="text-sm text-content-muted text-center py-8">
                  {hasPoints
                    ? t("history.no.stops.threshold")
                    : t("history.nothing.yet")}
                </p>
              ) : (
                track.stops.map((stop, i) => (
                  <button
                    key={`${stop.arrived_at}-${i}`}
                    onClick={() => setFocusedStop(i)}
                    className={`w-full text-left p-3 rounded-control border transition ${
                      focusedStop === i
                        ? "border-status-warning bg-status-warning-bg ring-2 ring-status-warning/30"
                        : "border-line hover:border-status-warning/40 hover:bg-status-warning-bg/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-status-warning text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-content">{stop.duration}</span>
                          <span className="text-xs text-content-muted">
                            {stop.point_count} {t("history.points.short")}
                          </span>
                        </div>
                        <p className="text-xs text-content-secondary mt-1">
                          {new Date(stop.arrived_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-content-muted">
                          {t("history.until")} {new Date(stop.departed_at).toLocaleTimeString()}
                        </p>
                        <p className="text-[11px] text-content-muted font-mono mt-1">
                          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

            {hasPoints && (
              <SpeedProfile points={track?.points ?? []} summary={summary} />
            )}
          </div>
        </div>
      </div>
    </ResponsiveLayout>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-surface rounded-card shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-content-muted text-xs">{label}</p>
          <p className="text-xl font-bold text-content truncate">{value}</p>
        </div>
        <div className={`p-2 rounded-control ${tone} flex-shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}
