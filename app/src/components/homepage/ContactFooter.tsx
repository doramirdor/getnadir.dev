export const ContactFooter = () => {
  return (
    <>
      {/* Quickstart */}
      <section id="quickstart" className="py-24">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              Get started now
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666]">Two commands. Seriously.</p>
          </div>

          <div className="max-w-[640px] mx-auto bg-[#0a0a0a] rounded-xl p-6 font-mono text-sm text-white">
            <div className="mb-1">
              <span className="text-[#666]">$</span>{" "}
              <span className="text-white">pip install nadirclaw</span>
            </div>
            <div className="text-[#999] mb-4">
              Successfully installed nadirclaw-0.7.0
            </div>
            <div className="mb-1">
              <span className="text-[#666]">$</span>{" "}
              <span className="text-white">nadirclaw serve</span>
            </div>
            <div className="text-[#00a86b]">
              &#10003; Router running on http://localhost:8856
            </div>
            <div className="text-[#00a86b]">
              &#10003; Dashboard at http://localhost:8856/dashboard
            </div>
          </div>

          <div className="flex justify-center gap-3 mt-8">
            <a
              href="https://github.com/doramirdor/NadirClaw"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] hover:-translate-y-px hover:shadow-lg transition-all no-underline"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <polygon points="8,0 10.47,4.63 15.6,5.39 12,9.07 12.94,14.4 8,11.84 3.06,14.4 4,9.07 0.4,5.39 5.53,4.63" />
              </svg>
              Star on GitHub
            </a>
            <a
              href="https://github.com/doramirdor/NadirClaw#readme"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md text-[15px] font-semibold hover:bg-[#f5f5f5] hover:border-[#666] hover:-translate-y-px transition-all no-underline"
            >
              Read the docs &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-16">
        <div className="max-w-[640px] mx-auto px-8">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold tracking-tight">About</h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4" />
          </div>
          <p className="text-[15px] text-[#666] leading-relaxed mb-4">
            NadirClaw is built by{" "}
            <a
              href="https://github.com/doramirdor"
              className="text-[#0066ff] hover:underline"
            >
              Dor Amir
            </a>
            , a software engineer frustrated with overpaying for simple LLM
            requests. Every "what's my balance?" query was hitting Claude Opus at
            $15/MTok when Haiku could handle it for $0.25/MTok. NadirClaw was
            born to fix that.
          </p>
          <p className="text-[15px] text-[#666] leading-relaxed mb-4">
            The project is open-source (MIT License), fully self-hosted, and
            designed to save developers 40-70% on API costs without adding
            complexity. No signup, no telemetry, no vendor lock-in.
          </p>
          <p className="text-[15px] text-[#666]">
            <strong className="text-[#0a0a0a]">Contact:</strong>{" "}
            <a
              href="mailto:amirdor@gmail.com"
              className="text-[#0066ff] hover:underline"
            >
              amirdor@gmail.com
            </a>{" "}
            &middot;{" "}
            <a
              href="https://github.com/doramirdor/NadirClaw"
              className="text-[#0066ff] hover:underline"
            >
              GitHub
            </a>{" "}
            &middot;{" "}
            <a
              href="https://www.linkedin.com/in/dor-amir-07a35155/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0066ff] hover:underline"
            >
              LinkedIn
            </a>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 text-center bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-8">
          <h2 className="text-4xl font-bold tracking-tight mb-3">
            Stop overpaying for simple prompts
          </h2>
          <p className="text-[17px] text-[#666] mb-8 max-w-[480px] mx-auto">
            Star the repo to bookmark it, or get started in 30 seconds flat.
          </p>
          <div className="flex gap-3 justify-center flex-wrap mb-4">
            <a
              href="https://github.com/doramirdor/NadirClaw"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] hover:-translate-y-px hover:shadow-lg transition-all no-underline"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <polygon points="8,0 10.47,4.63 15.6,5.39 12,9.07 12.94,14.4 8,11.84 3.06,14.4 4,9.07 0.4,5.39 5.53,4.63" />
              </svg>
              Star on GitHub
            </a>
            <a
              href="#quickstart"
              className="inline-flex items-center px-6 py-3 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md text-[15px] font-semibold hover:bg-[#f5f5f5] hover:border-[#666] hover:-translate-y-px transition-all no-underline"
            >
              pip install nadirclaw
            </a>
          </div>
          <p className="text-[13px] text-[#999]">
            Free and open source. MIT licensed. No signup required.
          </p>
        </div>
      </section>
    </>
  );
};
