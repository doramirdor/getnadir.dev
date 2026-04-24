import { useNavigate, Link } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PromoBanner from "@/components/PromoBanner";
import { ContactFooter } from "@/components/homepage/ContactFooter";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick, trackGitHubClick } from "@/utils/analytics";

const SOLUTION_LINKS = [
  {
    to: "/optimize",
    label: "Context Optimize",
    desc: "Trim bloated payloads. Up to 70% fewer tokens.",
  },
  {
    to: "/solutions/routing",
    label: "LLM Routing",
    desc: "Cheapest model that still handles the prompt.",
  },
  {
    to: "/solutions/fallback",
    label: "Fallback",
    desc: "Provider down? Reroute to a healthy peer.",
  },
  {
    to: "/solutions/analytics",
    label: "Analytics",
    desc: "Per-request spend, latency, and quality.",
  },
  {
    to: "/solutions/clustering",
    label: "Prompt Clustering",
    desc: "See the real shape of your LLM traffic.",
    tag: "Soon",
  },
];

const NAV_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/calculator", label: "Calculator" },
  { to: "/docs", label: "Docs" },
  { to: "/self-host", label: "Self-host" },
  { to: "/blog", label: "Blog" },
];

const GITHUB_REPO = "NadirRouter/NadirClaw";

const formatStars = (n: number) => {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
};

const GitHubStarButton = ({ compact = false }: { compact?: boolean }) => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = typeof window !== "undefined" ? sessionStorage.getItem("nadirGhStars") : null;
    if (cached) {
      const parsed = parseInt(cached, 10);
      if (!Number.isNaN(parsed)) setStars(parsed);
    }
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const count = typeof data.stargazers_count === "number" ? data.stargazers_count : null;
        if (count !== null) {
          setStars(count);
          try { sessionStorage.setItem("nadirGhStars", String(count)); } catch {}
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <a
      href={`https://github.com/${GITHUB_REPO}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Star ${GITHUB_REPO} on GitHub`}
      onClick={() => trackGitHubClick("header")}
      className={
        compact
          ? "inline-flex items-center gap-1 text-[#1d1d1f] text-[12px] font-medium no-underline opacity-80 hover:opacity-100 transition-opacity"
          : "inline-flex items-center gap-1.5 text-[#1d1d1f] text-[13px] font-medium no-underline opacity-80 hover:opacity-100 transition-opacity tracking-[-0.01em]"
      }
    >
      <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
      {stars !== null && <span className="tabular-nums">{formatStars(stars)}</span>}
    </a>
  );
};

const SolutionsDropdown = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const openNow = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[#1d1d1f] text-[13.5px] font-normal opacity-80 hover:opacity-100 transition-opacity"
      >
        Solutions
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50"
        >
          <div className="w-[360px] rounded-xl border border-black/[0.08] bg-white shadow-[0_20px_40px_-12px_rgba(0,0,0,0.18)] overflow-hidden">
            <div className="p-2">
              <Link
                to="/solutions"
                onClick={() => { trackCtaClick("solutions_nav", "header_dropdown_all"); setOpen(false); }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold text-[#0a0a0a] hover:bg-[#f4f4f5] no-underline"
              >
                <span>All solutions</span>
                <span className="text-[#999]">→</span>
              </Link>
              <div className="h-px bg-black/[0.06] my-1" />
              {SOLUTION_LINKS.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  onClick={() => { trackCtaClick("solutions_nav", `header_dropdown_${s.to}`); setOpen(false); }}
                  className="block px-3 py-2.5 rounded-lg hover:bg-[#f4f4f5] no-underline"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#0a0a0a]">
                      {s.label}
                    </span>
                    {s.tag && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0066ff] bg-[#0066ff]/10 px-1.5 py-0.5 rounded-full">
                        {s.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#666] mt-0.5">{s.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [navigate]);

  return (
    <div
      className="min-h-screen bg-white text-[#1d1d1f] antialiased"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}
    >
      <header
        className="sticky top-0 z-50 border-b border-black/[0.06]"
        style={{
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        }}
      >
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2.5 text-[#1d1d1f] no-underline">
              <img src="/logo.png" alt="Nadir" className="w-7 h-7 block" />
              <span className="font-semibold text-[17px] tracking-[-0.022em]">Nadir</span>
            </Link>

            {/* Desktop nav */}
            <nav
              aria-label="Main navigation"
              className="hidden md:flex items-center gap-8"
            >
              <SolutionsDropdown />
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-[#1d1d1f] text-[13.5px] font-normal no-underline opacity-80 hover:opacity-100 transition-opacity"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-4">
              <GitHubStarButton />
              <Link
                to="/auth"
                className="text-[#1d1d1f] text-[13.5px] font-normal no-underline opacity-80 hover:opacity-100 transition-opacity"
              >
                Log in
              </Link>
              <SignupDialog ctaLabel="start_saving" ctaLocation="header">
                <button
                  type="button"
                  className="inline-flex items-center px-3.5 py-[7px] bg-[#1d1d1f] text-white rounded-full text-[13px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
                >
                  Start saving
                </button>
              </SignupDialog>
            </div>

            {/* Mobile: CTA + hamburger */}
            <div className="flex md:hidden items-center gap-2">
              <GitHubStarButton compact />
              <Link
                to="/auth"
                className="text-[#1d1d1f] text-[12px] font-normal px-2 py-1.5 no-underline opacity-80"
              >
                Log in
              </Link>
              <SignupDialog ctaLabel="start_saving" ctaLocation="header_mobile">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[#1d1d1f] text-white rounded-full text-[12px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
                >
                  Start saving
                </button>
              </SignupDialog>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-black/[0.06] bg-white">
            <nav className="max-w-[1160px] mx-auto px-4 py-3 flex flex-col gap-1">
              <div className="px-3 pt-1 pb-1 text-[11px] uppercase tracking-wider font-semibold text-[#999]">
                Solutions
              </div>
              <Link
                to="/solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[#1d1d1f] text-[14px] font-semibold py-2 px-3 rounded-md hover:bg-gray-50 transition-colors no-underline"
              >
                All solutions
              </Link>
              {SOLUTION_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between text-[#1d1d1f] text-[14px] font-normal py-2 px-3 rounded-md hover:bg-gray-50 transition-colors no-underline"
                >
                  <span>{link.label}</span>
                  {link.tag && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0066ff] bg-[#0066ff]/10 px-1.5 py-0.5 rounded-full">
                      {link.tag}
                    </span>
                  )}
                </Link>
              ))}
              <div className="h-px bg-black/[0.06] my-2" />
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-[#1d1d1f] text-[14px] font-normal py-2.5 px-3 rounded-md hover:bg-gray-50 transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
        <PromoBanner />
      </header>

      <main role="main">{children}</main>
      <ContactFooter />
    </div>
  );
};

export default MarketingLayout;
