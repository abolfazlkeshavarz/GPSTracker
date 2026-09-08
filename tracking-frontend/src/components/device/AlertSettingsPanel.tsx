import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BellOff, SlidersHorizontal } from "lucide-react";

import {
  getDeviceSettings,
  updateDeviceSettings,
  type DeviceSettings,
} from "../../api/devices";
import { useLanguage } from "../../context/LanguageContext";
import { Card, CardHeader, Skeleton, cx } from "../ui";

/*
The configurator.

Each switch maps one-to-one onto a rule in the alert engine, and saves on
change rather than behind a Save button — a settings screen that silently
discards changes when someone navigates away is worse than one that is a beat
slower.

The optimistic update is deliberate: the switch moves immediately and rolls
back on failure. A toggle that waits 300ms for a round-trip feels broken.
*/

interface Props {
  serial: string;
}

type ToggleKey = Extract<
  keyof DeviceSettings,
  | "alert_overspeed"
  | "alert_ignition"
  | "alert_tow"
  | "alert_impact"
  | "alert_harsh_driving"
  | "alert_power_cut"
  | "alert_jamming"
  | "alert_low_battery"
  | "alert_geofence"
  | "alert_offline"
  | "silent_mode"
>;

const RULES: { key: ToggleKey; labelKey: string; hintKey: string }[] = [
  { key: "alert_tow", labelKey: "cfg.tow", hintKey: "cfg.tow.hint" },
  { key: "alert_power_cut", labelKey: "cfg.power", hintKey: "cfg.power.hint" },
  { key: "alert_impact", labelKey: "cfg.impact", hintKey: "cfg.impact.hint" },
  { key: "alert_jamming", labelKey: "cfg.jamming", hintKey: "cfg.jamming.hint" },
  { key: "alert_overspeed", labelKey: "cfg.overspeed", hintKey: "cfg.overspeed.hint" },
  { key: "alert_harsh_driving", labelKey: "cfg.harsh", hintKey: "cfg.harsh.hint" },
  { key: "alert_ignition", labelKey: "cfg.ignition", hintKey: "cfg.ignition.hint" },
  { key: "alert_geofence", labelKey: "cfg.geofence", hintKey: "cfg.geofence.hint" },
  { key: "alert_low_battery", labelKey: "cfg.battery", hintKey: "cfg.battery.hint" },
  { key: "alert_offline", labelKey: "cfg.offline", hintKey: "cfg.offline.hint" },
];

export default function AlertSettingsPanel({ serial }: Props) {
  const { t } = useLanguage();

  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [limitDraft, setLimitDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getDeviceSettings(serial);
      setSettings(data);
      setLimitDraft(String(data.speed_limit_kmh));
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (change: Partial<DeviceSettings>) => {
    if (!settings) return;

    const previous = settings;
    setSettings({ ...settings, ...change });

    try {
      const saved = await updateDeviceSettings(serial, change);
      setSettings(saved);
    } catch {
      setSettings(previous);
      toast.error(t("cfg.save.failed"));
    }
  };

  const commitSpeedLimit = async () => {
    const value = Number(limitDraft);

    if (!Number.isFinite(value) || value < 0 || value > 300) {
      setLimitDraft(String(settings?.speed_limit_kmh ?? 0));
      return;
    }
    if (value === settings?.speed_limit_kmh) return;

    await patch({ speed_limit_kmh: value });
  };

  if (loading) {
    return (
      <Card flush>
        <CardHeader title={t("cfg.title")} subtitle={t("cfg.subtitle")} />
        <div className="p-5 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!settings) return null;

  return (
    <Card flush>
      <CardHeader
        title={t("cfg.title")}
        subtitle={t("cfg.subtitle")}
        action={<SlidersHorizontal className="w-4 h-4 text-content-muted" />}
      />

      <div className="p-5 space-y-5">
        {/* Speed limit: a number, not a switch, and 0 means "no limit" rather
            than "limit of zero" — stated in the hint because that is not
            guessable from an empty-looking field. */}
        <div>
          <label
            htmlFor={`speed-limit-${serial}`}
            className="block text-sm font-medium text-content mb-1"
          >
            {t("cfg.speed.limit")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`speed-limit-${serial}`}
              type="number"
              min={0}
              max={300}
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={commitSpeedLimit}
              className="h-9 w-24 px-2.5 rounded-control bg-surface border border-line text-content text-sm tnum focus:border-brand transition-colors"
            />
            <span className="text-sm text-content-muted">{t("unit.kmh")}</span>
          </div>
          <p className="text-xs text-content-muted mt-1">{t("cfg.speed.limit.hint")}</p>
        </div>

        {/* Silent mode sits apart from the rules: it does not change what is
            detected, only whether the phone makes a noise about it. */}
        <div className="rounded-control border border-line p-3">
          <Toggle
            checked={settings.silent_mode}
            onChange={(v) => patch({ silent_mode: v })}
            label={
              <span className="inline-flex items-center gap-1.5">
                <BellOff className="w-3.5 h-3.5" />
                {t("cfg.silent")}
              </span>
            }
            hint={t("cfg.silent.hint")}
          />
        </div>

        <div className="space-y-1">
          <p className="text-label font-semibold uppercase text-content-muted mb-2">
            {t("cfg.rules")}
          </p>
          {RULES.map((rule) => (
            <Toggle
              key={rule.key}
              checked={settings[rule.key] as boolean}
              onChange={(v) => patch({ [rule.key]: v } as Partial<DeviceSettings>)}
              label={t(rule.labelKey)}
              hint={t(rule.hintKey)}
            />
          ))}
        </div>

        <p className="text-xs text-content-muted border-t border-line pt-3">
          {t("cfg.sos.note")}
        </p>
      </div>
    </Card>
  );
}

/**
 * A switch.
 *
 * Built on a real checkbox rather than a styled div: it stays keyboard
 * operable, announces its state, and works with the label association that
 * screen readers rely on.
 */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-3 py-2 cursor-pointer group">
      <span className="min-w-0">
        <span className="block text-sm text-content group-hover:text-content">{label}</span>
        {hint && <span className="block text-xs text-content-muted mt-0.5">{hint}</span>}
      </span>

      <span className="relative shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cx(
            "block w-10 h-6 rounded-full transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2",
            checked ? "bg-brand" : "bg-surface-sunken border border-line"
          )}
          aria-hidden
        />
        <span
          className={cx(
            "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "start-5" : "start-1"
          )}
          aria-hidden
        />
      </span>
    </label>
  );
}
