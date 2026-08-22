import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  LogOut,
  Shield,
  Menu,
  X,
  MapPin,
  Moon,
  Sun,
  MonitorSmartphone,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useRealtime } from "../../context/RealtimeContext";
import LanguageSwitcher from "../LanguageSwitcher";
import { Button, StatusDot, cx } from "../ui";

/*
 * One layout for every breakpoint.
 *
 * This replaces ResponsiveLayout, which picked between DashboardLayout and
 * MobileLayout at 768px. Because those are different components, crossing the
 * breakpoint unmounted and remounted the whole page subtree: page state was
 * lost, data refetched, and anything the page owned was destroyed and rebuilt.
 *
 * Here the sidebar and the mobile bar are the same tree, shown and hidden with
 * CSS. Nothing remounts on resize.
 */

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { t, isRTL } = useLanguage();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on navigation, or it stays open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Escape should dismiss the drawer, like any modal surface.
  useEffect(() => {
    if (!drawerOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const items: NavItem[] = [
    { path: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { path: "/activate", label: t("activate.device"), icon: PlusCircle },
    { path: "/admin", label: "Admin Panel", icon: Shield, adminOnly: true },
  ].filter((i) => !i.adminOnly || user?.role === "admin") as NavItem[];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const navLinks = (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {items.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? "page" : undefined}
            className={cx(
              // min-h-11 = 44px, the touch-target floor. py alone left these
              // at 40px.
              "relative flex items-center gap-3 px-3 min-h-11 rounded-control text-sm font-medium",
              "transition-colors duration-150 cursor-pointer",
              active
                ? "bg-brand-subtle text-brand-ink"
                : "text-content-secondary hover:bg-surface-sunken hover:text-content"
            )}
          >
            {/* A rail as well as a fill: the active item stays identifiable
                when the tinted background is hard to see. */}
            {active && (
              <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-brand" aria-hidden />
            )}
            <item.icon className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-4 h-16 border-b border-line">
      <span className="grid place-items-center w-9 h-9 rounded-control bg-brand text-white shrink-0 shadow-glow">
        <MapPin className="w-5 h-5" />
      </span>
      <span className="font-semibold text-content truncate tracking-tight">{t("gps.tracker")}</span>
    </div>
  );

  const footer = (
    <div className="border-t border-line p-3 space-y-2">
      <div className="flex items-center gap-2.5 px-1 py-1.5">
        <span className="grid place-items-center w-8 h-8 rounded-full bg-surface-sunken text-content-secondary text-sm font-semibold shrink-0">
          {user?.phone?.charAt(0)?.toUpperCase() || "U"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content truncate">{user?.phone}</p>
          <p className="text-xs text-content-muted capitalize">{user?.role}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <Button
        variant="ghost"
        size="sm"
        fullWidth
        onClick={handleLogout}
        icon={<LogOut className="w-4 h-4" />}
        className="justify-start !text-status-critical hover:!bg-status-critical/10"
      >
        {t("logout")}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-page">
      {/* Desktop sidebar. Hidden below lg, but always in the tree. */}
      <aside
        className={cx(
          "hidden lg:flex fixed inset-y-0 w-64 flex-col bg-surface border-line z-30",
          "shadow-sm",
          isRTL ? "end-0 border-s" : "start-0 border-e"
        )}
      >
        {brand}
        {navLinks}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-2 h-14 px-3 bg-surface/90 backdrop-blur border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-8 h-8 rounded-control bg-brand text-white shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <span className="font-semibold text-content truncate">{t("gps.tracker")}</span>
        </div>

        <div className="flex items-center gap-1">
          <ConnectionPill compact />
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="p-2 rounded-control text-content-secondary hover:bg-surface-sunken"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cx(
              "absolute inset-y-0 w-72 max-w-[85vw] bg-surface flex flex-col shadow-xl",
              isRTL ? "end-0" : "start-0"
            )}
          >
            <div className="flex items-center justify-between h-16 px-4 border-b border-line">
              <span className="font-semibold text-content">{t("gps.tracker")}</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-control text-content-secondary hover:bg-surface-sunken"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navLinks}
            {footer}
          </div>
        </div>
      )}

      {/* Content */}
      <div className={cx("min-h-screen flex flex-col", isRTL ? "lg:me-64" : "lg:ms-64")}>
        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end gap-3 h-16 px-6 border-b border-line bg-surface/70 backdrop-blur-md sticky top-0 z-20">
          <ConnectionPill />
        </div>

        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">{children}</main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-md border-t border-line"
          /* Keeps the bar clear of the iOS home indicator. */
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch justify-around">
            {items.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    // min-h-[52px]: keeps the tap target above the 44px floor
                    // once the label is included.
                    "relative flex flex-col items-center justify-center gap-0.5 flex-1",
                    "min-h-[52px] py-2 text-[11px] font-medium transition-colors cursor-pointer",
                    active ? "text-brand" : "text-content-muted"
                  )}
                >
                  {active && (
                    <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" aria-hidden />
                  )}
                  <item.icon className="w-5 h-5" />
                  <span className="truncate max-w-full px-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ sub-components */

function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();

  const config = {
    light: { icon: <Sun className="w-4 h-4" />, label: "Light" },
    dark: { icon: <Moon className="w-4 h-4" />, label: "Dark" },
    system: { icon: <MonitorSmartphone className="w-4 h-4" />, label: "System" },
  }[theme];

  return (
    <button
      onClick={cycleTheme}
      // The label states the *current* setting; the icon alone is ambiguous
      // about whether it shows the current mode or the one it switches to.
      aria-label={`Theme: ${config.label}. Click to change.`}
      title={`Theme: ${config.label}`}
      className="flex items-center gap-1.5 px-2.5 h-8 rounded-control border border-line text-xs font-medium text-content-secondary hover:bg-surface-sunken transition-colors"
    >
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
}

/**
 * Live connection indicator.
 *
 * Shows state as dot + word, never colour alone, and offers a retry when the
 * socket is down instead of leaving the user to reload the page.
 */
function ConnectionPill({ compact }: { compact?: boolean }) {
  const { status, isConnected, lastMessageAt, reconnect } = useRealtime();

  const map = {
    open: { tone: "good" as const, label: "Live", icon: <Wifi className="w-3.5 h-3.5" /> },
    connecting: { tone: "warning" as const, label: "Connecting", icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
    reconnecting: { tone: "warning" as const, label: "Reconnecting", icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
    offline: { tone: "critical" as const, label: "Offline", icon: <WifiOff className="w-3.5 h-3.5" /> },
    unauthorized: { tone: "critical" as const, label: "Signed out", icon: <WifiOff className="w-3.5 h-3.5" /> },
  }[status];

  if (compact) {
    return (
      <span className="flex items-center gap-1.5 px-2 h-8 rounded-full border border-line" title={map.label}>
        <StatusDot tone={map.tone} pulse={isConnected} />
        <span className="sr-only">{map.label}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        /* One atomic status message rather than a bare value, so a screen
           reader announces something meaningful when the state flips. */
        role="status"
        aria-atomic="true"
        aria-label={`Realtime connection: ${map.label}`}
        className={cx(
          "flex items-center gap-2 px-3 h-8 rounded-full border text-xs font-medium",
          "transition-shadow duration-300",
          isConnected
            ? "border-status-good/30 text-content-secondary shadow-glow-good"
            : "border-line text-content-secondary"
        )}
      >
        <StatusDot tone={map.tone} pulse={isConnected} />
        {map.label}
        {isConnected && lastMessageAt && (
          <span className="text-content-muted hidden xl:inline tnum">
            · {new Date(lastMessageAt).toLocaleTimeString()}
          </span>
        )}
      </span>

      {!isConnected && status !== "unauthorized" && (
        <Button size="sm" variant="ghost" onClick={reconnect} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Retry
        </Button>
      )}
    </div>
  );
}
