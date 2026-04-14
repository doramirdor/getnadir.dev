import { useNavigate, Link } from "react-router-dom";
import { Github, Menu, X, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import PromoBanner from "@/components/PromoBanner";

function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/newsletter_subscribers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ email }),
        }
      );
      if (res.ok || res.status === 201 || res.status === 409) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[#0a0a0a] mb-1">Stay in the loop</h3>
        <p className="text-sm text-[#666]">Product updates, cost-saving tips, and new features. No spam.</p>
      </div>
      {status === "success" ? (
        <p className="text-sm text-[#00a86b] font-medium">Thanks! You're subscribed.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 text-sm border border-[#e5e5e5] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors w-full sm:w-64"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0a0a0a] text-white text-sm font-medium rounded-md hover:bg-[#333] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            Subscribe
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
      {status === "error" && (
        <p className="text-sm text-red-500">Something went wrong. Try again.</p>
      )}
    </div>
  );
}

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [starCount, setStarCount] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("https://api.github.com/repos/NadirRouter/NadirClaw")
      .then((res) => res.json())
      .then((data) => {
        if (data.stargazers_count) {
          setStarCount(data.stargazers_count.toLocaleString());
        }
      })
      .catch(() => {});
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [navigate]);

  const navLinks: { to: string; label: string; title?: string }[] = [
    { to: "/pricing", label: "Pricing" },
    { to: "/docs", label: "Docs" },
    { to: "/self-host", label: "Self-Host" },
    { to: "/optimize", label: "Optimize" },
    { to: "/blog", label: "Blog" },
  ];

  return (
    <div className="min-h-screen bg-white font-['Inter',system-ui,sans-serif] text-[#0a0a0a] antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/80 backdrop-blur-md">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-[#0a0a0a] no-underline"
            >
              <img
                src="/logo.png"
                alt="Nadir"
                className="h-7 sm:h-8 w-auto"
              />
              <span className="font-semibold text-[15px] font-mono tracking-tight">Nadir</span>
            </Link>

            {/* Desktop nav */}
            <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  title={link.title}
                  className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/auth?mode=signup"
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md text-sm font-semibold hover:bg-[#333] transition-all no-underline"
              >
                Sign Up
              </Link>
              <a
                href="https://github.com/NadirRouter/NadirClaw"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e5e5] rounded-md text-[#0a0a0a] text-sm font-medium hover:border-[#0a0a0a] hover:bg-[#fafafa] transition-all no-underline"
              >
                <Github className="h-4 w-4" />
                <span className="text-[#666]">
                  {starCount ? `${starCount} stars` : "GitHub"}
                </span>
              </a>
            </nav>

            {/* Mobile: CTA + hamburger */}
            <div className="flex md:hidden items-center gap-3">
              <Link
                to="/auth?mode=signup"
                className="px-3 py-1.5 bg-[#0a0a0a] text-white rounded-md text-xs font-semibold hover:bg-[#333] transition-all no-underline"
              >
                Sign Up
              </Link>
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

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#e5e5e5] bg-white">
            <nav className="max-w-[1120px] mx-auto px-4 py-3 flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-[#333] text-sm font-medium py-2.5 px-3 rounded-md hover:bg-gray-50 transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="https://github.com/NadirRouter/NadirClaw"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center gap-2 text-[#333] text-sm font-medium py-2.5 px-3 rounded-md hover:bg-gray-50 transition-colors no-underline"
              >
                <Github className="h-4 w-4" />
                {starCount ? `${starCount} stars` : "GitHub"}
              </a>
            </nav>
          </div>
        )}
        <PromoBanner />
      </header>

      <main role="main">{children}</main>

      {/* Newsletter + Footer */}
      <footer className="border-t border-[#e5e5e5] mt-0">
        {/* Newsletter signup */}
        <div className="border-b border-[#e5e5e5] py-8 sm:py-10">
          <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
            <NewsletterSignup />
          </div>
        </div>

        {/* Footer links */}
        <div className="py-8 sm:py-10">
          <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
              <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm">
                <Link to="/" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline">Home</Link>
                <Link to="/docs" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline">Docs</Link>
                <a href="https://github.com/NadirRouter/NadirClaw" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline" target="_blank" rel="noopener noreferrer">GitHub</a>
                <a href="https://github.com/NadirRouter/NadirClaw/issues" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline" target="_blank" rel="noopener noreferrer">Issues</a>
                <a href="https://github.com/NadirRouter/NadirClaw/blob/main/LICENSE" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline" target="_blank" rel="noopener noreferrer">MIT License</a>
                <Link to="/terms" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline">Terms</Link>
                <Link to="/privacy" className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline">Privacy</Link>
              </nav>
              <p className="text-sm text-[#999]">Built by developers tired of overpaying</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
