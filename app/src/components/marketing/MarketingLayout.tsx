import { useNavigate, Link } from "react-router-dom";
import { Github, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

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

  const navLinks = [
    { to: "/pricing", label: "Pricing" },
    { to: "/docs", label: "Docs" },
    { to: "/openclaw", label: "OpenClaw" },
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
                  className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="#waitlist"
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md text-sm font-semibold hover:bg-[#333] transition-all no-underline"
              >
                Join Waitlist
              </a>
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
              <a
                href="#waitlist"
                className="px-3 py-1.5 bg-[#0a0a0a] text-white rounded-md text-xs font-semibold hover:bg-[#333] transition-all no-underline"
              >
                Join Waitlist
              </a>
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
      </header>

      <main role="main">{children}</main>

      {/* Footer */}
      <footer className="border-t border-[#e5e5e5] py-8 sm:py-12 mt-0">
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
      </footer>
    </div>
  );
};

export default MarketingLayout;
