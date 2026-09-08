import { useMemo } from "react";

import type { TrackPoint, TrackSummary } from "../../api/devices";
import { useLanguage } from "../../context/LanguageContext";

/*
Speed profile.

A compact chart of reported speed across the selected range, with the max and
average marked. It reuses the track points the history page already loaded, so
it costs no extra request.

The line is a single series in one hue — a speed trace has nothing to compare
against, so the palette rules about adjacent-series contrast do not apply. The
numbers above the chart carry the meaning; the shape is context.
*/

interface Props {
  points: TrackPoint[];
  summary?: TrackSummary;
}

// Chart geometry, in SVG user units. The SVG scales to its container width.
const W = 600;
const H = 160;
const PAD = 10;

// A parked vehicle can report thousands of near-identical points. The trace
// only needs enough vertices to show the shape.
const MAX_VERTICES = 240;

export default function SpeedProfile({ points, summary }: Props) {
  const { t } = useLanguage();

  const model = useMemo(() => {
    const speeds = points.map((p) => (typeof p.speed === "number" ? p.speed : 0));
    if (speeds.length < 2) return null;

    const maxSpeed = Math.max(...speeds);
    const moving = speeds.filter((s) => s > 0);
    const avgSpeed =
      summary?.avg_moving_speed ??
      (moving.length ? Math.round(moving.reduce((a, b) => a + b, 0) / moving.length) : 0);

    // Scale ceiling: never divide by zero, and give the peak a little headroom.
    const ceiling = Math.max(maxSpeed, 1) * 1.1;

    const step = Math.max(1, Math.ceil(speeds.length / MAX_VERTICES));
    const sampled: number[] = [];
    for (let i = 0; i < speeds.length; i += step) sampled.push(speeds[i]);
    if (sampled[sampled.length - 1] !== speeds[speeds.length - 1]) {
      sampled.push(speeds[speeds.length - 1]);
    }

    const x = (i: number) => PAD + (i / (sampled.length - 1)) * (W - 2 * PAD);
    const y = (v: number) => H - PAD - (v / ceiling) * (H - 2 * PAD);

    const line = sampled
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
    const area = `${line} L${x(sampled.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

    return {
      maxSpeed,
      avgSpeed,
      line,
      area,
      avgY: y(avgSpeed),
      first: points[0]?.recorded_at,
      last: points[points.length - 1]?.recorded_at,
    };
  }, [points, summary]);

  if (!model) return null;

  return (
    <div className="bg-surface rounded-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-line bg-surface-sunken">
        <h2 className="font-semibold text-content">{t("history.speed.profile")}</h2>
        <p className="text-xs text-content-muted mt-0.5">{t("history.speed.profile.subtitle")}</p>
      </div>

      <div className="p-4">
        <div className="flex items-baseline gap-6 mb-3">
          <div>
            <p className="text-xs text-content-muted">{t("history.summary.max.speed")}</p>
            <p className="text-lg font-bold text-content tnum">
              {model.maxSpeed} {t("unit.kmh")}
            </p>
          </div>
          <div>
            <p className="text-xs text-content-muted">{t("history.speed.avg")}</p>
            <p className="text-lg font-bold text-content tnum">
              {model.avgSpeed} {t("unit.kmh")}
            </p>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-40"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("history.speed.profile.aria")}
        >
          <path d={model.area} className="fill-series-1/10" />
          <path
            d={model.line}
            className="fill-none stroke-series-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Average line. Dashed so it reads as a reference, not another trace. */}
          <line
            x1={PAD}
            x2={W - PAD}
            y1={model.avgY}
            y2={model.avgY}
            className="stroke-content-muted"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="flex justify-between text-[11px] text-content-muted mt-1 tnum">
          <span>{model.first ? new Date(model.first).toLocaleTimeString() : ""}</span>
          <span>{model.last ? new Date(model.last).toLocaleTimeString() : ""}</span>
        </div>
      </div>
    </div>
  );
}
