/**
 * Nadir — blueprint redesign shared shell + page primitives.
 *
 * The `/redesign/*` pages all share this header/footer/layout and a small set
 * of building blocks (PageHero, SectionHead, Panel, StatBig, HandNote) so the
 * multi-page solution stays consistent. Everything lives under `.nadir-brand`.
 */
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import {
  Sparkle, Scribble, SeedCluster, FloraSprig, ConstructionField, WaveContours,
  SketchRule, SketchBox, CompassBurst, ContourLines, CrossMarks, Birds, Sailboat,
} from "@/components/brand/motifs";
import { FooterArchArt } from "@/components/brand/illustrations";

/* ── Nav ─────────────────────────────────────────────────────────────── */

export const NAV = [
  { label: "Pricing", to: "/pricing" },
  { label: "Design partners", to: "/contact?reason=partner" },
  { label: "Calculator", to: "/calculator" },
  { label: "Docs", to: "/docs" },
  { label: "Self-host", to: "/redesign/self-hosted" },
  { label: "Blog", to: "/blog" },
];

const SOLUTIONS = [
  { to: "/optimize", label: "Context Optimize", desc: "Trim bloated payloads. Up to 70% fewer tokens." },
  { to: "/solutions/routing", label: "LLM Routing", desc: "Cheapest model that still handles the prompt." },
  { to: "/solutions/fallback", label: "Fallback", desc: "Provider down? Reroute to a healthy peer." },
  { to: "/solutions/analytics", label: "Analytics", desc: "Per-request spend, latency, and quality." },
  { to: "/solutions/clustering", label: "Prompt Clustering", desc: "See the real shape of your LLM traffic.", tag: "Soon" },
];

const GITHUB_REPO = "NadirRouter/NadirClaw";
const fmtStars = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

export function Wordmark({ size = "text-[24px]" }: { size?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-editorial ${size} leading-none text-[var(--ink)] tracking-[-0.01em]`}>Nadir</span>
      <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
    </span>
  );
}

const navLink = "text-[13px] text-[var(--ink)]/70 no-underline hover:text-[var(--ink)] transition-colors whitespace-nowrap";

function GitHubStars({ compact = false }: { compact?: boolean }) {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const cached = sessionStorage.getItem("nadirGhStars");
      if (cached) { const n = parseInt(cached, 10); if (!Number.isNaN(n)) setStars(n); }
    } catch { /* ignore */ }
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.stargazers_count !== "number") return;
        setStars(data.stargazers_count);
        try { sessionStorage.setItem("nadirGhStars", String(data.stargazers_count)); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <a href={`https://github.com/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer"
      aria-label={`Star ${GITHUB_REPO} on GitHub`}
      className={`inline-flex items-center gap-1.5 ${navLink} ${compact ? "" : ""}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
      {stars !== null && <span className="font-mono text-[12px] tabular-nums">{fmtStars(stars)}</span>}
    </a>
  );
}

function SolutionsMenu() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const openNow = () => { if (timer.current) window.clearTimeout(timer.current); setOpen(true); };
  const close = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 120); };
  return (
    <div className="relative" onMouseEnter={openNow} onMouseLeave={close}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`inline-flex items-center gap-1 ${navLink}`} aria-haspopup="menu" aria-expanded={open}>
        Solutions <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
          <div className="w-[340px] bg-[var(--paper)] p-2 shadow-[0_24px_50px_-18px_rgba(21,35,59,0.35)]" style={{ border: "1.5px solid var(--ink)", borderRadius: "255px 14px 235px 12px / 14px 235px 16px 255px" }}>
            <Link to="/solutions" className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-[var(--ink)] no-underline hover:text-[var(--strawberry)]">
              All solutions <span aria-hidden>→</span>
            </Link>
            <SketchRule className="my-1 h-1.5 w-full opacity-30" color="var(--ink)" />
            {SOLUTIONS.map((s) => (
              <Link key={s.to} to={s.to} className="block rounded-[6px] px-3 py-2.5 no-underline hover:bg-[var(--shell-deep)]">
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium text-[var(--ink)]">{s.label}</span>
                  {s.tag && <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--strawberry)]">{s.tag}</span>}
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--ink)]/55">{s.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--ink)]/12"
      style={{ background: "rgba(246,242,234,0.85)", backdropFilter: "saturate(150%) blur(12px)", WebkitBackdropFilter: "saturate(150%) blur(12px)" }}>
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6">
          <Link to="/" className="shrink-0 justify-self-start no-underline"><Wordmark /></Link>
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
            <SolutionsMenu />
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} className={navLink}>{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-4 justify-self-end">
            <span className="hidden items-center lg:flex"><GitHubStars /></span>
            <Link to="/auth" className={`hidden items-center sm:inline-flex ${navLink}`}>Log in</Link>
            <Link to="/auth" className="btn-rect press no-underline">Start saving <Sparkle className="twinkle h-3 w-3" color="var(--shell)" /></Link>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu" className="lg:hidden text-[var(--ink)]">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <nav className="border-t border-[var(--ink)]/12 bg-[var(--shell)] lg:hidden" aria-label="Mobile">
          <div className="mx-auto flex max-w-[1280px] flex-col px-6 py-2">
            <Link to="/solutions" onClick={() => setOpen(false)} className="border-b border-[var(--ink)]/10 py-3 text-[14px] font-medium text-[var(--ink)] no-underline">Solutions</Link>
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} onClick={() => setOpen(false)} className="border-b border-[var(--ink)]/10 py-3 text-[14px] text-[var(--ink)]/75 no-underline">{n.label}</Link>
            ))}
            <div className="flex items-center justify-between py-3">
              <GitHubStars />
              <Link to="/auth" onClick={() => setOpen(false)} className={navLink}>Log in</Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

const FOOT_COLS: { h: string; links: { label: string; to?: string }[] }[] = [
  { h: "Product", links: [{ label: "Overview", to: "/redesign" }, { label: "Pricing", to: "/redesign/pricing" }, { label: "Benchmarks", to: "/redesign/benchmarks" }] },
  { h: "Developer", links: [{ label: "Docs", to: "/redesign/docs" }, { label: "Self-hosted", to: "/redesign/self-hosted" }, { label: "API" }] },
  { h: "Company", links: [{ label: "About" }, { label: "Careers" }, { label: "Press" }] },
  { h: "Legal", links: [{ label: "Privacy" }, { label: "Terms" }, { label: "Security" }] },
];

function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[var(--shell)]">
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Scribble className="absolute right-[18%] top-8 h-8 w-28 opacity-50" />
        <SeedCluster className="absolute left-[40%] bottom-10 h-10 w-14 opacity-40 pencil" color="currentColor" />
        <FloraSprig className="absolute left-4 bottom-8 h-24 w-12 opacity-50" />
        <FooterArchArt className="absolute left-[10%] bottom-0 hidden h-[140px] w-[420px] opacity-70 sm:block" />
        <ConstructionField variant={2} className="absolute right-[6%] bottom-4 hidden h-20 w-28 opacity-60 lg:block" />
        <Sparkle className="twinkle absolute right-[3%] top-1/2 h-5 w-5 opacity-60" color="var(--strawberry)" />
        <WaveContours className="absolute inset-x-0 -bottom-1 mx-auto h-8 w-[60%] opacity-25 pencil" color="currentColor" />
      </div>
      <div className="relative mx-auto max-w-[1280px] px-6 py-14 lg:px-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Wordmark size="text-[26px]" />
            <p className="mt-3 eyebrow text-[var(--ink)]/50">Lowest viable. Highest standard.</p>
          </div>
          {FOOT_COLS.map((col) => (
            <div key={col.h}>
              <div className="eyebrow text-[var(--ink)]/55">{col.h}</div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.to
                      ? <Link to={l.to} className="text-[13px] text-[var(--ink)]/70 no-underline hover:text-[var(--ink)]">{l.label}</Link>
                      : <span className="cursor-default text-[13px] text-[var(--ink)]/70 hover:text-[var(--ink)]">{l.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-[var(--ink)]/15 pt-6 sm:flex-row sm:items-center">
          <span className="font-mono text-[11px] text-[var(--ink)]/55">© 2026 Nadir Labs, Inc.</span>
          <div className="flex items-center gap-3">
            <span className="hidden font-hand text-[15px] text-[var(--ink)]/70 sm:inline">built for the long run ↘</span>
            {["𝕏", "in", "◇"].map((s, i) => (
              <span key={i} className="grid h-8 w-8 place-items-center rounded-full border border-[var(--ink)]/20 font-mono text-[12px] text-[var(--ink)]/70">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────── */

export function RedesignLayout({ title, description, path, track, children }: {
  title: string; description: string; path: string; track?: string; children: ReactNode;
}) {
  useEffect(() => { if (track) trackPageView(track); }, [track]);
  return (
    <div className="nadir-brand grain relative min-h-screen">
      <SEO title={title} description={description} path={path} />
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

/* ── Page primitives ─────────────────────────────────────────────────── */

const d = (ms: number): CSSProperties => ({ ["--d" as string]: `${ms}ms` });

/** Page hero — eyebrow + big serif headline (one rose accent) + subcopy, on a
 *  light sketch field. Optional right-hand motif and hand annotation. */
export function PageHero({ eyebrow, title, accent, sub, hand, motif }: {
  eyebrow: string; title: string; accent?: string; sub: ReactNode; hand?: string; motif?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <ContourLines className="absolute -left-8 top-[26%] h-40 w-44 opacity-35 pencil" color="currentColor" />
        <ConstructionField variant={1} className="absolute right-[3%] top-[18%] hidden h-32 w-28 opacity-55 lg:block" />
        <CrossMarks className="absolute right-[24%] top-10 hidden h-9 w-16 opacity-45 lg:block" color="var(--pencil)" />
        <Sparkle className="twinkle absolute left-[42%] top-10 hidden h-4 w-4 opacity-60 lg:block" color="var(--strawberry)" />
        <Sparkle className="twinkle absolute right-[12%] bottom-6 hidden h-4 w-4 opacity-55 lg:block" color="var(--sky)" style={d(900)} />
        <Birds className="absolute right-[30%] top-7 hidden h-6 w-20 opacity-35 pencil lg:block" color="currentColor" />
      </div>
      <div className="relative mx-auto max-w-[1180px] px-6 pb-12 pt-14 lg:px-10 lg:pb-16 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <span className="rise eyebrow text-[var(--strawberry)]">{eyebrow}</span>
            <h1 className="rise mt-4 font-editorial text-[clamp(40px,6.4vw,78px)] font-semibold leading-[0.97] text-[var(--ink)]" style={d(60)}>
              {title}{accent ? <> <span className="whitespace-nowrap"><span className="italic text-[var(--strawberry)]">{accent}</span><Sparkle className="twinkle inline-block h-4 w-4 align-super" color="var(--strawberry)" /></span></> : null}
            </h1>
            <p className="rise mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--ink)]/70" style={d(160)}>{sub}</p>
            {hand && <span className="rise mt-6 inline-block font-hand text-[18px] text-[var(--ink)]/60 -rotate-1" style={d(260)}>{hand}</span>}
          </div>
          {motif && <div className="relative hidden justify-self-end lg:block">{motif}</div>}
        </div>
      </div>
    </section>
  );
}

/** Section wrapper with a hand-drawn top rule + optional sketch margin marks. */
export function Section({ id, children, className = "", tint, rule = true }: {
  id?: string; children: ReactNode; className?: string; tint?: string; rule?: boolean;
}) {
  return (
    <section id={id} className={`relative overflow-hidden ${tint ?? ""} ${className}`}>
      {rule && <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />}
      <ConstructionField variant={0} className="pointer-events-none absolute left-1 top-12 hidden h-28 w-24 opacity-50 lg:block" />
      <div className="relative mx-auto max-w-[1180px] px-6 py-16 lg:px-10 lg:py-20">{children}</div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="max-w-2xl">
      <span className="eyebrow text-[var(--strawberry)]">{eyebrow}</span>
      <h2 className="mt-3 font-editorial text-[clamp(28px,3.6vw,42px)] leading-[1.05] text-[var(--ink)]">{title}</h2>
      {note && <span className="mt-3 inline-block font-hand text-[17px] text-[var(--ink)]/60 -rotate-1">{note}</span>}
    </div>
  );
}

/** Hand-drawn framed panel. */
export function Panel({ children, className = "", tint = "bg-[var(--paper)]/55" }: { children: ReactNode; className?: string; tint?: string }) {
  return (
    <div className={`relative ${tint} ${className}`}>
      <SketchBox color="var(--ink)" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function StatBig({ v, unit = "", k, note, color = "var(--ink)" }: { v: string; unit?: string; k: string; note?: string; color?: string }) {
  return (
    <div>
      <div className="font-editorial text-[clamp(34px,4vw,52px)] leading-none tabular-nums" style={{ color }}>
        {v}<span className="text-[0.5em]">{unit}</span>
      </div>
      <div className="mt-2 eyebrow text-[var(--ink)]/70">{k}</div>
      {note && <p className="mt-2 max-w-[14rem] text-[12px] leading-snug text-[var(--ink)]/55">{note}</p>}
    </div>
  );
}

export { CompassBurst, Sailboat };
