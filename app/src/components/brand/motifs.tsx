/**
 * Nadir — Editorial motif library.
 *
 * A hand-illustrated SVG vocabulary for the marketing surface: navigation &
 * intelligence marks (compass, route path, verifier seal, signal dots, orbit
 * trails, data ticks), Mediterranean & coastal elements (sea horizon, sun
 * disc, wave contours, agave, coral, shell, pebble stack, arches), human marks
 * (face profile, body line), and technical systems (dotted grid, flow diagram,
 * contour lines, ink sweep).
 *
 * Every motif renders inside `.nadir-brand`, so it may reference the brand CSS
 * variables (var(--terracotta) …). Colours default to brand hues but accept a
 * `color` override; all accept `className` for sizing/positioning. Strokes are
 * deliberately a touch irregular to read hand-drawn, never vector-perfect.
 */
import type { CSSProperties } from "react";

type MotifProps = {
  className?: string;
  style?: CSSProperties;
  color?: string;
};

/* — Navigation & intelligence ———————————————————————————————————————— */

/** Compass burst — the Nadir mark. A radiant eight-point star. When `animate`,
 *  the rays rotate slowly while the centre core breathes (reduced-motion safe). */
export function CompassBurst({ className, style, color = "var(--terracotta)", animate = false }: MotifProps & { animate?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} fill="none" aria-hidden="true">
      <g className={animate ? "burst-spin" : undefined} stroke={color} strokeWidth="1.4" strokeLinecap="round">
        {/* cardinal long rays */}
        <path d="M32 4 L32 28 M32 36 L32 60 M4 32 L28 32 M36 32 L60 32" strokeWidth="1.8" />
        {/* diagonal short rays */}
        <path d="M14 14 L26 26 M38 38 L50 50 M50 14 L38 26 M26 38 L14 50" />
        {/* fine ticks */}
        <path d="M32 12 L32 16 M32 48 L32 52 M12 32 L16 32 M48 32 L52 32" opacity="0.6" />
      </g>
      <path className={animate ? "burst-core" : undefined} d="M32 22 L37 32 L32 42 L27 32 Z" fill={color} opacity="0.92" />
      <circle cx="32" cy="32" r="2.4" fill="var(--shell)" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

/** Small solid mark for the wordmark lockup. */
export function NadirMark({ className, style, color = "var(--terracotta)" }: MotifProps) {
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} fill="none" aria-hidden="true">
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M20 3 L20 37 M3 20 L37 20" />
        <path d="M8 8 L32 32 M32 8 L8 32" strokeWidth="1.4" opacity="0.85" />
      </g>
      <path d="M20 13 L26 20 L20 27 L14 20 Z" fill={color} />
    </svg>
  );
}

/** Dashed route path with origin dot and destination pin. */
export function RoutePath({ className, style, color = "var(--ink)", animate = false }: MotifProps & { animate?: boolean }) {
  return (
    <svg viewBox="0 0 220 90" className={className} style={style} fill="none" aria-hidden="true">
      <circle cx="10" cy="70" r="4" fill={color} />
      <path
        d="M10 70 C 50 70, 55 18, 95 22 S 150 70, 180 40 S 205 16, 210 14"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        className={animate ? "route-draw" : undefined}
        strokeDasharray="5 7"
      />
      <g transform="translate(210 14)">
        <path d="M0 0 C -7 -2, -7 -12, 0 -14 C 7 -12, 7 -2, 0 0 Z" fill={color} />
        <circle cx="0" cy="-8" r="2.4" fill="var(--shell)" />
      </g>
    </svg>
  );
}

/** Verifier seal — a circular stamp with rotating ring text and a star core. */
export function VerifierSeal({ className, style, color = "var(--ink)", label = "LOWEST VIABLE MODEL · VERIFIED BY NADIR · " }: MotifProps & { label?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden="true">
      <defs>
        <path id="seal-ring" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke={color} strokeWidth="1" opacity="0.55" />
      <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="1.4" />
      <g className="seal-spin">
        <text fill={color} style={{ fontFamily: "'Geist Mono', monospace", fontSize: "8.2px", letterSpacing: "1.6px" }}>
          <textPath href="#seal-ring" startOffset="0">{label}</textPath>
        </text>
      </g>
      <g stroke={color} strokeWidth="1.2" strokeLinecap="round" transform="translate(60 60)">
        <path d="M0 -20 L0 20 M-20 0 L20 0" />
        <path d="M-13 -13 L13 13 M13 -13 L-13 13" opacity="0.7" />
        <path d="M0 -10 L4 0 L0 10 L-4 0 Z" fill={color} stroke="none" />
      </g>
    </svg>
  );
}

/** Signal dots — a small grid of solid + open dots, multi-hued. */
export function SignalDots({ className, style }: MotifProps) {
  const cols = 6, rows = 4;
  const hues = ["var(--ink)", "var(--sky)", "var(--seaglass)", "var(--terracotta)", "var(--blush)", "var(--sage)", "var(--coral)", "var(--glacier)"];
  return (
    <svg viewBox="0 0 96 64" className={className} style={style} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const i = r * cols + c;
          const open = (i * 7) % 5 === 0;
          const fill = hues[(i * 3) % hues.length];
          return (
            <circle
              key={i}
              cx={10 + c * 15}
              cy={10 + r * 15}
              r={open ? 3.4 : 4}
              fill={open ? "none" : fill}
              stroke={fill}
              strokeWidth={open ? 1.4 : 0}
            />
          );
        })
      )}
    </svg>
  );
}

/** Orbit trails — nested ellipses with travelling node. When `animate`, the rings
 *  stay put and each planet dot orbits in place along its own ring (counter-rotating). */
export function OrbitTrails({ className, style, color = "var(--ink)", animate = false }: MotifProps & { animate?: boolean }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const spin = animate && !reduced;
  return (
    <svg viewBox="0 0 120 80" className={className} style={style} fill="none" aria-hidden="true">
      <ellipse cx="60" cy="40" rx="52" ry="22" stroke={color} strokeWidth="1.1" opacity="0.7" />
      <ellipse cx="60" cy="40" rx="38" ry="14" stroke={color} strokeWidth="1.1" transform="rotate(-18 60 40)" opacity="0.85" />
      <circle cx="60" cy="40" r="3.2" fill={color} />
      {spin ? (
        <>
          {/* terracotta planet rides the outer ring (CSS motion path) */}
          <circle cx="0" cy="0" r="2.6" fill="var(--terracotta)" className="orbit-planet orbit-planet--outer" />
          {/* sky planet rides the inner (tilted) ring, the other way round */}
          <g transform="rotate(-18 60 40)">
            <circle cx="0" cy="0" r="2.2" fill="var(--sky)" className="orbit-planet orbit-planet--inner" />
          </g>
        </>
      ) : (
        <>
          <circle cx="108" cy="42" r="2.6" fill="var(--terracotta)" />
          <circle cx="22" cy="34" r="2.2" fill="var(--sky)" />
        </>
      )}
    </svg>
  );
}

/** Hand-drawn arrow — a wobbly little ink stroke that replaces the geometric
 *  unicode glyphs (↘ → ↓) in hand annotations. Inherits the annotation's colour
 *  via stroke="currentColor"; `dir` just rotates the same base gesture. */
export function HandArrow({
  className,
  style,
  dir = "right",
}: MotifProps & { dir?: "right" | "down-right" | "down" | "up" | "up-right" | "left" }) {
  const angle = { right: 0, "down-right": 45, "up-right": -45, down: 90, up: -90, left: 180 }[dir];
  return (
    <svg viewBox="0 0 30 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={`rotate(${angle} 15 12)`}>
        <path d="M3 12.6 C 10 10.7, 17 13.4, 24 11.3" />
        <path d="M18.4 6.6 C 21.2 8.7, 23.1 10.3, 24.5 11.4" />
        <path d="M24.5 11.4 C 22.9 13.5, 21 15.2, 18.7 16.7" />
      </g>
    </svg>
  );
}

/** Data ticks — rows of irregular vertical tally marks. */
export function DataTicks({ className, style, color = "var(--ink)" }: MotifProps) {
  const rows = 4;
  return (
    <svg viewBox="0 0 110 60" className={className} style={style} stroke={color} strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => {
        const y = 8 + r * 14;
        const n = 9 - (r % 3);
        return Array.from({ length: n }).map((_, i) => {
          const x = 6 + i * 11 + ((i * r) % 3);
          const h = 6 + ((i + r) % 3) * 2;
          return <line key={`${r}-${i}`} x1={x} y1={y - h / 2} x2={x} y2={y + h / 2} />;
        });
      })}
    </svg>
  );
}

/* — Expressive marks ——————————————————————————————————————————————— */

/** Ink sweep — a single confident brush stroke. */
export function InkSweep({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 200 40" className={className} style={style} aria-hidden="true">
      <path
        d="M4 24 C 40 10, 70 30, 110 18 C 150 6, 175 26, 196 16 L 196 24 C 172 34, 150 18, 110 28 C 72 38, 42 20, 4 32 Z"
        fill={color}
      />
    </svg>
  );
}

/** Contour lines — topographic nested loops. When `animate`, the loops swirl
 *  slowly around the steady centre dot (reduced-motion safe). */
export function ContourLines({ className, style, color = "var(--sage)", animate = false }: MotifProps & { animate?: boolean }) {
  return (
    <svg viewBox="0 0 120 100" className={className} style={style} fill="none" stroke={color} strokeWidth="1.1" aria-hidden="true">
      <g className={animate ? "contour-spin" : undefined}>
        <path d="M60 12 C 96 14, 104 52, 86 72 C 66 94, 24 86, 18 58 C 14 34, 34 12, 60 12 Z" opacity="0.55" />
        <path d="M60 24 C 86 26, 92 52, 78 66 C 62 82, 34 76, 30 56 C 28 38, 42 24, 60 24 Z" opacity="0.75" />
        <path d="M60 36 C 76 38, 80 54, 70 62 C 58 72, 44 66, 42 54 C 41 44, 50 36, 60 36 Z" />
      </g>
      <circle cx="58" cy="52" r="3" fill={color} stroke="none" opacity="0.8" />
    </svg>
  );
}

/* — Mediterranean & coastal ————————————————————————————————————————— */

/** Sea horizon — sun over a ruled waterline. */
export function SeaHorizon({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 160 90" className={className} style={style} fill="none" aria-hidden="true">
      <circle cx="80" cy="50" r="20" fill="var(--terracotta)" opacity="0.92" />
      <g stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round">
        <line x1="6" y1="62" x2="154" y2="62" />
        <line x1="22" y1="70" x2="138" y2="70" opacity="0.7" />
        <line x1="40" y1="78" x2="120" y2="78" opacity="0.45" />
      </g>
    </svg>
  );
}

/** Sun disc — a flat terracotta sun. */
export function SunDisc({ className, style, color = "var(--terracotta)" }: MotifProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} style={style} aria-hidden="true">
      <circle cx="40" cy="40" r="34" fill={color} />
    </svg>
  );
}

/** Wave contours — stacked sky-blue swells. */
export function WaveContours({ className, style, color = "var(--sky)" }: MotifProps) {
  return (
    <svg viewBox="0 0 160 60" className={className} style={style} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 16 C 26 4, 46 28, 66 16 S 106 4, 126 16 S 150 22, 154 18" />
      <path d="M6 32 C 26 20, 46 44, 66 32 S 106 20, 126 32 S 150 38, 154 34" opacity="0.8" />
      <path d="M6 48 C 26 36, 46 60, 66 48 S 106 36, 126 48 S 150 54, 154 50" opacity="0.6" />
    </svg>
  );
}

/** Agave — radiating succulent blades. */
export function Agave({ className, style, color = "var(--sage)" }: MotifProps) {
  const blades = [-58, -40, -22, 0, 22, 40, 58];
  return (
    <svg viewBox="0 0 100 110" className={className} style={style} aria-hidden="true">
      <g transform="translate(50 96)">
        {blades.map((a, i) => (
          <path
            key={i}
            d="M0 0 C -5 -34, -3 -64, 0 -86 C 3 -64, 5 -34, 0 0 Z"
            fill={i % 2 ? color : "var(--seaglass)"}
            opacity={0.92 - Math.abs(a) / 220}
            transform={`rotate(${a}) scale(${1 - Math.abs(a) / 240})`}
            stroke="var(--ink)"
            strokeWidth="0.6"
          />
        ))}
      </g>
    </svg>
  );
}

/** Coral branch — terracotta reef sprig. */
export function CoralBranch({ className, style, color = "var(--terracotta)" }: MotifProps) {
  return (
    <svg viewBox="0 0 80 110" className={className} style={style} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M40 104 L40 60" />
      <path d="M40 88 C 28 80, 22 64, 24 50 M40 74 C 52 66, 60 52, 58 38 M40 62 C 32 52, 30 40, 34 28 M40 56 C 50 46, 54 34, 52 22 M40 50 L40 22" />
      <g fill={color} stroke="none">
        <circle cx="24" cy="48" r="3" /><circle cx="58" cy="36" r="3" />
        <circle cx="34" cy="26" r="3" /><circle cx="52" cy="20" r="3" /><circle cx="40" cy="20" r="3" />
      </g>
    </svg>
  );
}

/** Scallop shell — ruled fan. */
export function Shell({ className, style, color = "var(--coral)" }: MotifProps) {
  return (
    <svg viewBox="0 0 100 90" className={className} style={style} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M50 80 C 14 80, 6 40, 18 22 C 26 10, 40 6, 50 6 C 60 6, 74 10, 82 22 C 94 40, 86 80, 50 80 Z" />
      {[-36, -24, -12, 0, 12, 24, 36].map((a, i) => (
        <line key={i} x1="50" y1="78" x2={50 + a} y2="14" transform={`rotate(${a / 6} 50 78)`} opacity="0.85" />
      ))}
      <path d="M40 80 C 44 86, 56 86, 60 80" />
    </svg>
  );
}

/** Pebble stack — balanced cairn. */
export function PebbleStack({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 80 110" className={className} style={style} aria-hidden="true">
      <ellipse cx="40" cy="92" rx="30" ry="14" fill="var(--graphite)" opacity="0.9" />
      <ellipse cx="40" cy="66" rx="24" ry="13" fill="var(--seaglass)" />
      <ellipse cx="40" cy="44" rx="18" ry="11" fill="var(--blush)" />
      <ellipse cx="40" cy="26" rx="12" ry="8" fill="var(--sky)" />
      <g stroke="var(--ink)" strokeWidth="0.8" fill="none" opacity="0.5">
        <ellipse cx="40" cy="92" rx="30" ry="14" />
        <ellipse cx="40" cy="66" rx="24" ry="13" />
        <ellipse cx="40" cy="44" rx="18" ry="11" />
        <ellipse cx="40" cy="26" rx="12" ry="8" />
      </g>
    </svg>
  );
}

/** Arches & stairs — Mediterranean architecture block. */
export function ArchesStairs({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 150 120" className={className} style={style} aria-hidden="true">
      {/* stair block */}
      <path d="M2 118 L2 86 L26 86 L26 70 L50 70 L50 54 L74 54 L74 118 Z" fill="var(--blush)" />
      {/* arch */}
      <path d="M84 118 L84 64 C 84 40, 104 24, 122 24 C 140 24, 148 40, 148 64 L148 118 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M98 118 L98 70 C 98 54, 110 44, 116 44 C 122 44, 134 54, 134 70 L134 118 Z" fill="var(--terracotta)" opacity="0.9" />
      <g stroke="var(--ink)" strokeWidth="1.2" fill="none" opacity="0.6">
        <path d="M2 86 L26 86 M26 70 L50 70 M50 54 L74 54" />
      </g>
    </svg>
  );
}

/* — Human & artistic ————————————————————————————————————————————— */

/** Face profile — single-line classical profile. */
export function FaceProfile({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 90 120" className={className} style={style} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M30 8 C 14 14, 10 40, 18 52 C 14 60, 10 64, 16 68 C 12 74, 18 78, 16 86 C 22 100, 44 104, 54 96" />
      <path d="M18 52 C 26 50, 30 56, 28 62 C 26 66, 20 66, 18 62" opacity="0.8" />
      <path d="M14 40 C 18 38, 22 39, 24 42" opacity="0.7" />
    </svg>
  );
}

/** Body line — seated contour figure. */
export function BodyLine({ className, style, color = "var(--shell)" }: MotifProps) {
  return (
    <svg viewBox="0 0 120 140" className={className} style={style} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="58" cy="20" r="13" />
      <path d="M58 33 C 50 48, 46 60, 52 74 C 36 80, 22 96, 20 120" />
      <path d="M58 33 C 70 46, 80 56, 78 72 C 92 78, 100 98, 96 122" />
      <path d="M52 74 C 64 70, 80 76, 96 96" />
      <path d="M20 120 C 40 126, 78 126, 96 122" />
    </svg>
  );
}

/* — Flora ————————————————————————————————————————————————————————— */

/** Flora sprig — olive-style leaf branch. */
export function FloraSprig({ className, style, color = "var(--sage)" }: MotifProps) {
  return (
    <svg viewBox="0 0 70 110" className={className} style={style} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M35 108 C 33 80, 34 50, 40 16" />
      {[88, 76, 64, 52, 40, 28].map((y, i) => {
        const left = i % 2 === 0;
        const x = left ? -1 : 1;
        return (
          <path
            key={y}
            d={`M${35 + (left ? 0 : 0)} ${y} q ${x * 16} -8 ${x * 22} -2 q ${-x * 4} 8 ${-x * 22} 2 Z`}
            fill={i % 2 ? "var(--seaglass)" : color}
            opacity="0.85"
          />
        );
      })}
    </svg>
  );
}

/** Seed cluster — scattered ink dashes. */
export function SeedCluster({ className, style, color = "var(--ink)" }: MotifProps) {
  const seeds = [
    [12, 10], [28, 6], [44, 14], [60, 8], [20, 24], [38, 28], [54, 22], [70, 30],
    [16, 40], [34, 46], [50, 40], [66, 48], [26, 58], [44, 62], [60, 56],
  ];
  return (
    <svg viewBox="0 0 84 72" className={className} style={style} aria-hidden="true">
      {seeds.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2.2" ry="3.4" fill={color} transform={`rotate(${(i * 37) % 80 - 40} ${x} ${y})`} opacity="0.85" />
      ))}
    </svg>
  );
}

/* — Technical & systems ——————————————————————————————————————————— */

/** Dotted grid — registration field of small dots. */
export function DottedGrid({ className, style, color = "var(--ink)" }: MotifProps) {
  const cols = 7, rows = 5;
  return (
    <svg viewBox="0 0 90 64" className={className} style={style} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={6 + c * 13} cy={6 + r * 13} r="1.5" fill={color} opacity="0.55" />
        ))
      )}
    </svg>
  );
}

/** Flow diagram — nodes connected through a router hub. */
export function FlowDiagram({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 140 80" className={className} style={style} fill="none" stroke={color} strokeWidth="1.3" aria-hidden="true">
      <path d="M22 40 L58 40 M82 40 L118 40 M70 28 L70 12 M70 52 L70 68" />
      <rect x="6" y="32" width="16" height="16" fill="var(--seaglass)" />
      <path d="M70 28 L82 40 L70 52 L58 40 Z" fill="var(--terracotta)" />
      <circle cx="122" cy="40" r="6" fill="var(--sky)" />
      <rect x="62" y="2" width="16" height="10" fill="var(--blush)" />
      <circle cx="70" cy="72" r="6" fill="var(--sage)" />
    </svg>
  );
}

/* — Decorative birds (coastal flourish) ————————————————————————————— */
export function Birds({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 90 30" className={className} style={style} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 18 C 12 8, 16 8, 22 16 C 28 8, 32 8, 38 18" />
      <path d="M48 12 C 53 4, 56 4, 61 11 C 66 4, 69 4, 74 12" opacity="0.8" />
    </svg>
  );
}

/* ── Blueprint / specimen motifs ─────────────────────────────────────── */

/** Thin sparkle / asterisk mark — the blueprint accent. */
export function Sparkle({ className, style, color = "var(--strawberry)" }: MotifProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} stroke={color} strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M12 1 L12 23 M1 12 L23 12 M4 4 L20 20 M20 4 L4 20" />
    </svg>
  );
}

/** Small line sailboat on a ruled waterline. */
export function Sailboat({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 80 70" className={className} style={style} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M40 6 L40 44" />
      <path d="M40 10 C 54 18, 58 32, 56 42 L40 42 Z" fill="var(--glacier)" fillOpacity="0.5" />
      <path d="M40 14 L26 42 L40 42 Z" />
      <path d="M20 46 L60 46 L52 56 L28 56 Z" />
      <path d="M8 62 C 24 58, 56 58, 72 62" stroke="var(--sky)" />
    </svg>
  );
}

/** Loose pencil scribble — faint construction flourish for margins. */
export function Scribble({ className, style, color = "var(--pencil)" }: MotifProps) {
  return (
    <svg viewBox="0 0 120 40" className={className} style={style} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" aria-hidden="true">
      <path d="M2 20 C 18 6, 26 34, 42 20 S 70 6, 86 20 S 110 30, 118 18" opacity="0.8" />
      <path d="M6 30 C 22 22, 40 36, 60 28" opacity="0.5" />
    </svg>
  );
}

/** Scattered cross / plus draughting marks. */
export function CrossMarks({ className, style, color = "var(--pencil)" }: MotifProps) {
  const pts = [[8, 10], [30, 22], [54, 8], [18, 36], [46, 34], [70, 20], [88, 38], [78, 8]];
  return (
    <svg viewBox="0 0 100 48" className={className} style={style} stroke={color} strokeWidth="1.1" strokeLinecap="round" aria-hidden="true">
      {pts.map(([x, y], i) => (
        i % 2 === 0
          ? <g key={i}><line x1={x - 3} y1={y} x2={x + 3} y2={y} /><line x1={x} y1={y - 3} x2={x} y2={y + 3} /></g>
          : <g key={i}><line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} /><line x1={x + 3} y1={y - 3} x2={x - 3} y2={y + 3} /></g>
      ))}
    </svg>
  );
}

/** Small sketched document with a check stamp — the "verify" mark. */
export function DocCheck({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 64 56" className={className} style={style} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="rotate(-5 26 26)">
        <path d="M12 6 L40 7 L40 46 L12 45 Z" fill="var(--paper)" />
        <path d="M18 17 L34 16.5 M18 24 L33 23.5 M18 31 L28 30.5" opacity="0.65" />
      </g>
      <circle cx="46" cy="42" r="10" fill={color} stroke="none" />
      <path d="M41 42 l3.5 3.5 l6 -7.5" stroke="var(--shell)" strokeWidth="1.7" />
    </svg>
  );
}

/** Loose hand-drawn ascending stairs (escalation). */
export function SketchStairs({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 90 70" className={className} style={style} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 64 L4 50 L24 50 L24 36 L44 36 L44 22 L64 22 L64 8 L86 8" />
      <path d="M4 64 L86 64" opacity="0.4" />
    </svg>
  );
}

/**
 * Architectural ramp scene — the hero centerpiece, drawn as a loose pencil-
 * and-watercolour sketch. A blue wash sky with a sailboat on the horizon, a
 * sweeping coral ramp with hand-ruled plank hatching, agave clumps at the
 * base, and faint perspective construction lines. Intentionally wobbly.
 */
export function RampScene({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 380 280" className={className} style={style} fill="none" aria-hidden="true">
      {/* watercolour sky wash */}
      <path d="M30 40 C 130 18, 250 26, 350 64 C 360 96, 320 120, 250 124 C 150 130, 40 112, 26 86 C 22 70, 24 54, 30 40 Z"
            fill="var(--glacier)" fillOpacity="0.5" />
      <path d="M70 56 C 150 44, 220 50, 300 72" stroke="var(--sky)" strokeWidth="0.8" opacity="0.6" />
      {/* horizon + sailboat */}
      <line x1="40" y1="120" x2="170" y2="120" stroke="var(--sky)" strokeWidth="1" opacity="0.7" />
      <line x1="60" y1="128" x2="150" y2="128" stroke="var(--sky)" strokeWidth="0.8" opacity="0.45" />
      <g stroke="var(--ink)" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M104 92 L104 116" />
        <path d="M104 96 C 116 102, 120 112, 118 116 L104 116 Z" fill="var(--glacier)" fillOpacity="0.5" />
        <path d="M104 98 L92 116 L104 116 Z" />
        <path d="M88 116 L122 116 L116 124 L94 124 Z" />
      </g>
      {/* sun dot */}
      <circle cx="316" cy="58" r="9" fill="var(--coral)" fillOpacity="0.55" />

      {/* sweeping ramp — coral watercolour fill */}
      <path d="M150 268 L150 176 C 150 120, 196 86, 262 86 C 318 86, 346 104, 350 138 L326 138 C 320 116, 298 108, 264 110 C 214 112, 186 142, 186 188 L186 268 Z"
            fill="var(--coral)" fillOpacity="0.8" stroke="var(--ink)" strokeWidth="1.2" strokeLinejoin="round" />
      {/* plank hatching following the ramp face */}
      <g stroke="var(--ink)" strokeWidth="0.6" opacity="0.35">
        <path d="M160 264 C 160 150, 196 120, 252 118" />
        <path d="M170 264 C 170 156, 204 128, 262 126" />
        <path d="M178 264 C 178 168, 214 138, 276 134" />
        <path d="M150 230 L186 230 M150 200 L186 200 M150 170 L188 168" />
      </g>
      {/* agave clumps */}
      {[110, 134].map((cx, k) => (
        <g key={cx} transform={`translate(${cx} 266)`}>
          {[-48, -26, 0, 26, 48].map((a, i) => (
            <path key={i} d="M0 0 C -4 -26, -2 -48, 0 -64 C 2 -48, 4 -26, 0 0 Z"
                  fill={i % 2 ? "var(--sage)" : "var(--seaglass)"} fillOpacity="0.92" stroke="var(--ink)" strokeWidth="0.5"
                  transform={`rotate(${a}) scale(${(k ? 0.7 : 1) * (1 - Math.abs(a) / 150)})`} />
          ))}
        </g>
      ))}
      {/* ground + faint perspective construction lines */}
      <path d="M20 268 C 150 260, 300 262, 366 268" stroke="var(--ink)" strokeWidth="1" opacity="0.5" />
      <g stroke="var(--pencil)" strokeWidth="0.6" opacity="0.5">
        <path d="M40 268 L300 150" /><path d="M120 268 L340 168" /><path d="M30 230 L360 214" />
      </g>
    </svg>
  );
}

/* ── Sketch primitives (hand-drawn frame, rule, construction field) ──── */

/**
 * Hand-drawn rectangular frame. Absolutely fills its relatively-positioned
 * parent (preserveAspectRatio none → wobble stretches to the box) with a
 * double pencil stroke so panels read sketched rather than vector-crisp.
 */
export function SketchBox({ className = "pointer-events-none absolute inset-0 h-full w-full", color = "var(--ink)", detail = true }: MotifProps & { detail?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path d="M3 5 Q 2 2.5 6 2.5 L 95 3.5 Q 98 2.5 97.5 6 L 96.5 94 Q 98 97.5 93 96.5 L 6 95.5 Q 2 97.5 3 93 Z"
            stroke={color} strokeWidth="1.1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {/* inner double-line detail. omit on very wide boxes (detail={false}) so the
          x=5% line never lands on top of body text. */}
      {detail ? (
        <path d="M5 7 L 5.5 91 M 7 4.5 L 93 5.2"
              stroke={color} strokeWidth="0.7" vectorEffect="non-scaling-stroke" opacity="0.45" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Hand-drawn horizontal divider rule. */
export function SketchRule({ className, style, color = "var(--ink)" }: MotifProps) {
  return (
    <svg viewBox="0 0 1200 8" preserveAspectRatio="none" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M2 4 C 180 2, 360 6, 560 4 S 940 2, 1198 5" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Construction field — a scatter of faint pencil lines, crosshatch, and
 * asterisks for filling margins and section gutters. Variant picks one of a
 * few hand-composed arrangements so reused fields don't look identical.
 */
export function ConstructionField({ className, style, color = "var(--pencil)", variant = 0 }: MotifProps & { variant?: number }) {
  const sets = [
    <g key="a">
      <path d="M6 26 C 60 8, 120 44, 192 22" /><path d="M2 52 L 176 46" opacity="0.6" />
      <path d="M16 84 C 56 66, 118 102, 190 80" /><path d="M0 120 C 70 138, 128 104, 196 132" opacity="0.7" />
      <g strokeWidth="0.9"><path d="M40 150 l6 6 M46 150 l-6 6" /><path d="M150 36 l6 6 M156 36 l-6 6" /></g>
      <path d="M96 8 l0 12 M90 14 l12 0 M92 10 l8 8 M100 10 l-8 8" strokeWidth="0.9" stroke="var(--strawberry)" opacity="0.7" />
    </g>,
    <g key="b">
      <path d="M4 18 L 188 30" opacity="0.5" /><path d="M10 50 C 70 36, 120 70, 192 48" />
      <path d="M2 90 C 60 110, 130 74, 196 100" opacity="0.6" /><path d="M30 130 L 170 124" opacity="0.5" />
      <g strokeWidth="0.9"><path d="M70 150 l6 6 M76 150 l-6 6" /><path d="M170 100 l6 6 M176 100 l-6 6" /></g>
      <path d="M150 14 l0 12 M144 20 l12 0" strokeWidth="0.9" stroke="var(--strawberry)" opacity="0.7" />
    </g>,
    <g key="c">
      <path d="M8 30 C 70 14, 110 50, 190 28" /><path d="M2 70 L 184 60" opacity="0.55" />
      <path d="M20 104 C 80 122, 120 88, 196 114" opacity="0.6" />
      <path d="M0 144 C 60 130, 140 160, 200 140" opacity="0.5" />
      <g strokeWidth="0.9"><path d="M50 20 l6 6 M56 20 l-6 6" /><path d="M120 130 l6 6 M126 130 l-6 6" /></g>
    </g>,
  ];
  return (
    <svg viewBox="0 0 200 160" className={className} style={style} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" aria-hidden="true">
      {sets[variant % sets.length]}
    </svg>
  );
}

/**
 * Long sweeping construction lines — faint full-bleed pencil curves that cross
 * a whole section, the signature of the blueprint surface. Stretches to fill.
 */
export function SweepLines({ className, style, color = "var(--pencil)" }: MotifProps) {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="none" className={className} style={style} fill="none" stroke={color} strokeLinecap="round" aria-hidden="true">
      <path d="M-20 110 C 220 50, 520 180, 820 80" strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <path d="M-20 380 C 240 440, 540 300, 820 400" strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity="0.62" />
      <path d="M130 -20 C 170 170, 90 350, 170 520" strokeWidth="0.9" vectorEffect="non-scaling-stroke" opacity="0.5" />
      <path d="M-20 240 L 820 210" strokeWidth="0.9" vectorEffect="non-scaling-stroke" opacity="0.4" />
    </svg>
  );
}
