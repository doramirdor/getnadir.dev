import { useEffect } from "react";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { RoutingDemoTerminal } from "@/components/homepage/RoutingDemoTerminal";
import { trackCtaClick } from "@/utils/analytics";

// Experiment: the "annotated whiteboard" hero treatment seen on script.it,
// rebuilt in Nadir's voice. Bold centered headline, the key phrase circled by
// a hand-drawn marker stroke, and three handwritten benefit clusters with
// curved arrows pointing inward. The live routing terminal anchors the promise
// below, the same way script.it drops a product screenshot under the fold.
//
// The handwriting font (Caveat) is loaded here, not in index.html, so the
// experiment is fully self-contained and leaves the shipped pages untouched.

const HAND = { fontFamily: "'Caveat', ui-rounded, cursive", fontWeight: 600 } as const;

// Three clusters, three lines each, mirroring the script.it information
// architecture: how it decides / which model / what you get.
const CLUSTERS = {
  how: {
    color: "#028a3e",
    lines: ["Reads intent, not keywords", "Spots reasoning & vision", "Plays safe when unsure"],
  },
  models: {
    color: "#5b54e6",
    lines: ["Haiku for the simple stuff", "Sonnet for the real work", "Opus only when it must think"],
  },
  outcome: {
    color: "#c2410c",
    lines: ["30-60% lower bill", "No quality drop", "Two-line install"],
  },
};

const Bullet = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span className="block leading-[1.18] text-[22px]" style={{ ...HAND, color }}>
    <span className="opacity-70">- </span>
    {children}
  </span>
);

export const HeroAnnotated = () => {
  // Inject the Caveat web font once, scoped to this experiment.
  useEffect(() => {
    const id = "caveat-font-experiment";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  return (
    <section className="relative overflow-hidden pt-10 md:pt-14 pb-16 md:pb-20">
      <div className="relative max-w-[1180px] mx-auto px-6 sm:px-8">
        {/* ---- Desktop annotation layer (decorative, lg+ only) ---- */}
        <div className="hidden lg:block" aria-hidden>
          {/* Outcome cluster — top, above the headline, arrow curving down */}
          <div className="absolute top-0 left-1/2 -translate-x-[35%] text-left">
            {CLUSTERS.outcome.lines.map((l) => (
              <Bullet key={l} color={CLUSTERS.outcome.color}>{l}</Bullet>
            ))}
          </div>
          <svg className="absolute top-[78px] left-1/2 -translate-x-[58%]" width="120" height="90" viewBox="0 0 120 90" fill="none">
            <path d="M96 6 C 70 30, 52 44, 30 80" stroke={CLUSTERS.outcome.color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 64 L 28 82 L 46 74" stroke={CLUSTERS.outcome.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>

          {/* How-it-decides cluster — left, arrow curving right toward the line */}
          <div className="absolute top-[208px] left-0 text-left">
            {CLUSTERS.how.lines.map((l) => (
              <Bullet key={l} color={CLUSTERS.how.color}>{l}</Bullet>
            ))}
          </div>
          <svg className="absolute top-[176px] left-[228px]" width="150" height="80" viewBox="0 0 150 80" fill="none">
            <path d="M6 70 C 50 64, 96 40, 142 12" stroke={CLUSTERS.how.color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M124 8 L 144 10 L 138 30" stroke={CLUSTERS.how.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>

          {/* Which-model cluster — right, arrow curving down-left to the circle */}
          <div className="absolute top-[212px] right-0 text-right">
            {CLUSTERS.models.lines.map((l) => (
              <Bullet key={l} color={CLUSTERS.models.color}>{l}</Bullet>
            ))}
          </div>
          <svg className="absolute top-[206px] right-[250px]" width="170" height="100" viewBox="0 0 170 100" fill="none">
            <path d="M162 14 C 116 30, 62 50, 12 74" stroke={CLUSTERS.models.color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M6 52 L 9 76 L 32 68" stroke={CLUSTERS.models.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        {/* ---- Headline + CTA ---- */}
        <div className="relative z-10 max-w-[860px] mx-auto text-center pt-10 lg:pt-[168px]">
          <h1 className="text-[40px] sm:text-[52px] lg:text-[60px] font-semibold leading-[1.06] tracking-[-0.035em] text-[#1d1d1f] [text-wrap:balance]">
            Route every prompt to the{" "}
            <span className="relative inline-block whitespace-nowrap">
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
            that can handle it.
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

          {/* Mobile fallback: the annotations as a plain list */}
          <div className="lg:hidden mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5 text-left max-w-[520px] mx-auto">
            {[CLUSTERS.outcome, CLUSTERS.how, CLUSTERS.models].map((c, i) => (
              <div key={i}>
                {c.lines.map((l) => (
                  <Bullet key={l} color={c.color}>{l}</Bullet>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ---- Live proof, anchored below the headline ---- */}
        <div className="relative z-10 max-w-[940px] mx-auto mt-14 md:mt-16">
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
      </div>
    </section>
  );
};
