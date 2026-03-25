import { WaitlistForm } from "@/components/WaitlistForm";

export const ContactFooter = () => {
  return (
    <>
      {/* About */}
      <section className="py-6 md:py-12">
        <div className="max-w-[640px] mx-auto px-4 sm:px-8 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">About</h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-8" />
          <p className="text-[15px] text-[#666] leading-relaxed mb-4">
            Nadir is built by{" "}
            <a
              href="https://github.com/NadirRouter"
              className="text-[#0066ff] hover:underline"
            >
              Dor Amir
            </a>
            , a software engineer frustrated with overpaying for simple LLM
            requests. Every basic query was hitting the most expensive model when
            a budget model could handle it just fine. Nadir was born to fix
            that.
          </p>
          <p className="text-[15px] text-[#666] leading-relaxed mb-4">
            The project is open-source (MIT License), fully self-hosted, and
            designed to save developers up to 38% on API costs without adding
            complexity. No signup, no telemetry, no vendor lock-in.
          </p>
          {/* Contact links with icons */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <a
              href="mailto:amirdor@gmail.com"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e5e5e5] text-[#666] hover:text-[#0a0a0a] hover:border-[#999] hover:bg-[#f5f5f5] transition-all no-underline text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              Email
            </a>
            <a
              href="https://github.com/NadirRouter/NadirClaw"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e5e5e5] text-[#666] hover:text-[#0a0a0a] hover:border-[#999] hover:bg-[#f5f5f5] transition-all no-underline text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/dor-amir-07a35155/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e5e5e5] text-[#666] hover:text-[#0a0a0a] hover:border-[#999] hover:bg-[#f5f5f5] transition-all no-underline text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-8 md:py-14 text-center bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Stop overpaying for simple prompts
          </h2>
          <p className="text-[17px] text-[#666] mb-8 max-w-[480px] mx-auto">
            Self-host for free, or{" "}
            <a href="#waitlist" className="text-[#0066ff] hover:underline font-semibold">
              join the waitlist
            </a>{" "}
            for our hosted Pro plan.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="https://github.com/NadirRouter/NadirClaw"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] transition-all no-underline"
            >
              Self-host free
            </a>
            <a
              href="#waitlist"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md text-[15px] font-semibold hover:bg-[#f5f5f5] transition-all no-underline"
            >
              Join waitlist
            </a>
          </div>
        </div>
      </section>
    </>
  );
};
