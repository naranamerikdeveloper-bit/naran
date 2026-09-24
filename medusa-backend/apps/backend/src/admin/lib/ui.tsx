import { Heading, Text } from "@medusajs/ui";
import type { ReactNode } from "react";

/**
 * Shared admin UI kit — keeps every custom route on the same visual language
 * (card-based KPIs with colored icon badges, bordered table panels, skeleton
 * loaders). Built only on verified @medusajs/ui Tailwind tokens.
 */

export const TONES: Record<string, string> = {
  green: "bg-ui-tag-green-bg text-ui-tag-green-icon",
  blue: "bg-ui-tag-blue-bg text-ui-tag-blue-icon",
  orange: "bg-ui-tag-orange-bg text-ui-tag-orange-icon",
  purple: "bg-ui-tag-purple-bg text-ui-tag-purple-icon",
  red: "bg-ui-tag-red-bg text-ui-tag-red-icon",
  grey: "bg-ui-tag-neutral-bg text-ui-tag-neutral-icon",
};

export const BAR_TONE: Record<string, string> = {
  green: "bg-ui-tag-green-icon",
  blue: "bg-ui-tag-blue-icon",
  orange: "bg-ui-tag-orange-icon",
  purple: "bg-ui-tag-purple-icon",
  red: "bg-ui-tag-red-icon",
  interactive: "bg-ui-fg-interactive",
};

/** Page header row: title + subtitle on the left, actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div>
        <Heading level="h1">{title}</Heading>
        {description && <Text className="text-ui-fg-subtle" size="small">{description}</Text>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Responsive grid for StatCards. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const map: Record<number, string> = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
    5: "sm:grid-cols-3 xl:grid-cols-5",
  };
  return <div className={`grid grid-cols-1 ${map[cols]} gap-4 px-6 py-5`}>{children}</div>;
}

/** A single KPI card with an optional colored icon badge + skeleton state. */
export function StatCard({ icon, tone = "blue", label, value, loading }: { icon?: ReactNode; tone?: string; label: string; value: ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 transition-shadow hover:shadow-elevation-card-rest">
      <div className="flex items-center justify-between gap-2">
        <Text className="text-ui-fg-subtle" size="small">{label}</Text>
        {icon && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONES[tone] || TONES.blue}`}>{icon}</span>}
      </div>
      {loading
        ? <div className="mt-2 h-8 w-28 rounded bg-ui-bg-component animate-pulse" />
        : <Heading level="h2" className="mt-2 tabular-nums">{value}</Heading>}
    </div>
  );
}

/** A titled section card — use to wrap tables or content blocks. */
export function Panel({ title, actions, children, bodyClassName = "" }: { title?: string; actions?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  return (
    <div className="px-6 py-5">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <Text weight="plus" size="small">{title}</Text>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`overflow-hidden rounded-lg border border-ui-border-base ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/** Bordered wrapper for a bare <Table> without a title. */
export function TableCard({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-ui-border-base">{children}</div>;
}

/** A small skeleton bar, e.g. inside table cells while loading. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-ui-bg-component animate-pulse ${className}`} />;
}

/**
 * Consistent empty state — an optional icon in a soft badge, a title and an
 * optional hint. Use anywhere a list/table has no rows so every page reads the
 * same instead of ad-hoc one-off "Хоосон" divs.
 */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <span className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-ui-bg-component text-ui-fg-muted">{icon}</span>}
      <Text size="small" weight="plus">{title}</Text>
      {hint && <Text size="small" className="max-w-sm text-ui-fg-subtle">{hint}</Text>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A horizontal proportion bar (value/max). */
export function Bar({ value, max, tone = "orange", className = "" }: { value: number; max: number; tone?: string; className?: string }) {
  const pct = Math.max(2, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-component ${className}`}>
      <div className={`h-full rounded-full ${BAR_TONE[tone] || BAR_TONE.orange}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Text-color tones for currentColor-driven SVG (mirrors BAR_TONE, as text-* utilities). */
export const LINE_TONE: Record<string, string> = {
  green: "text-ui-tag-green-icon",
  blue: "text-ui-tag-blue-icon",
  orange: "text-ui-tag-orange-icon",
  purple: "text-ui-tag-purple-icon",
  red: "text-ui-tag-red-icon",
  interactive: "text-ui-fg-interactive",
};

/**
 * Dependency-free responsive area chart (inline SVG, no chart libraries).
 * Draws a gradient area fill + crisp top line for `points[].value`, a faint
 * baseline, and emphasizes the final point with a dot. Color is driven by
 * currentColor via a `tone` text-color class (see LINE_TONE).
 */
export function AreaChart({
  points,
  height = 64,
  tone = "interactive",
  valueFormat,
}: {
  points: { label: string; value: number }[];
  height?: number;
  tone?: string;
  valueFormat?: (n: number) => string;
}) {
  const n = points.length;
  if (n === 0) return null; // nothing to draw

  // viewBox coordinate space — x stretches to container width (preserveAspectRatio="none"),
  // strokes stay crisp via vector-effect="non-scaling-stroke".
  const W = 100;
  const H = Math.max(24, height);
  const padY = 4; // keep line/dot off the top & bottom edges
  const plotH = H - padY * 2;

  const values = points.map((p) => (Number.isFinite(p.value) ? p.value : 0));
  const maxV = Math.max(0, ...values);
  const denom = maxV > 0 ? maxV : 1; // guard divide-by-zero (all-zero => flat baseline)

  const yOf = (v: number) => padY + plotH - (v / denom) * plotH;
  const xOf = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W);

  // Build [x,y] coords — a single point renders as a flat line across the width.
  const coords: [number, number][] =
    n === 1 ? [[0, yOf(values[0])], [W, yOf(values[0])]] : values.map((v, i) => [xOf(i), yOf(v)]);

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const [lastX, lastY] = coords[coords.length - 1];
  const baseY = yOf(0);

  const gradId = `ac-grad-${Math.random().toString(36).slice(2, 9)}`;
  const last = values[values.length - 1];
  const aria = `${n} өдрийн борлуулалт${valueFormat ? `, сүүлийн ${valueFormat(last)}` : ""}`;

  return (
    <div className={`w-full ${LINE_TONE[tone] || LINE_TONE.interactive}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={aria}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* faint baseline at value 0 */}
        <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {/* gradient area fill (allowed to stretch) */}
        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        {/* crisp top line */}
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* emphasize the last point */}
        <circle cx={lastX} cy={lastY} r="2.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ui-fg-muted">
        <span>{points[0].label}</span>
        {n > 1 && <span>{points[n - 1].label}</span>}
      </div>
    </div>
  );
}
