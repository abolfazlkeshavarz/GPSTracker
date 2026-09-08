import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Battery,
  BellOff,
  BellRing,
  CalendarClock,
  CalendarX,
  CheckCheck,
  Gauge,
  KeyRound,
  LogIn,
  LogOut,
  Plug,
  Power,
  RadioTower,
  RotateCw,
  Siren,
  TrendingDown,
  TrendingUp,
  Truck,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";

import ResponsiveLayout from "../components/layout/ResponsiveLayout";
import { useLanguage } from "../context/LanguageContext";
import { useAlertUpdates } from "../context/RealtimeContext";
import {
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
  type Alert,
  type AlertKind,
  type AlertSeverity,
} from "../api/alerts";
import { useAlertCountStore } from "../store/alertCountStore";
import { Button, Card, EmptyState, PageHeading, Skeleton, cx } from "../components/ui";

// Exhaustive by construction: a new kind added to AlertKind will not compile
// until it has an icon here, which stops one shipping as a blank row.
const KIND_ICON: Record<AlertKind, React.ReactNode> = {
  geofence_enter: <LogIn className="w-4 h-4" />,
  geofence_exit: <LogOut className="w-4 h-4" />,
  low_battery: <Battery className="w-4 h-4" />,
  offline: <WifiOff className="w-4 h-4" />,
  back_online: <Wifi className="w-4 h-4" />,
  overspeed: <Gauge className="w-4 h-4" />,
  ignition_on: <KeyRound className="w-4 h-4" />,
  ignition_off: <Power className="w-4 h-4" />,
  tow: <Truck className="w-4 h-4" />,
  impact: <Siren className="w-4 h-4" />,
  harsh_accel: <TrendingUp className="w-4 h-4" />,
  harsh_brake: <TrendingDown className="w-4 h-4" />,
  harsh_corner: <RotateCw className="w-4 h-4" />,
  power_cut: <Unplug className="w-4 h-4" />,
  power_restored: <Plug className="w-4 h-4" />,
  jamming: <RadioTower className="w-4 h-4" />,
  sos: <Siren className="w-4 h-4" />,
  subscription_expiring: <CalendarClock className="w-4 h-4" />,
  subscription_expired: <CalendarX className="w-4 h-4" />,
};

// Tone comes from the server's severity, not from a second local map: two maps
// of the same thing drift, and this one decides how alarming a row looks.
const SEVERITY_TONE: Record<AlertSeverity, "brand" | "warning" | "critical"> = {
  info: "brand",
  warning: "warning",
  critical: "critical",
};

const KIND_ICON_CLASSES: Record<"good" | "warning" | "critical" | "brand", string> = {
  good: "bg-status-good/10 text-status-good",
  warning: "bg-status-warning/10 text-status-warning",
  critical: "bg-status-critical/10 text-status-critical",
  brand: "bg-brand-subtle text-brand-ink",
};

export default function Alerts() {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");
  // Shared with the sidebar badge (AppLayout) so marking something read here
  // updates it immediately, without waiting for a navigation to resync.
  const unreadCount = useAlertCountStore((s) => s.unreadCount);
  const setUnreadCount = useAlertCountStore((s) => s.setCount);
  const incrementUnread = useAlertCountStore((s) => s.increment);
  const decrementUnread = useAlertCountStore((s) => s.decrement);

  const load = useCallback(async (which: "all" | "unread" | "critical") => {
    setLoading(true);
    try {
      const data = await listAlerts({
        unreadOnly: which === "unread",
        severity: which === "critical" ? "critical" : undefined,
        limit: 100,
      });
      setAlerts(data.alerts);
      setUnreadCount(data.unread_count);
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useEffect(() => {
    load(filter);
  }, [load, filter]);

  // Live alerts land here the instant they fire, without a manual refresh.
  useAlertUpdates((incoming) => {
    incrementUnread();

    const severity = (incoming.severity as AlertSeverity) || "info";

    // The critical tab must not fill up with routine events arriving live.
    if (filter === "critical" && severity !== "critical") return;

    setAlerts((prev) => [
      {
        id: incoming.id,
        device_serial: incoming.device_serial,
        kind: incoming.kind as AlertKind,
        severity,
        title: incoming.title,
        detail: incoming.detail,
        lat: incoming.lat,
        lng: incoming.lng,
        is_read: false,
        created_at: incoming.created_at,
      },
      // Guard against a double-insert when the same alert also arrives from a
      // refetch racing the socket.
      ...prev.filter((a) => a.id !== incoming.id),
    ]);
  });

  const handleMarkRead = async (id: number) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    decrementUnread();
    try {
      await markAlertRead(id);
    } catch {
      load(filter);
    }
  };

  const handleMarkAllRead = async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    setUnreadCount(0);
    try {
      await markAllAlertsRead();
    } catch {
      load(filter);
    }
  };

  const visible = useMemo(() => {
    if (filter === "unread") return alerts.filter((a) => !a.is_read);
    if (filter === "critical") return alerts.filter((a) => a.severity === "critical");
    return alerts;
  }, [alerts, filter]);

  return (
    <ResponsiveLayout>
      <PageHeading
        title={t("alerts")}
        subtitle={t("alerts.subtitle")}
        actions={
          unreadCount > 0 ? (
            <Button variant="secondary" size="sm" icon={<CheckCheck className="w-4 h-4" />} onClick={handleMarkAllRead}>
              {t("mark.all.read")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          {t("all")}
        </FilterTab>
        <FilterTab active={filter === "unread"} onClick={() => setFilter("unread")}>
          {t("unread")}
          {unreadCount > 0 && (
            <span className="ms-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-brand text-white text-[10px] font-semibold tnum">
              {unreadCount}
            </span>
          )}
        </FilterTab>
        {/* The tab someone reaches for when something has actually happened:
            theft, collision, cut power. Everything routine is filtered out. */}
        <FilterTab active={filter === "critical"} onClick={() => setFilter("critical")}>
          <Siren className="w-3.5 h-3.5 me-1.5" />
          {t("alerts.critical")}
        </FilterTab>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} flush className="p-4">
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/3" />
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellOff className="w-6 h-6" />}
            title={t("no.alerts.yet")}
            description={t("no.alerts.description")}
          />
        </Card>
      ) : (
        <div className="space-y-2.5 stagger">
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} t={t} onMarkRead={handleMarkRead} />
          ))}
        </div>
      )}
    </ResponsiveLayout>
  );
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center h-9 px-3.5 rounded-full text-sm font-medium border transition-colors cursor-pointer",
        active
          ? "bg-brand-subtle text-brand-ink border-brand/25"
          : "bg-surface text-content-secondary border-line hover:bg-surface-sunken"
      )}
    >
      {children}
    </button>
  );
}

function AlertRow({
  alert,
  t,
  onMarkRead,
}: {
  alert: Alert;
  t: (k: string) => string;
  onMarkRead: (id: number) => void;
}) {
  const tone = SEVERITY_TONE[alert.severity] ?? "brand";

  return (
    <Card
      flush
      className={cx(
        "flex items-start gap-3 p-4 transition-colors",
        !alert.is_read && "border-brand/30 bg-brand-subtle/30",
        // A critical alert gets a rail as well as a coloured icon: colour
        // alone is not a channel several readers can use.
        alert.severity === "critical" && "border-s-2 border-s-status-critical"
      )}
    >
      <span
        className={cx(
          "shrink-0 grid place-items-center w-9 h-9 rounded-control mt-0.5",
          KIND_ICON_CLASSES[tone]
        )}
        aria-hidden
      >
        {KIND_ICON[alert.kind]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-content">
            {alert.severity === "critical" && (
              /* The word, not just the colour — this is the accessible
                 channel for "this one matters". */
              <span className="me-1.5 align-middle inline-flex items-center rounded-full bg-status-critical/10 text-status-critical px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {t("alerts.critical")}
              </span>
            )}
            {alert.title}
          </p>
          {!alert.is_read && <span className="shrink-0 w-2 h-2 rounded-full bg-brand mt-1.5" aria-hidden />}
        </div>
        {alert.detail && <p className="text-xs text-content-muted mt-0.5">{alert.detail}</p>}
        <div className="flex items-center gap-3 mt-2">
          <Link to={`/device/${alert.device_serial}`} className="text-xs font-mono text-content-muted hover:text-brand transition-colors">
            {alert.device_serial}
          </Link>
          <span className="text-xs text-content-muted tnum">{new Date(alert.created_at).toLocaleString()}</span>
        </div>
      </div>

      {!alert.is_read && (
        <Button variant="ghost" size="sm" onClick={() => onMarkRead(alert.id)} icon={<BellRing className="w-3.5 h-3.5" />}>
          <span className="hidden sm:inline">{t("mark.read")}</span>
        </Button>
      )}
    </Card>
  );
}
