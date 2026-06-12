/**
 * RoutingLoader — branded loading animation that visualizes a request being
 * routed through Nadir. A packet travels from the prompt into the router hub,
 * which dispatches it across the candidate provider/models. Each lane pulses
 * out of phase so it reads as live, in-flight routing.
 *
 * Theme-aware via semantic tokens; respects prefers-reduced-motion (handled in
 * index.css). Used as the loading state for dashboard cards.
 */

interface Provider {
  /** Display label, e.g. "GPT 5.4-mini". */
  label: string;
  /** CSS color for this lane's dot (any valid color string). */
  color: string;
}

/**
 * Default candidate set — one model per provider so the loader reads as
 * cross-provider routing. Colours are muted brand accents that hold up in both
 * light and dark mode.
 */
const DEFAULT_PROVIDERS: Provider[] = [
  { label: "Opus", color: "hsl(var(--brand-blue))" }, // Anthropic
  { label: "GPT 5.4-mini", color: "hsl(160 70% 42%)" }, // OpenAI
  { label: "Grok", color: "hsl(265 70% 64%)" }, // xAI
];

// Lane animation classes are phase-staggered (see index.css). We cycle through
// the three available phases so any provider count stays out of sync.
const LANE_CLASSES = ["route-lane-0", "route-lane-1", "route-lane-2"];

interface RoutingLoaderProps {
  /** Candidate providers/models shown as dispatch lanes. */
  providers?: Provider[];
  /** Optional caption under the animation. */
  label?: string;
  /** Hide the per-provider text labels (compact dots only). */
  showLabels?: boolean;
  className?: string;
}

export const RoutingLoader = ({
  providers = DEFAULT_PROVIDERS,
  label = "Routing requests…",
  showLabels = true,
  className = "",
}: RoutingLoaderProps) => {
  // Evenly space the dispatch-wire endpoints across a fixed 56px column so the
  // SVG paths line up with the lane rows (each row is 16px tall → centers at
  // 8 / 28 / 48 for three lanes, derived generically below).
  const H = 56;
  const n = providers.length;
  const laneY = (i: number) => (n === 1 ? H / 2 : 8 + (i * (H - 16)) / (n - 1));

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        {/* Prompt source */}
        <div className="flex flex-col gap-1" aria-hidden="true">
          <span className="block h-1 w-6 rounded-full bg-muted-foreground/40" />
          <span className="block h-1 w-4 rounded-full bg-muted-foreground/30" />
          <span className="block h-1 w-5 rounded-full bg-muted-foreground/40" />
        </div>

        {/* Wire + router hub + provider lanes */}
        <div className="relative flex items-center" aria-hidden="true">
          {/* incoming wire with the traveling packet */}
          <div className="relative h-px w-10 bg-border">
            <span
              className="route-packet absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-blue))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-blue))" }}
            />
          </div>

          {/* router hub */}
          <div className="route-hub z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue))] text-[13px] font-semibold text-white">
            N
          </div>

          {/* dispatch wires to each provider */}
          <svg width="40" height={H} viewBox={`0 0 40 ${H}`} className="overflow-visible" fill="none">
            {providers.map((p, i) => (
              <path
                key={p.label}
                d={`M0 ${H / 2} C 16 ${H / 2}, 20 ${laneY(i)}, 40 ${laneY(i)}`}
                stroke="hsl(var(--border))"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                className="route-wire-flow"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </svg>

          {/* provider nodes (+ optional labels) */}
          <div className="flex flex-col justify-between" style={{ height: H }}>
            {providers.map((p, i) => (
              <div key={p.label} className="flex items-center gap-2" style={{ height: 16 }}>
                <span
                  className={`${LANE_CLASSES[i % LANE_CLASSES.length]} h-2.5 w-2.5 shrink-0 rounded-full`}
                  style={{ backgroundColor: p.color }}
                />
                {showLabels && (
                  <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                    {p.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {label && (
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      )}
    </div>
  );
};
