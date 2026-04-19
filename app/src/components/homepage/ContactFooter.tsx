import { Link } from "react-router-dom";
import { trackGitHubClick } from "@/utils/analytics";

const GROUPS: Record<string, { label: string; to: string; external?: boolean }[]> = {
  Product: [
    { label: "Pricing", to: "/pricing" },
    { label: "Docs", to: "/docs" },
    { label: "Self-host", to: "/self-host" },
    { label: "Optimize", to: "/optimize" },
    { label: "Blog", to: "/blog" },
  ],
  Company: [
    { label: "Privacy", to: "/privacy" },
    { label: "Terms", to: "/terms" },
    { label: "Contact", to: "/contact" },
  ],
  Resources: [
    { label: "GitHub", to: "https://github.com/NadirRouter/NadirClaw", external: true },
    { label: "Playground", to: "/dashboard/playground" },
    { label: "Help & FAQ", to: "/dashboard/help" },
  ],
  Compare: [
    { label: "vs OpenRouter", to: "/compare/openrouter" },
    { label: "vs Requesty", to: "/compare/requesty" },
    { label: "vs LiteLLM", to: "/compare/litellm" },
    { label: "vs Not Diamond", to: "/compare/notdiamond" },
    { label: "vs Portkey", to: "/compare/portkey" },
  ],
};

export const ContactFooter = () => {
  return (
    <footer className="bg-[#f5f5f7] pt-12 pb-8">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12 mb-10 pb-8 border-b border-black/[0.08]">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3.5">
              <img src="/logo.png" alt="Nadir" className="w-7 h-7 block" />
              <span className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-0.022em]">
                Nadir
              </span>
            </div>
            <p className="text-[12px] text-[#6e6e73] m-0 leading-[1.55] max-w-[260px]">
              Intelligent LLM router. Open source. Cut API costs up to 40%.
            </p>
          </div>
          {Object.entries(GROUPS).map(([title, links]) => (
            <div key={title}>
              <div className="text-[12px] font-semibold text-[#1d1d1f] mb-3.5 tracking-[-0.005em]">
                {title}
              </div>
              <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
                {links.map((l) =>
                  l.external ? (
                    <li key={l.label}>
                      <a
                        href={l.to}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={
                          l.label === "GitHub"
                            ? () => trackGitHubClick("footer")
                            : undefined
                        }
                        className="text-[12px] text-[#6e6e73] no-underline hover:text-[#1d1d1f] tracking-[-0.005em]"
                      >
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        to={l.to}
                        className="text-[12px] text-[#6e6e73] no-underline hover:text-[#1d1d1f] tracking-[-0.005em]"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="text-[12px] text-[#6e6e73] tracking-[-0.005em]">
            Copyright {new Date().getFullYear()} Nadir. All rights reserved.
          </div>
          <div className="flex gap-5">
            <Link
              to="/terms"
              className="text-[12px] text-[#6e6e73] no-underline hover:text-[#1d1d1f] tracking-[-0.005em]"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-[12px] text-[#6e6e73] no-underline hover:text-[#1d1d1f] tracking-[-0.005em]"
            >
              Privacy
            </Link>
            <Link
              to="/contact"
              className="text-[12px] text-[#6e6e73] no-underline hover:text-[#1d1d1f] tracking-[-0.005em]"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
