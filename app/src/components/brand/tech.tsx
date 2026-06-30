/**
 * Nadir — shared primitives for the technical pitch microsite (/pitch/*).
 *
 * Same hand-drawn blueprint language as BrandHome (/redesign): pencil
 * construction lines, strawberry-pink accents, rectangular ink frames,
 * Playfair / Geist / Geist Mono / Caveat. These primitives carry the look
 * across the developer-facing pages (overview, architecture, router, API,
 * on-prem) so every page reads like one engineering specimen book.
 *
 * Everything renders inside `.nadir-brand` and consumes the palette + tactile
 * utilities defined in app/src/index.css. Nothing here leaks into the
 * dashboard / app dark mode.
 */
import { Link } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import {
  Sparkle, SketchBox, SketchRule, ConstructionField, SweepLines,
  CrossMarks, Scribble,
} from "@/components/brand/motifs";

/* ── Wordmark ────────────────────────────────────────────────────────── */

export function Wordmark({ size = "text-[24px]" }: { size?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-editorial ${size} leading-none text-[var(--ink)] tracking-[-0.01em]`}>Nadir</span>
      <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
    </span>
  );
}

/* ── Header ──────────────────────────────────────────────────────────── */

const TECH_NAV: { label: string; href: string }[] = [
  { label: "Overview", href: "#overview" },
  { label: "Architecture", href: "#architecture" },
  { label: "Routing", href: "#routing" },
  { label: "API", href: "#api" },
  { label: "Integration", href: "#integration" },
];

export function TechHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--ink)]/12"
      style={{ background: "rgba(246,242,234,0.85)", backdropFilter: "saturate(150%) blur(12px)", WebkitBackdropFilter: "saturate(150%) blur(12px)" }}>
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between">
          <Link to="/tech" className="no-underline"><Wordmark /></Link>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="On this page">
            {TECH_NAV.map((n) => (
              <a key={n.href} href={n.href}
                className="eyebrow text-[var(--ink)]/65 no-underline transition-colors hover:text-[var(--ink)]">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <Link to="/pitch" className="hidden eyebrow text-[var(--ink)]/65 no-underline hover:text-[var(--ink)] sm:inline">Pitch deck →</Link>
            <a href="/contact?reason=partner" className="btn-rect no-underline">Book a call <Sparkle className="h-3 w-3" color="var(--shell)" /></a>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

const FOOT_LINKS: { h: string; items: { label: string; href: string }[] }[] = [
  { h: "Technical guide", items: [
    { label: "Overview", href: "/tech#overview" },
    { label: "Architecture", href: "/tech#architecture" },
    { label: "Routing", href: "/tech#routing" },
  ] },
  { h: "Build", items: [
    { label: "API", href: "/tech#api" },
    { label: "Integration & on-prem", href: "/tech#integration" },
    { label: "Docs", href: "/docs" },
  ] },
  { h: "Company", items: [
    { label: "Pitch deck", href: "/pitch" },
    { label: "Self-hosted", href: "/self-host" },
    { label: "Pricing", href: "/pricing" },
  ] },
];

export function TechFooter() {
  return (
    <footer className="relative overflow-hidden bg-[var(--shell)]">
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Scribble className="absolute right-[16%] top-8 h-8 w-28 opacity-50" />
        <ConstructionField variant={2} className="absolute right-[6%] bottom-4 hidden h-20 w-28 opacity-50 lg:block" />
        <Sparkle className="absolute right-[3%] top-1/2 h-5 w-5 opacity-60" color="var(--strawberry)" />
      </div>
      <div className="relative mx-auto max-w-[1280px] px-6 py-14 lg:px-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Wordmark size="text-[26px]" />
            <p className="mt-3 eyebrow text-[var(--ink)]/50">Lowest viable. Highest standard.</p>
            <p className="mt-4 max-w-xs text-[12.5px] leading-relaxed text-[var(--ink)]/55">
              Routing infrastructure for teams who pay frontier prices for work a smaller model could do.
            </p>
          </div>
          {FOOT_LINKS.map((col) => (
            <div key={col.h}>
              <div className="eyebrow text-[var(--ink)]/55">{col.h}</div>
              <ul className="mt-4 space-y-2.5">
                {col.items.map((l) => (
                  <li key={l.label}>
                    {l.href.includes("#")
                      ? <a href={l.href} className="text-[13px] text-[var(--ink)]/70 no-underline hover:text-[var(--ink)]">{l.label}</a>
                      : <Link to={l.href} className="text-[13px] text-[var(--ink)]/70 no-underline hover:text-[var(--ink)]">{l.label}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-[var(--ink)]/15 pt-6 sm:flex-row sm:items-center">
          <span className="font-mono text-[11px] text-[var(--ink)]/55">© 2026 Nadir Labs, Inc. · Engineering brief</span>
          <span className="font-hand text-[15px] text-[var(--ink)]/70">built for the long run ↘</span>
        </div>
      </div>
    </footer>
  );
}

/* ── Page shell ──────────────────────────────────────────────────────── */

export function TechShell({
  title, description, path, track, children,
}: {
  title: string; description: string; path: string;
  track?: string; children: ReactNode;
}) {
  useEffect(() => { trackPageView(track ?? "pitch"); }, [track]);
  return (
    <div className="nadir-brand grain relative min-h-screen">
      <SEO title={title} description={description} path={path} />
      <TechHeader />
      <main>{children}</main>
      <TechFooter />
    </div>
  );
}

/* ── Scroll-spy side nav (nested TOC for the single /tech page) ──────── */

type NavItem = { id: string; label: string; sub?: { id: string; label: string }[] };

export function SideNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const ids = items.flatMap((i) => [i.id, ...(i.sub?.map((s) => s.id) ?? [])]);
    const compute = () => {
      const line = 150; // active = last titled block whose top has crossed this line
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // near the very bottom, force the last item active (short final sections never reach the line)
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = ids[ids.length - 1];
      setActive((prev) => (prev === current ? prev : current));
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [items]);

  const activeParent = items.find((i) => i.id === active || i.sub?.some((s) => s.id === active))?.id;

  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto lg:block" aria-label="Sections">
      <div className="mb-3 eyebrow text-[var(--ink)]/40">Contents</div>
      <ul className="space-y-0.5 border-l border-[var(--ink)]/12">
        {items.map((it, i) => {
          const parentOn = activeParent === it.id;
          return (
            <li key={it.id}>
              <a href={`#${it.id}`}
                className={`-ml-px flex items-center gap-2 border-l-2 py-1 pl-3 text-[12.5px] no-underline transition-colors ${parentOn ? "border-[var(--strawberry)] font-medium text-[var(--ink)]" : "border-transparent text-[var(--ink)]/55 hover:text-[var(--ink)]"}`}>
                <span className={`font-mono text-[10px] ${parentOn ? "text-[var(--strawberry)]" : "text-[var(--ink)]/35"}`}>{String(i + 1).padStart(2, "0")}</span>
                {it.label}
              </a>
              {it.sub && parentOn ? (
                <ul className="mb-1.5 mt-1 space-y-0.5">
                  {it.sub.map((s) => {
                    const on = active === s.id;
                    return (
                      <li key={s.id}>
                        <a href={`#${s.id}`}
                          className={`-ml-px flex items-center border-l-2 py-0.5 pl-7 text-[11.5px] no-underline transition-colors ${on ? "border-[var(--strawberry)] text-[var(--ink)]" : "border-transparent text-[var(--ink)]/45 hover:text-[var(--ink)]/80"}`}>
                          {s.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Eyebrow + section heads ─────────────────────────────────────────── */

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`eyebrow text-[var(--ink)]/55 ${className}`}>{children}</span>;
}

export function SectionHead({
  eyebrow, title, sub, className = "", id,
}: { eyebrow?: string; title: ReactNode; sub?: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`${id ? "scroll-mt-24 " : ""}${className}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 font-editorial text-[clamp(26px,3.2vw,40px)] font-semibold leading-[1.04] text-[var(--ink)]">{title}</h2>
      {sub ? <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[var(--ink)]/70">{sub}</p> : null}
    </div>
  );
}

/* ── Plate — a numbered "deck" section (the spine of the pitch) ──────── */

export function Plate({
  n, label, children, decals = true, id, className = "",
}: { n: string; label: string; children: ReactNode; decals?: boolean; id?: string; className?: string }) {
  return (
    <section id={id} className={`relative scroll-mt-20 overflow-hidden ${className}`}>
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      {decals ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <SweepLines className="absolute inset-0 hidden h-full w-full opacity-70 lg:block" />
          <ConstructionField variant={Number(n) % 3} className="absolute right-2 top-10 hidden h-28 w-24 opacity-50 lg:block" />
        </div>
      ) : null}
      <div className="relative mx-auto max-w-[1280px] px-6 py-16 lg:px-10 lg:py-20">
        <div className="mb-8 flex items-center gap-3">
          <span className="font-mono text-[12px] font-semibold text-[var(--strawberry)]">PLATE {n}</span>
          <span className="h-px w-8 bg-[var(--ink)]/25" />
          <span className="eyebrow text-[var(--ink)]/55">{label}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ── Annotation — hand-drawn margin note ─────────────────────────────── */

export function Annotation({ children, className = "", color = "var(--strawberry)" }: { children: ReactNode; className?: string; color?: string }) {
  return <span className={`font-hand text-[16px] ${className}`} style={{ color }}>{children}</span>;
}

/* ── Pill — mono uppercase tag ───────────────────────────────────────── */

export function Pill({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider ${accent ? "border-[var(--strawberry)]/50 text-[var(--strawberry)]" : "border-[var(--ink)]/20 text-[var(--ink)]/65"}`}>
      {children}
    </span>
  );
}

/* ── Sheet — a hand-drawn framed paper panel ─────────────────────────── */

export function Sheet({ children, className = "", tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "glacier" | "mint" | "strawberry" }) {
  const bg = {
    paper: "bg-[var(--paper)]",
    glacier: "bg-[var(--glacier)]/25",
    mint: "bg-[var(--mint)]/40",
    strawberry: "bg-[var(--strawberry)]/[0.14]",
  }[tone];
  return (
    <div className={`relative ${bg} p-5 ${className}`}>
      <SketchBox color="var(--ink)" />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ── Callout — info / warn note in blueprint frame ───────────────────── */

export function Callout({
  kind = "note", title, children,
}: { kind?: "note" | "warn" | "tip"; title?: string; children: ReactNode }) {
  const accent = kind === "warn" ? "var(--strawberry)" : kind === "tip" ? "var(--sage)" : "var(--sky)";
  const label = title ?? (kind === "warn" ? "Heads up" : kind === "tip" ? "Tip" : "Note");
  return (
    <div className="relative my-5 bg-[var(--paper)] py-4 pl-7 pr-5">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <SketchBox color="var(--ink)" detail={false} />
      <div className="relative">
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>{label}</span>
        <div className="mt-2 max-w-[68ch] text-[13px] leading-[1.65] text-[var(--ink)]/85">{children}</div>
      </div>
    </div>
  );
}

/* ── Spec table — dashed key/value rows (the "receipt" idiom) ────────── */

export function SpecTable({ rows, className = "" }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={`divide-y divide-dashed divide-[var(--ink)]/15 ${className}`}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink)]/50">{k}</dt>
          <dd className="text-right font-mono text-[12px] text-[var(--ink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Code block — blueprint code sheet ───────────────────────────────── */

function highlightLine(line: string, i: number) {
  const trimmed = line.trimStart();
  const isComment = trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("*");
  const isPrompt = trimmed.startsWith("$ ") || trimmed.startsWith("> ");
  let color = "var(--ink)";
  let opacity = 0.92;
  if (isComment) { color = "var(--ink)"; opacity = 0.42; }
  if (isPrompt) { color = "var(--strawberry)"; opacity = 1; }
  return (
    <div key={i} className="whitespace-pre" style={{ color, opacity }}>
      {line.length ? line : " "}
    </div>
  );
}

export function CodeBlock({
  code, lang = "bash", filename, caption, className = "",
}: { code: string; lang?: string; filename?: string; caption?: ReactNode; className?: string }) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure className={`relative ${className}`}>
      <div className="relative sheet overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--ink)]/12 bg-[var(--shell-deep)]/70 px-4 py-2">
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full border border-[var(--ink)]/30" />
            <span className="h-2 w-2 rounded-full border border-[var(--ink)]/30" />
            <span className="h-2 w-2 rounded-full bg-[var(--strawberry)]/70" />
          </span>
          <span className="ml-1 font-mono text-[10px] text-[var(--ink)]/55">{filename ?? lang}</span>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[var(--ink)]/40">{lang}</span>
        </div>
        <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12px] leading-[1.6]">
          <code>{lines.map(highlightLine)}</code>
        </pre>
      </div>
      {caption ? <figcaption className="mt-2 pl-1 font-hand text-[15px] text-[var(--ink)]/60">{caption}</figcaption> : null}
    </figure>
  );
}

/* ── Capability / feature card ───────────────────────────────────────── */

export function FeatureCard({
  icon, title, body, tags,
}: { icon?: ReactNode; title: string; body: string; tags?: string[] }) {
  return (
    <article className="relative flex flex-col p-5">
      <SketchBox color="var(--ink)" />
      <div className="relative flex items-start gap-2">
        {icon ?? <Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />}
        <h3 className="font-editorial text-[19px] leading-tight text-[var(--ink)]">{title}</h3>
      </div>
      {tags?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">{tags.map((t) => <Pill key={t}>{t}</Pill>)}</div>
      ) : null}
      <p className="relative mt-3 text-[12.5px] leading-relaxed text-[var(--ink)]/65">{body}</p>
    </article>
  );
}

/* ── Numbered step ───────────────────────────────────────────────────── */

export function Step({ n, title, children }: { n: string; title: string; children?: ReactNode }) {
  return (
    <div className="relative">
      <div className="flex items-baseline gap-2.5">
        <span className="font-editorial text-[26px] leading-none text-[var(--strawberry)]">{n}</span>
        <span className="eyebrow text-[var(--ink)]">{title}</span>
      </div>
      {children ? <div className="mt-2.5 text-[13px] leading-relaxed text-[var(--ink)]/65">{children}</div> : null}
    </div>
  );
}

/* ── In-page jump nav for long technical pages ───────────────────────── */

export function PageNav({ items }: { items: { label: string; href: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="On this page">
      {items.map((it, i) => (
        <a key={it.href} href={it.href} className="eyebrow text-[var(--ink)]/55 no-underline hover:text-[var(--strawberry)]">
          <span className="mr-1 text-[var(--strawberry)]">{String(i + 1).padStart(2, "0")}</span>{it.label}
        </a>
      ))}
    </nav>
  );
}

/* ── Decorative field for hero areas ─────────────────────────────────── */

export function HeroField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <SweepLines className="absolute inset-0 hidden h-full w-full lg:block" />
      <ConstructionField variant={0} className="absolute -left-2 top-1/3 hidden h-40 w-28 opacity-70 lg:block" />
      <ConstructionField variant={1} className="absolute right-0 top-1/4 hidden h-44 w-28 opacity-60 lg:block" />
      <CrossMarks className="absolute right-[6%] bottom-10 h-12 w-28 opacity-55" />
      <Sparkle className="absolute right-[13%] top-20 h-5 w-5 opacity-70" color="var(--strawberry)" />
      <Sparkle className="absolute left-[6%] bottom-[24%] hidden h-4 w-4 opacity-70 lg:block" color="var(--strawberry)" />
      <Scribble className="absolute left-[28%] top-4 hidden h-8 w-28 opacity-55 sm:block" />
    </div>
  );
}
