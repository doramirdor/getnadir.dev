/**
 * Nadir blueprint redesign — Solutions hub + detail pages.
 *
 * One data-driven file: the /solutions overview lists every capability, and
 * each capability (Context Optimize, LLM Routing, Fallback, Analytics, Prompt
 * Clustering) renders the same blueprint detail template. Copy is grounded in
 * the real product; numbers stay consistent with the canonical claims.
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { RedesignLayout, PageHero, Section, SectionHead, Panel, StatBig } from "@/components/brand/redesign";
import {
  CompassBurst, RoutePath, VerifierSeal, OrbitTrails, DataTicks, SignalDots,
  DottedGrid, InkSweep, FlowDiagram, Sparkle, FloraSprig,
} from "@/components/brand/motifs";

type Feature = { k: string; v: string };
type Stat = { v: string; unit?: string; k: string; color?: string };
type Solution = {
  slug: string;
  nav: string;
  eyebrow: string;
  title: string;
  accent: string;
  sub: ReactNode;
  hand: string;
  tag?: string;
  blurb: string;
  features: Feature[];
  stats?: Stat[];
  motif: ReactNode;
};

const ST = "var(--strawberry)";

const SOLUTIONS: Solution[] = [
  {
    slug: "optimize",
    nav: "Context Optimize",
    eyebrow: "Context Optimize",
    title: "Trim the prompt,",
    accent: "keep the meaning.",
    sub: <>Nadir strips dead weight from every payload: redundant boilerplate, stale history, bloated system prompts. You pay for signal, not filler. Safe mode never touches anything that would change the answer.</>,
    hand: "up to 70% fewer tokens",
    blurb: "Cut token spend before the model even runs, without touching output quality.",
    features: [
      { k: "Safe by default", v: "Only trims what provably doesn't change the answer. Quality stays put." },
      { k: "Up to 70% fewer tokens", v: "On bloated payloads, the optimizer routinely removes most of the dead weight." },
      { k: "System, history, and context", v: "Works across the whole prompt: instructions, prior turns, and retrieved context." },
      { k: "Logged per request", v: "Every trim is measured, so you can see exactly what each call saved." },
    ],
    stats: [{ v: "70", unit: "%", k: "Fewer tokens, up to", color: ST }, { v: "0", k: "Quality lost in safe mode" }],
    motif: <InkSweep className="h-8 w-44 opacity-90" color="var(--ink)" />,
  },
  {
    slug: "routing",
    nav: "LLM Routing",
    eyebrow: "LLM Routing",
    title: "The cheapest model",
    accent: "that still holds.",
    sub: <>A trained pre-classifier reads each prompt in under 10 ms and picks the lowest viable tier. Borderline answers are scored by a calibrated verifier before they ship, and escalated only when they fall short.</>,
    hand: "start low, climb only if needed",
    blurb: "Send every prompt to the leanest capable model, verified before it ships.",
    features: [
      { k: "Sub-10 ms pre-classifier", v: "A trained model picks the tier with no extra LLM call on the confident path." },
      { k: "Verifier-gated escalation", v: "Cheap answers are scored before shipping; weak ones climb to a stronger model." },
      { k: "Per-key quality floor", v: "Pin any API key above a threshold and that traffic always runs premium." },
      { k: "Cross-provider tiers", v: "Route across Claude, GPT, and Gemini on one OpenAI-compatible surface." },
    ],
    stats: [{ v: "60", unit: "%", k: "Lower cost vs always-Opus", color: ST }, { v: "98", unit: "%", k: "Of top-model quality" }],
    motif: <CompassBurst animate className="h-28 w-28 opacity-90" color={ST} />,
  },
  {
    slug: "fallback",
    nav: "Fallback",
    eyebrow: "Fallback",
    title: "Provider down?",
    accent: "Stay up.",
    sub: <>When a provider errors or times out, Nadir reroutes the request to a healthy peer on your configured chain. Your app never sees the outage, and never has to retry it itself.</>,
    hand: "no single point of failure",
    blurb: "Automatic failover across providers so an upstream outage never reaches your users.",
    features: [
      { k: "Health-aware routing", v: "Rolling provider health scores steer traffic away from degraded endpoints." },
      { k: "Configurable chains", v: "Define the order Nadir falls back through: Anthropic, OpenAI, Google, your call." },
      { k: "Automatic retries", v: "A failed call is retried against the next healthy peer, transparently." },
      { k: "Zero-downtime", v: "Your app keeps getting answers while a provider recovers." },
    ],
    motif: <OrbitTrails className="h-24 w-40 opacity-80 float-slow" color="var(--ink)" />,
  },
  {
    slug: "analytics",
    nav: "Analytics",
    eyebrow: "Analytics",
    title: "Every request,",
    accent: "on the record.",
    sub: <>Per-request spend, latency, quality, and the model that answered, with savings measured against your baseline. Nothing happens in your LLM stack that you can't see.</>,
    hand: "see what you spend",
    blurb: "A receipt for every call and dashboards for the whole fleet.",
    features: [
      { k: "Per-request receipts", v: "Model, confidence, tokens, cost, and latency for every routed call." },
      { k: "Spend and latency", v: "Track cost and P50 / P95 latency over time, by model and by key." },
      { k: "Model-mix breakdown", v: "See how much traffic each tier carries, and where the money goes." },
      { k: "Savings tracking", v: "Every request is scored against your baseline so savings are auditable." },
    ],
    motif: <DataTicks className="h-16 w-44 opacity-80" color="var(--ink)" />,
  },
  {
    slug: "clustering",
    nav: "Prompt Clustering",
    eyebrow: "Prompt Clustering",
    title: "See the shape of",
    accent: "your traffic.",
    sub: <>Cluster your prompts to find the patterns: what repeats, what's expensive, and where dedup and caching would pay off. The map of your LLM workload, drawn for you.</>,
    hand: "coming soon",
    tag: "Soon",
    blurb: "Group prompts semantically to surface dedup, caching, and cost-hotspot opportunities.",
    features: [
      { k: "Semantic clustering", v: "Group prompts by meaning, not exact match, to see real usage patterns." },
      { k: "Traffic patterns", v: "Find the handful of shapes that make up the bulk of your calls." },
      { k: "Dedup opportunities", v: "Spot near-duplicate traffic that semantic caching could collapse." },
      { k: "Cost hotspots", v: "See which clusters quietly run up the bill." },
    ],
    motif: <SignalDots className="h-24 w-36 opacity-90" />,
  },
];

const bySlug = (slug: string) => SOLUTIONS.find((s) => s.slug === slug) ?? SOLUTIONS[0];

/* ── Detail template ─────────────────────────────────────────────────── */

function SolutionDetailView({ s }: { s: Solution }) {
  return (
    <RedesignLayout
      title={`Nadir · ${s.nav}`}
      description={s.blurb}
      path={s.slug === "optimize" ? "/optimize" : `/solutions/${s.slug}`}
      track={`brand_redesign_solution_${s.slug}`}
    >
      <PageHero
        eyebrow={s.tag ? `${s.eyebrow} · ${s.tag}` : s.eyebrow}
        title={s.title}
        accent={s.accent}
        sub={s.sub}
        hand={s.hand}
        motif={<div className="grid place-items-center">{s.motif}</div>}
      />

      {/* what it does */}
      <Section rule={false}>
        <SectionHead eyebrow="What it does" title={s.blurb} />
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {s.features.map((f) => (
            <Panel key={f.k} className="p-6">
              <div className="flex items-start gap-2.5">
                <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0" color={ST} />
                <div>
                  <h3 className="font-editorial text-[20px] text-[var(--ink)]">{f.k}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink)]/65">{f.v}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      {/* stats (optional) */}
      {s.stats && (
        <Section tint="bg-[var(--shell-deep)]">
          <SectionHead eyebrow="The payoff" title="Numbers, not adjectives." note="reproducible" />
          <div className="mt-10 flex flex-wrap gap-x-16 gap-y-8">
            {s.stats.map((st) => <StatBig key={st.k} {...st} />)}
          </div>
          <p className="mt-8 font-mono text-[11px] text-[var(--ink)]/55">
            Cost and quality figures are measured against an always-Opus baseline on held-out RouterBench. See the <Link to="/redesign/benchmarks" className="text-[var(--ink)] underline decoration-[var(--strawberry)] underline-offset-2">benchmarks</Link>.
          </p>
        </Section>
      )}

      {/* CTA */}
      <Section tint={s.stats ? undefined : "bg-[var(--shell-deep)]"}>
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <SectionHead eyebrow="Get started" title={s.tag ? "On the roadmap. Want early access?" : "Two lines to switch."} />
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/auth" className="btn-rect press no-underline">{s.tag ? "Join the waitlist" : "Start routing"}</Link>
            <Link to="/redesign/docs" className="eyebrow text-[var(--ink)] no-underline ed-link">Read the docs →</Link>
          </div>
        </div>
      </Section>
    </RedesignLayout>
  );
}

/** Detail pages — slug derived from the last path segment so it works for the
 *  explicit /solutions/routing, /fallback, /analytics, /clustering routes. */
export function SolutionDetail() {
  const slug = useLocation().pathname.split("/").filter(Boolean).pop() || "routing";
  return <SolutionDetailView s={bySlug(slug)} />;
}

/** /optimize — dedicated route for the Context Optimize page. */
export function OptimizeSolution() {
  return <SolutionDetailView s={bySlug("optimize")} />;
}

/* ── Overview hub ────────────────────────────────────────────────────── */

const HUB_ICONS: Record<string, ReactNode> = {
  optimize: <InkSweep className="h-6 w-24" color="var(--ink)" />,
  routing: <RoutePath className="h-10 w-20" color="var(--ink)" />,
  fallback: <FlowDiagram className="h-10 w-20" color="var(--ink)" />,
  analytics: <DataTicks className="h-9 w-24" color="var(--ink)" />,
  clustering: <DottedGrid className="h-9 w-20" color="var(--ink)" />,
};

export default function SolutionsOverview() {
  return (
    <RedesignLayout
      title="Nadir · Solutions"
      description="Routing, optimization, failover, and analytics in one OpenAI-compatible layer between your app and the models."
      path="/solutions"
      track="brand_redesign_solutions"
    >
      <PageHero
        eyebrow="Solutions"
        title="One router,"
        accent="every job."
        sub={<>Routing, optimization, failover, and analytics, in one OpenAI-compatible layer between your app and the models. Turn on what you need, keep your own keys.</>}
        hand="the whole toolkit"
        motif={<VerifierSeal className="seal-spin h-44 w-44 opacity-90" color="var(--ink)" />}
      />

      <Section rule={false}>
        <SectionHead eyebrow="The suite" title="Pick the pieces you need." />
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => {
            const to = s.slug === "optimize" ? "/optimize" : `/solutions/${s.slug}`;
            return (
              <Link key={s.slug} to={to} className="no-underline">
                <Panel className="flex h-full flex-col p-6 lift">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow text-[var(--ink)]/55">{s.nav}</span>
                    {s.tag && <span className="rounded-full bg-[var(--strawberry)]/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--strawberry)]">{s.tag}</span>}
                  </div>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-[var(--ink)]/70">{s.blurb}</p>
                  <div className="mt-6 flex items-end justify-between border-t border-dashed border-[var(--ink)]/15 pt-4">
                    <span className="opacity-80">{HUB_ICONS[s.slug]}</span>
                    <span className="eyebrow text-[var(--strawberry)]">Explore →</span>
                  </div>
                </Panel>
              </Link>
            );
          })}
          <Panel className="flex h-full flex-col justify-center p-6" tint="bg-[var(--ink)]">
            <FloraSprig className="h-16 w-10 opacity-60" />
            <p className="mt-4 font-editorial text-[22px] leading-snug text-[var(--shell)]">Not sure where to start?</p>
            <Link to="/redesign/docs" className="mt-3 eyebrow text-[var(--coral)] no-underline ed-link">Read the docs →</Link>
          </Panel>
        </div>
      </Section>
    </RedesignLayout>
  );
}
