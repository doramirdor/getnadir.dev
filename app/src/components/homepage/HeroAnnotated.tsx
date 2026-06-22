import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { RoutingDemoTerminal } from "@/components/homepage/RoutingDemoTerminal";
import { trackCtaClick } from "@/utils/analytics";

// Experiment: the "annotated whiteboard" hero treatment seen on script.it,
// rebuilt in Nadir's voice. Bold centered headline, the key phrase circled by
// a hand-drawn marker stroke, and three handwritten benefit clusters whose
// curved arrows actually point at the word each one annotates. The live
// routing terminal anchors the promise below, the way script.it drops a
// product screenshot under the fold.
//
// Arrows are not hand-positioned: we measure the real bounding boxes of the
// target words and the cluster boxes after layout (and after the web font
// loads), then draw each arrow from cluster -> word. That keeps every arrow
// landing on its target across widths and font swaps.
//
// The handwriting font (Caveat) is loaded here, not in index.html, so the
// experiment stays self-contained and leaves the shipped pages untouched.

const HAND = { fontFamily: "'Caveat', ui-rounded, cursive", fontWeight: 600 } as const;

type Pt = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };

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

// A gently curved arrow from S to E with an arrowhead sitting at E.
function buildArrow(S: Pt, E: Pt) {
  const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2;
  const dx = E.x - S.x, dy = E.y - S.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = clamp(len * 0.12, 8, 24);
  const C = { x: mx + (-dy / len) * off, y: my + (dx / len) * off };
  const d = `M ${S.x.toFixed(1)} ${S.y.toFixed(1)} Q ${C.x.toFixed(1)} ${C.y.toFixed(1)} ${E.x.toFixed(1)} ${E.y.toFixed(1)}`;
  const u = unit(C, E); // tangent at the tip
  const ah = 11, ang = Math.PI / 7;
  const rot = (s: number): Pt => ({
    x: -(u.x * Math.cos(s) - u.y * Math.sin(s)),
    y: -(u.x * Math.sin(s) + u.y * Math.cos(s)),
  });
  const r1 = rot(ang), r2 = rot(-ang);
  const head = `M ${(E.x + r1.x * ah).toFixed(1)} ${(E.y + r1.y * ah).toFixed(1)} L ${E.x.toFixed(1)} ${E.y.toFixed(1)} L ${(E.x + r2.x * ah).toFixed(1)} ${(E.y + r2.y * ah).toFixed(1)}`;
  return { d, head };
}

// Three clusters, three lines each: how it decides / which model / what you get.
const CLUSTER = {
  how: { color: "#028a3e", lines: ["Reads intent, not keywords", "Catches reasoning & vision", "Plays safe when unsure"] },
  models: { color: "#5b54e6", lines: ["Haiku for the simple stuff", "Sonnet for the real work", "Opus only when it must think"] },
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
  const tEvery = useRef<HTMLSpanElement>(null);
  const tCheap = useRef<HTMLSpanElement>(null);
  const tHandle = useRef<HTMLSpanElement>(null);

  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
      const pairs = [
        { color: CLUSTER.how.color, c: box(cHow.current), t: box(tEvery.current) },
        { color: CLUSTER.models.color, c: box(cModels.current), t: box(tCheap.current) },
        { color: CLUSTER.outcome.color, c: box(cOutcome.current), t: box(tHandle.current) },
      ];
      const out: Arrow[] = [];
      for (const p of pairs) {
        if (!p.c || !p.t) continue;
        const tExp: Box = { ...p.t, left: p.t.left - 3, top: p.t.top - 3, right: p.t.right + 3, bottom: p.t.bottom + 3 };
        const E0 = nearestOnBox(tExp, { x: p.c.cx, y: p.c.cy });
        const S0 = nearestOnBox(p.c, E0);
        const dir = unit(S0, E0);
        const E = { x: E0.x - dir.x * 9, y: E0.y - dir.y * 9 }; // tip sits just off the word
        const S = { x: S0.x + dir.x * 6, y: S0.y + dir.y * 6 };
        out.push({ color: p.color, ...buildArrow(S, E) });
      }
      setArrows(out);
      setSize({ w: cr.width, h: cr.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    // Re-measure once the handwriting font loads (cluster widths shift).
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
    const t = setTimeout(measure, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);

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
          {arrows.map((a, i) => (
            <g key={i}>
              <path d={a.d} stroke={a.color} strokeWidth="2.5" strokeLinecap="round" />
              <path d={a.head} stroke={a.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
        </svg>

        {/* ---- Handwritten clusters (lg+ only) ---- */}
        <div className="hidden lg:block" aria-hidden>
          <div ref={cHow} className="absolute top-[6px] left-0 text-left" style={{ maxWidth: 232 }}>
            {CLUSTER.how.lines.map((l) => <Bullet key={l} color={CLUSTER.how.color}>{l}</Bullet>)}
          </div>
          <div ref={cModels} className="absolute top-[78px] right-0 text-right" style={{ maxWidth: 232 }}>
            {CLUSTER.models.lines.map((l) => <Bullet key={l} color={CLUSTER.models.color}>{l}</Bullet>)}
          </div>
          <div ref={cOutcome} className="absolute top-[152px] left-0 text-left" style={{ maxWidth: 232 }}>
            {CLUSTER.outcome.lines.map((l) => <Bullet key={l} color={CLUSTER.outcome.color}>{l}</Bullet>)}
          </div>
        </div>

        {/* ---- Headline + CTA ---- */}
        <div className="relative z-10 max-w-[720px] mx-auto text-center pt-2 lg:pt-6">
          <h1 className="text-[40px] sm:text-[50px] lg:text-[58px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#1d1d1f] [text-wrap:balance]">
            Route{" "}
            <span ref={tEvery}>every prompt</span>{" "}
            to the{" "}
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
                  stroke="#028a3e"
                  strokeWidth="3"
                  strokeLinecap="round"
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
            {[CLUSTER.outcome, CLUSTER.how, CLUSTER.models].map((c, i) => (
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
