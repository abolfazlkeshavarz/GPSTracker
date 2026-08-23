import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/*
 * Shared primitives.
 *
 * Before this, every page hand-wrote long Tailwind strings, so the same button
 * had three different paddings and the same card three different shadows.
 * Everything here reads from the design tokens, which is also what makes dark
 * mode work without touching each page.
 */

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* ----------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover shadow-sm hover:shadow-glow disabled:hover:bg-brand disabled:hover:shadow-sm",
  secondary:
    "bg-surface text-content border border-line hover:bg-surface-sunken hover:border-line-strong",
  ghost:
    "bg-transparent text-content-secondary hover:bg-surface-sunken hover:text-content",
  danger:
    "bg-status-critical text-white hover:brightness-110 shadow-sm",
  subtle:
    "bg-brand-subtle text-brand-ink hover:brightness-95 dark:hover:brightness-125",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, fullWidth, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      // A loading button must not be clickable twice.
      disabled={disabled || loading}
      // Tells assistive tech the control is working, not broken.
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-control font-medium",
        // cursor-pointer and a real press state: both on the plugin's
        // pre-delivery checklist, and a 150ms transition is inside the
        // 150-300ms band it asks for.
        "cursor-pointer select-none transition-all duration-150",
        "active:scale-[0.98] active:duration-75",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------- Card */

interface CardProps {
  className?: string;
  children: ReactNode;
  /** Removes the default padding, for cards that own their own layout. */
  flush?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({ className, children, flush, as: Tag = "div" }: CardProps) {
  return (
    <Tag
      className={cx(
        "bg-surface border border-line rounded-card shadow-sm",
        // A 1px top highlight reads as a lit edge on the dark surface and is
        // invisible in light mode, which is what gives the dark theme depth
        // without resorting to heavy gradients.
        "relative before:absolute before:inset-x-0 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        "before:rounded-t-card before:pointer-events-none",
        !flush && "p-5",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4 px-5 py-4 border-b border-line", className)}>
      <div className="min-w-0">
        <h2 className="font-semibold text-content truncate tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-content-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "brand";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-content-secondary border-line",
  good: "bg-status-good-bg text-status-good border-status-good/30",
  warning: "bg-status-warning-bg text-status-warning border-status-warning/30",
  serious: "bg-status-serious-bg text-status-serious border-status-serious/30",
  critical: "bg-status-critical-bg text-status-critical border-status-critical/30",
  brand: "bg-brand-subtle text-brand-ink border-brand/25",
};

/**
 * Status pill.
 *
 * `children` is required rather than optional on purpose: status is never
 * carried by colour alone, since several of the status hues are
 * indistinguishable to colour-blind readers and two sit below 3:1 contrast.
 * The words are the accessible channel; the colour is the shortcut.
 */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** A small filled dot, for a live/idle indicator beside a label. */
export function StatusDot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color: Record<Tone, string> = {
    neutral: "bg-content-muted",
    good: "bg-status-good",
    warning: "bg-status-warning",
    serious: "bg-status-serious",
    critical: "bg-status-critical",
    brand: "bg-brand",
  };

  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
      {pulse && (
        <span className={cx("absolute inline-flex h-full w-full rounded-full animate-pulse-ring", color[tone])} />
      )}
      <span className={cx("relative inline-flex h-2 w-2 rounded-full", color[tone])} />
    </span>
  );
}

/* --------------------------------------------------------------- StatTile */

/**
 * A single headline number.
 *
 * Deliberately not a chart: one value with no series has nothing to plot, and
 * a tile reads faster than a one-bar bar chart. The accent is a thin rule and
 * a tinted icon, never a coloured number — values stay in primary ink so the
 * figure is legible at any contrast.
 */
export function StatTile({
  label,
  value,
  icon,
  accent = "series-1",
  hint,
  loading,
  live,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: "series-1" | "series-2" | "series-3" | "series-4" | "status-good" | "status-critical";
  hint?: ReactNode;
  loading?: boolean;
  /** Adds the live glow. Only for values backed by a current source. */
  live?: boolean;
}) {
  const accents: Record<string, { bg: string; fg: string; rule: string }> = {
    "series-1": { bg: "bg-series-1/10", fg: "text-series-1", rule: "bg-series-1" },
    "series-2": { bg: "bg-series-2/10", fg: "text-series-2", rule: "bg-series-2" },
    "series-3": { bg: "bg-series-3/10", fg: "text-series-3", rule: "bg-series-3" },
    "series-4": { bg: "bg-series-4/10", fg: "text-series-4", rule: "bg-series-4" },
    "status-good": { bg: "bg-status-good/10", fg: "text-status-good", rule: "bg-status-good" },
    "status-critical": { bg: "bg-status-critical/10", fg: "text-status-critical", rule: "bg-status-critical" },
  };
  const a = accents[accent] ?? accents["series-1"];

  return (
    <Card
      flush
      className={cx(
        "relative overflow-hidden p-4 transition-shadow duration-200",
        live && "shadow-glow-good"
      )}
    >
      <span className={cx("absolute inset-y-0 start-0 w-1", a.rule)} aria-hidden />

      <div className="flex items-start justify-between gap-3 ps-2">
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase text-content-muted truncate">{label}</p>

          {loading ? (
            <Skeleton className="h-8 w-16 mt-1.5" />
          ) : (
            /* tnum: the value updates in place, and proportional digits make
               the tile jitter as the number changes width. */
            <p className="text-metric font-semibold text-content mt-1 tnum">{value}</p>
          )}

          {/* Fixed slot: without it, a hint appearing after load shifts every
              tile in the row (the "Content Jumping" guideline). */}
          <p className="text-xs text-content-muted mt-1 min-h-[1rem] truncate">{hint ?? " "}</p>
        </div>

        {icon && (
          <span className={cx("shrink-0 grid place-items-center w-9 h-9 rounded-control", a.bg, a.fg)}>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Input */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(function Input(
  { label, hint, error, leadingIcon, trailingSlot, className, id, ...rest },
  ref
) {
  const inputId = id || rest.name;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-content-secondary mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        {leadingIcon && (
          <span className="absolute inset-y-0 start-0 ps-3 flex items-center text-content-muted pointer-events-none">
            {leadingIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          className={cx(
            "w-full h-11 rounded-control bg-surface text-content",
            "border border-line placeholder:text-content-muted",
            "transition-colors focus:border-brand",
            leadingIcon ? "ps-10" : "ps-3.5",
            trailingSlot ? "pe-11" : "pe-3.5",
            error && "border-status-critical",
            className
          )}
          {...rest}
        />

        {trailingSlot && (
          <span className="absolute inset-y-0 end-0 pe-2 flex items-center">{trailingSlot}</span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-status-critical mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-content-muted mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
});

/* --------------------------------------------------------------- Skeleton */

/** Placeholder block. Prefer this over a spinner for content-shaped waits. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative block overflow-hidden rounded-md bg-surface-sunken",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-black/5 after:to-transparent",
        "dark:after:via-white/10",
        className
      )}
    />
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      {icon && (
        <span className="grid place-items-center w-12 h-12 rounded-full bg-surface-sunken text-content-muted mb-3">
          {icon}
        </span>
      )}
      <h3 className="font-semibold text-content">{title}</h3>
      {description && <p className="text-sm text-content-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ PageHeading */

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-display text-content">{title}</h1>
        {subtitle && <p className="text-sm text-content-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Meter */

/**
 * A labelled proportional bar (battery, GPS quality).
 *
 * The numeric label is always rendered — the fill length alone is a weak
 * encoding at these sizes, and the colour is a status hue that some readers
 * cannot separate.
 */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  label,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  const fills: Record<Tone, string> = {
    neutral: "bg-content-muted",
    good: "bg-status-good",
    warning: "bg-status-warning",
    serious: "bg-status-serious",
    critical: "bg-status-critical",
    brand: "bg-brand",
  };

  return (
    <div>
      {label && <div className="flex justify-between text-xs text-content-muted mb-1">{label}</div>}
      <div
        className="h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-500", fills[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
