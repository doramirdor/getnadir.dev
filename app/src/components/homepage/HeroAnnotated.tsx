import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { RoutingDemoTerminal } from "@/components/homepage/RoutingDemoTerminal";
import { trackCtaClick } from "@/utils/analytics";

// Experiment: the "annotated whiteboard" hero treatment seen on script.it,
// rebuilt in Nadir's voice. Bold centered headline, the key phrase circled by
// a hand-drawn marker stroke, and three handwritten benefit clusters whose
// curved arrows point at the word each one annotates.
//
// Arrows are not hand-positioned. We measure the real bounding boxes of the
// target words and the cluster boxes after layout (and after the web font
// loads), then draw each arrow so its tip lands in the WHITESPACE beside the
// word -- left margin, right margin, or the gap below -- with the arrowhead
// aligned to that approach. That keeps each arrow pointing AT a word from the
// outside instead of driving horizontally through the middle of the headline.
//
// The handwriting font (Caveat) is loaded here, not in index.html, so the
// experiment stays self-contained and leaves the shipped pages untouched.

const HAND = { fontFamily: "'Caveat', ui-rounded, cursive", fontWeight: 600 } as const;

type Pt = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };
type Side = "left" | "right" | "bottom" | "top";

const f = (n: number) => n.toFixed(1);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unit = (a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};
const nearestOnBox = (b: Box, p: Pt): Pt => ({
  x: clamp(p.x, b.left, b.right),
  y: clamp(p.y, b.top, b.bottom),
});

// Tip point + incoming direction for a given approach side. The tip sits a few
// px outside the word so the arrowhead never overlaps the glyphs.
function tipFor(t: Box, side: Side): { E: Pt; dir: Pt } {
  const g = 12;
  switch (side) {
    case "left": return { E: { x: t.left - g, y: t.cy }, dir: { x: 1, y: 0 } };
    case "right": return { E: { x: t.right + g, y: t.cy }, dir: { x: -1, y: 0 } };
    case "bottom": return { E: { x: t.cx, y: t.bottom + g }, dir: { x: 0, y: -1 } };
    case "top": return { E: { x: t.cx, y: t.top - g }, dir: { x: 0, y: 1 } };
  }
}

// A curved arrow that arrives at E travelling along `dir`, with the arrowhead
// aligned to dir. The control point is placed behind E along dir so the curve
// levels out into the approach direction regardless of where it starts.
function buildArrow(S: Pt, E: Pt, dir: Pt) {
  const len = Math.hypot(E.x - S.x, E.y - S.y) || 1;
  const K = clamp(len * 0.42, 22, 78);
  const C = { x: E.x - dir.x * K, y: E.y - dir.y * K };
  const d = `M ${f(S.x)} ${f(S.y)} Q ${f(C.x)} ${f(C.y)} ${f(E.x)} ${f(E.y)}`;
  const ah = 11, ang = Math.PI / 7;
  const back = { x: -dir.x, y: -dir.y };
  const rot = (v: Pt, a: number): Pt => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const b1 = rot(back, ang), b2 = rot(back, -ang);
  const head = `M ${f(E.x + b1.x * ah)} ${f(E.y + b1.y * ah)} L ${f(E.x)} ${f(E.y)} L ${f(E.x + b2.x * ah)} ${f(E.y + b2.y * ah)}`;
  return { d, head };
}

// Three clusters, three lines each: how it decides / which model / what you get.
const CLUSTER = {
  how: { color: "#5b54e6", lines: ["Reads intent, not keywords", "Catches reasoning & vision", "Plays safe when unsure"] },
  models: { color: "#028a3e", lines: ["Haiku for the simple stuff", "Sonnet for the real work", "Opus only when it must think"] },
  outcome: { color: "#c2410c", lines: ["No quality drop", "Verified before it ships", "30-60% lower bill"] },
};

const Bullet = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span className="block leading-[1.2] text-[21px]" style={{ ...HAND, color }}>
    <span className="opacity-60">- </span>
    {children}
  </span>
);

type Arrow = { color: string; d: string; head: string };

export const HeroAnnotated = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cHow = useRef<HTMLDivElement>(null);
  const cModels = useRef<HTMLDivElement>(null);
  const cOutcome = useRef<HTMLDivElement>(null);
  const tRoute = useRef<HTMLSpanElement>(null);
  const tCheap = useRef<HTMLSpanElement>(null);
  const tHandle = useRef<HTMLSpanElement>(null);

  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Drives the draw-on reveal of the decorative annotation layer.
  const [played, setPlayed] = useState(false);
  const reducedRef = useRef(false);

  // Load the Caveat web font once, scoped to this experiment.
  useEffect(() => {
    const id = "caveat-font-experiment";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  // Kick off the reveal once the font has loaded and arrows are measured, so
  // the draw-on plays against final positions. Reduced motion -> show instantly.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    if (reduced) { setPlayed(true); return; }
    let cancelled = false;
    const start = () => setTimeout(() => { if (!cancelled) setPlayed(true); }, 150);
    if (document.fonts?.ready) document.fonts.ready.then(start).catch(start);
    else start();
    const fallback = setTimeout(() => { if (!cancelled) setPlayed(true); }, 900);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const cont = containerRef.current;
      if (!cont) return;
      const cr = cont.getBoundingClientRect();
      const box = (el: Element | null): Box | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          left: r.left - cr.left, top: r.top - cr.top,
          right: r.right - cr.left, bottom: r.bottom - cr.top,
          cx: (r.left + r.right) / 2 - cr.left, cy: (r.top + r.bottom) / 2 - cr.top,
        };
      };
      const specs: { color: string; c: Box | null; t: Box | null; side: Side }[] = [
        { color: CLUSTER.how.color, c: box(cHow.current), t: box(tRoute.current), side: "left" },
        { color: CLUSTER.models.color, c: box(cModels.current), t: box(tCheap.current), side: "right" },
        { color: CLUSTER.outcome.color, c: box(cOutcome.current), t: box(tHandle.current), side: "right" },
      ];
      const out: Arrow[] = [];
      for (const s of specs) {
        if (!s.c || !s.t) continue;
        const { E, dir } = tipFor(s.t, s.side);
        const S0 = nearestOnBox(s.c, E);
        const u = unit(S0, E);
        const S = { x: S0.x + u.x * 6, y: S0.y + u.y * 6 };
        out.push({ color: s.color, ...buildArrow(S, E, dir) });
      }
      setArrows(out);
      setSize({ w: cr.width, h: cr.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
    const t = setTimeout(measure, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);

  // Per-cluster fade/slide-in, staggered to match each arrow's draw-on.
  const clusterStyle = (i: number): React.CSSProperties => {
    const reduced = reducedRef.current;
    const delay = 420 + i * 240;
    return {
      maxWidth: 230,
      opacity: played ? 1 : 0,
      transform: played ? "none" : "translateY(3px)",
      transition: reduced ? "none" : `opacity 340ms ease-out ${delay}ms, transform 340ms ease-out ${delay}ms`,
    };
  };

  return (
    <section className="relative overflow-hidden pt-10 md:pt-14 pb-16 md:pb-20">
      <div ref={containerRef} className="relative max-w-[1240px] mx-auto px-6 sm:px-8">
        {/* ---- Arrow overlay, measured (lg+ only) ---- */}
        <svg
          className="absolute inset-0 hidden lg:block pointer-events-none"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          fill="none"
          aria-hidden
        >
          {arrows.map((a, i) => {
            const reduced = reducedRef.current;
            const lineDelay = 440 + i * 240;
            return (
              <g key={i}>
                <path
                  d={a.d}
                  stroke={a.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: played ? 0 : 1,
                    transition: reduced ? "none" : `stroke-dashoffset 520ms cubic-bezier(0.65,0,0.35,1) ${lineDelay}ms`,
                  }}
                />
                <path
                  d={a.head}
                  stroke={a.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: played ? 1 : 0,
                    transition: reduced ? "none" : `opacity 160ms ease-out ${lineDelay + 470}ms`,
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* ---- Handwritten clusters (lg+ only) ---- */}
        <div className="hidden lg:block" aria-hidden>
          <div ref={cHow} className="absolute top-0 left-0 text-left" style={clusterStyle(0)}>
            {CLUSTER.how.lines.map((l) => <Bullet key={l} color={CLUSTER.how.color}>{l}</Bullet>)}
          </div>
          <div ref={cModels} className="absolute top-[150px] right-0 text-right" style={clusterStyle(1)}>
            {CLUSTER.models.lines.map((l) => <Bullet key={l} color={CLUSTER.models.color}>{l}</Bullet>)}
          </div>
          <div ref={cOutcome} className="absolute top-[270px] right-0 text-right" style={clusterStyle(2)}>
            {CLUSTER.outcome.lines.map((l) => <Bullet key={l} color={CLUSTER.outcome.color}>{l}</Bullet>)}
          </div>
        </div>

        {/* ---- Headline + CTA ---- */}
        <div className="relative z-10 max-w-[720px] mx-auto text-center pt-8 lg:pt-[96px]">
          <h1 className="text-[40px] sm:text-[50px] lg:text-[58px] font-semibold leading-[1.12] tracking-[-0.035em] text-[#1d1d1f] [text-wrap:balance]">
            <span ref={tRoute}>Route</span> every prompt to the{" "}
            <span ref={tCheap} className="relative inline-block whitespace-nowrap">
              cheapest model
              <svg
                className="absolute pointer-events-none"
                style={{ left: "-7%", top: "-22%", width: "114%", height: "150%" }}
                viewBox="0 0 300 90"
                preserveAspectRatio="none"
                fill="none"
                aria-hidden
              >
                <path
                  d="M150 9 C 72 6, 15 25, 17 48 C 19 73, 101 85, 169 82 C 251 79, 291 59, 285 39 C 280 21, 213 9, 149 12"
                  stroke={CLUSTER.models.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: played ? 0 : 1,
                    transition: reducedRef.current ? "none" : "stroke-dashoffset 560ms cubic-bezier(0.65,0,0.35,1) 200ms",
                  }}
                />
              </svg>
            </span>{" "}
            that can <span ref={tHandle}>handle it</span>.
          </h1>

          <div className="mt-9 flex flex-col items-center gap-3">
            <SignupDialog ctaLabel="start_free" ctaLocation="hero_annotated">
              <button
                type="button"
                className="inline-flex items-center px-7 py-[15px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
              >
                Start saving
              </button>
            </SignupDialog>
            <span className="text-[13px] text-[#86868b]">No card required</span>
          </div>

          {/* Mobile fallback: clusters as a plain list */}
          <div className="lg:hidden mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5 text-left max-w-[520px] mx-auto">
            {[CLUSTER.how, CLUSTER.models, CLUSTER.outcome].map((c, i) => (
              <div key={i}>
                {c.lines.map((l) => <Bullet key={l} color={c.color}>{l}</Bullet>)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Live proof, anchored below the headline ---- */}
      <div className="relative z-10 max-w-[940px] mx-auto px-6 mt-14 md:mt-16">
        <RoutingDemoTerminal />
        <div className="mt-6 text-center">
          <a
            href="/switch"
            onClick={() => trackCtaClick("see_the_switch", "hero_annotated")}
            className="inline-flex items-center text-[13.5px] font-medium text-[#1d1d1f] no-underline tracking-[-0.01em] hover:opacity-70 transition-opacity"
          >
            See the one-line switch from OpenAI or Bedrock <span className="ml-1 text-[13px]">›</span>
          </a>
        </div>
      </div>
    </section>
  );
};
