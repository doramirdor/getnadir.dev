import { useNavigate, Link } from "react-router-dom";
import { Github } from "lucide-react";
import { useEffect, useState } from "react";

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [starCount, setStarCount] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/doramirdor/NadirClaw")
      .then((res) => res.json())
      .then((data) => {
        if (data.stargazers_count) {
          setStarCount(data.stargazers_count.toLocaleString());
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white font-['Inter',system-ui,sans-serif] text-[#0a0a0a] antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/80 backdrop-blur-md">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-[#0a0a0a] no-underline"
            >
              <img
                src="/logo.png"
                alt="Nadir"
                className="h-8 w-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="font-semibold text-[15px]">
                Nadir
              </span>
            </Link>

            <nav aria-label="Main navigation" className="flex items-center gap-6">
              <Link
                to="/docs"
                className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Docs
              </Link>
              <Link
                to="/pricing"
                className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Pricing
              </Link>
              <Link
                to="/openclaw"
                className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
              >
                OpenClaw
              </Link>
              <Link
                to="/optimize"
                className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Optimize
              </Link>
              <Link
                to="/blog"
                className="text-[#666] text-sm font-medium hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Blog
              </Link>
              <a
                href="#quickstart"
                className="px-4 py-2 bg-gradient-to-r from-[#00a86b] to-[#0066ff] text-white rounded-md text-sm font-semibold hover:-translate-y-px hover:shadow-md transition-all no-underline"
              >
                Get Started
              </a>
              <a
                href="https://github.com/doramirdor/NadirClaw"
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
          </div>
        </div>
      </header>

      <main role="main">{children}</main>

      {/* Footer */}
      <footer className="border-t border-[#e5e5e5] py-12 mt-0">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-6 text-sm">
              <Link
                to="/"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Home
              </Link>
              <Link
                to="/docs"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Docs
              </Link>
              <a
                href="https://github.com/doramirdor/NadirClaw"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://github.com/doramirdor/NadirClaw/issues"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Issues
              </a>
              <a
                href="https://github.com/doramirdor/NadirClaw/blob/main/LICENSE"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                MIT License
              </a>
              <Link
                to="/terms"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Terms
              </Link>
              <Link
                to="/privacy"
                className="text-[#666] hover:text-[#0a0a0a] transition-colors no-underline"
              >
                Privacy
              </Link>
            </nav>
            <p className="text-sm text-[#999]">
              Built by developers tired of overpaying
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
