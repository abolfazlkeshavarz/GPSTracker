import { useEffect, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Map as MapIcon, RotateCcw } from "lucide-react";

import api from "../../api/axios";
import { useLanguage } from "../../context/LanguageContext";
import { Button, Input } from "../ui";

/*
Platform settings (admin only): the map server used by the web dashboard
(MapLibre style.json) and by the mobile apps (raster tile template). Saved
through PUT /api/admin/app-config; clients pick the change up on next start,
so moving the map server needs no rebuild of either client.
*/

interface Config {
  map_style_url: string;
  map_tile_url: string;
  map_attribution: string;
  configured?: string;
}

const KEYS = ["map_style_url", "map_tile_url", "map_attribution"] as const;

export default function PlatformSettings() {
  const { t } = useLanguage();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/admin/app-config")
      .then((r) => {
        setCfg(r.data);
        setDraft({ map_style_url: r.data.map_style_url, map_tile_url: r.data.map_tile_url, map_attribution: r.data.map_attribution });
      })
      .catch(() => toast.error(t("admin.config.load.failed")));
  }, [t]);

  const save = async (body: Record<string, string>) => {
    setSaving(true);
    try {
      const r = await api.put("/admin/app-config", body);
      setCfg(r.data);
      setDraft({ map_style_url: r.data.map_style_url, map_tile_url: r.data.map_tile_url, map_attribution: r.data.map_attribution });
      toast.success(t("admin.config.saved"));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || t("admin.config.save.failed"));
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const changed: Record<string, string> = {};
    for (const k of KEYS) if (cfg && draft[k] !== cfg[k]) changed[k] = draft[k] ?? "";
    if (Object.keys(changed).length) save(changed);
  };

  const configured = (cfg?.configured ?? "").split(",").filter(Boolean);

  if (!cfg) return <p className="text-sm text-content-muted">{t("loading")}</p>;

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-control bg-brand-subtle text-brand-ink shrink-0">
          <MapIcon className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-semibold text-content">{t("admin.config.map.title")}</h3>
          <p className="text-sm text-content-muted">{t("admin.config.map.hint")}</p>
        </div>
      </div>

      <Field
        label={t("admin.config.style")}
        hint={t("admin.config.style.hint")}
        value={draft.map_style_url ?? ""}
        custom={configured.includes("map_style_url")}
        onChange={(v) => setDraft((d) => ({ ...d, map_style_url: v }))}
      />
      <Field
        label={t("admin.config.tiles")}
        hint={t("admin.config.tiles.hint")}
        value={draft.map_tile_url ?? ""}
        custom={configured.includes("map_tile_url")}
        onChange={(v) => setDraft((d) => ({ ...d, map_tile_url: v }))}
      />
      <Field
        label={t("admin.config.attribution")}
        value={draft.map_attribution ?? ""}
        custom={configured.includes("map_attribution")}
        onChange={(v) => setDraft((d) => ({ ...d, map_attribution: v }))}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || configured.length === 0}
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={() => save({ map_style_url: "", map_tile_url: "", map_attribution: "" })}
        >
          {t("admin.config.reset")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  value,
  custom,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  custom: boolean;
  onChange: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-content">{label}</span>
        <span className="text-xs text-content-muted">{custom ? t("admin.config.custom") : t("admin.config.default")}</span>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" spellCheck={false} aria-label={label} />
      {hint && <p className="text-xs text-content-muted mt-1">{hint}</p>}
    </div>
  );
}
