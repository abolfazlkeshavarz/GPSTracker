import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import HistoryMap from "../components/map/HistoryMap";
import { getTrack, type TrackResponse } from "../api/devices";
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
  { key: "today", label: "Today", from: () => toDateInput(new Date()), to: () => toDateInput(new Date()) },
  { key: "yesterday", label: "Yesterday", from: () => daysAgo(1), to: () => daysAgo(1) },
  { key: "7d", label: "Last 7 days", from: () => daysAgo(6), to: () => toDateInput(new Date()) },
  { key: "30d", label: "Last 30 days", from: () => daysAgo(29), to: () => toDateInput(new Date()) },
];

// Minimum dwell before a pause counts as a stop. Matches the backend default.
const STOP_THRESHOLDS = [
  { label: "1 min", value: 60 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "15 min", value: 900 },
];

export default function DeviceHistory() {
  const { serial } = useParams();
  const { isRTL } = useLanguage();

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
      setError("The start date must not be after the end date.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setFocusedStop(null);

      const data = await getTrack(serial, from, to, { minStopSeconds: minStop });
      setTrack(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not load history for this range.");
      setTrack(null);
    } finally {
      setLoading(false);
    }
  }, [serial, from, to, minStop]);

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

  return (
    <ResponsiveLayout>
      <div className={isRTL ? "text-right" : ""}>
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <Link
              to={`/device/${serial}`}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to device
            </Link>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Movement History
            </h1>
            <p className="text-gray-500 mt-1 font-mono text-sm">{serial}</p>
          </div>
        </div>

        {/* Range picker */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((p) => {
              const active = from === p.from() && to === p.to();
              return (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                From
              </label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                To
              </label>
              <input
                type="date"
                value={to}
                min={from}
                max={toDateInput(new Date())}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <ParkingCircle className="w-4 h-4 inline mr-1" />
                Count as a stop after
              </label>
              <select
                value={minStop}
                onChange={(e) => setMinStop(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {STOP_THRESHOLDS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
              {loading ? "Loading..." : "Apply"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {track?.truncated && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              This range holds more points than can be shown at once. The track is
              cut short — narrow the range to see all of it.
            </div>
          )}
        </div>

        {/* Summary */}
        {summary && hasPoints && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <SummaryCard
              icon={<Route className="w-5 h-5 text-blue-600" />}
              label="Distance"
              value={`${summary.distance_km} km`}
              tone="bg-blue-100"
            />
            <SummaryCard
              icon={<Clock className="w-5 h-5 text-indigo-600" />}
              label="Driving"
              value={summary.moving_duration}
              tone="bg-indigo-100"
            />
            <SummaryCard
              icon={<ParkingCircle className="w-5 h-5 text-amber-600" />}
              label="Stopped"
              value={summary.stopped_duration}
              tone="bg-amber-100"
            />
            <SummaryCard
              icon={<Gauge className="w-5 h-5 text-green-600" />}
              label="Max speed"
              value={`${summary.max_speed} km/h`}
              tone="bg-green-100"
            />
            <SummaryCard
              icon={<MapPin className="w-5 h-5 text-purple-600" />}
              label="Stops"
              value={String(summary.stop_count)}
              tone="bg-purple-100"
            />
          </div>
        )}

        {/* Map + stop timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
              <h2 className="font-semibold text-gray-800">Route</h2>
            </div>
            <div className="h-[540px] relative">
              {!hasPoints && !loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-center p-6">
                  <div>
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No movement recorded</p>
                    <p className="text-gray-400 text-sm mt-1">
                      This device reported nothing between these dates.
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

          {/* Stops */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-amber-50">
              <h2 className="font-semibold text-gray-800">
                Stops {track ? `(${track.stops.length})` : ""}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Where the vehicle stayed put, and for how long
              </p>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[540px] p-4 space-y-3">
              {!track?.stops.length ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {hasPoints
                    ? "No stops longer than the selected threshold."
                    : "Nothing to show yet."}
                </p>
              ) : (
                track.stops.map((stop, i) => (
                  <button
                    key={`${stop.arrived_at}-${i}`}
                    onClick={() => setFocusedStop(i)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      focusedStop === i
                        ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                        : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-gray-800">{stop.duration}</span>
                          <span className="text-xs text-gray-400">
                            {stop.point_count} pts
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {new Date(stop.arrived_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          until {new Date(stop.departed_at).toLocaleTimeString()}
                        </p>
                        <p className="text-[11px] text-gray-400 font-mono mt-1">
                          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
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
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-gray-500 text-xs">{label}</p>
          <p className="text-xl font-bold text-gray-800 truncate">{value}</p>
        </div>
        <div className={`p-2 rounded-xl ${tone} flex-shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}
