type CodeBlockProps = {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
};

const CodeBlock = ({ label, children, accent }: CodeBlockProps) => (
  <div className="bg-white border border-black/[0.08] rounded-[14px] overflow-hidden">
    <div
      className="px-5 py-3 border-b border-black/[0.06] bg-[#fbfbfd] text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: accent ? "#0071e3" : "#86868b" }}
    >
      {label}
    </div>
    <pre className="m-0 px-6 py-6 font-mono text-[13.5px] leading-[1.7] text-[#1d1d1f] overflow-auto">
      {children}
    </pre>
  </div>
);

const HighlightedLine = ({ children }: { children: React.ReactNode }) => (
  <span
    className="block w-full -mx-3 pl-3 border-l-2 border-[#0071e3]"
    style={{ background: "rgba(0,113,227,0.08)" }}
  >
    {children}
  </span>
);

const Step = ({
  num,
  title,
  desc,
  children,
}: {
  num: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) => (
  <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-start mb-16 last:mb-0">
    <div>
      <div className="text-[13px] font-medium text-[#86868b] mb-3.5 tracking-[-0.005em]">
        Step {num}
      </div>
      <h3 className="text-[26px] md:text-[32px] font-semibold tracking-[-0.026em] m-0 mb-4 text-[#1d1d1f] leading-[1.15]">
        {title}
      </h3>
      <p className="text-[16px] md:text-[17px] text-[#424245] leading-[1.55] m-0 tracking-[-0.008em] max-w-[440px]">
        {desc}
      </p>
    </div>
    {children}
  </div>
);

export const HowItWorks = () => {
  return (
    <section className="py-24 md:py-36">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Three steps. Two minutes.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            No refactors. No new SDKs. Change two lines and set model to auto. That is the entire migration.
          </p>
        </div>

        <Step num="01" title="Swap your base URL." desc="Point your existing OpenAI client at Nadir. Your prompts, your streaming, your tool calls, all untouched.">
          <CodeBlock label="Python" accent>
            <span className="text-[#aa0d91]">import</span>{" openai\n\n"}
            {"client = openai.OpenAI(\n"}
            <HighlightedLine>
              {"    "}<span className="text-[#86868b]">base_url=</span>
              <span className="text-[#0071e3]">"https://api.getnadir.com/v1"</span>
              {",\n"}
            </HighlightedLine>
            {"    "}<span className="text-[#86868b]">api_key=</span>
            <span className="text-[#c41a16]">"ndr_..."</span>
            {"\n)"}
          </CodeBlock>
        </Step>

        <Step num="02" title="Set model to auto." desc="Nadir reads the prompt and picks the right model for the job. You can still pin a model when you need to.">
          <CodeBlock label="Request">
            {"response = client.chat.completions.create(\n"}
            <HighlightedLine>
              {"    "}<span className="text-[#86868b]">model=</span>
              <span className="text-[#0071e3]">"auto"</span>
              {",\n"}
            </HighlightedLine>
            {"    "}<span className="text-[#86868b]">messages=</span>
            {"[...]\n)"}
          </CodeBlock>
        </Step>

        <Step num="03" title="Watch your bill drop." desc="Per request cost, latency, and routing decisions appear in the dashboard as traffic flows. No instrumentation required.">
          <CodeBlock label="Response headers">
            <span className="text-[#86868b]">x-nadir-routed-to:</span>
            {"    claude-haiku-4-5\n"}
            <span className="text-[#86868b]">x-nadir-cost-usd:</span>
            {"     0.0004\n"}
            <span className="text-[#86868b]">x-nadir-cost-saved:</span>
            {"   0.0218\n"}
            <span className="text-[#86868b]">x-nadir-latency-ms:</span>
            {"   412\n"}
            <span className="text-[#86868b]">x-nadir-cached:</span>
            {"       false"}
          </CodeBlock>
        </Step>
      </div>
    </section>
  );
};
