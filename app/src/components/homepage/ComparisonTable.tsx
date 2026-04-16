const features = [
  {
    name: "Auto Classification",
    nadirclaw: { icon: "check", text: "Sentence embeddings" },
    litellm: { icon: "none", text: "You write it" },
    openrouter: { icon: "dash", text: "" },
    helicone: { icon: "dash", text: "" },
    portkey: { icon: "dash", text: "" },
    premium: { icon: "dash", text: "" },
  },
  {
    name: "Cost-Based Routing",
    nadirclaw: { icon: "check", text: "Automatic" },
    litellm: { icon: "check", text: "Manual rules" },
    openrouter: { icon: "none", text: "Manual model pick" },
    helicone: { icon: "none", text: "Fallbacks only" },
    portkey: { icon: "check", text: "Rule-based" },
    premium: { icon: "dash", text: "Fixed model" },
  },
  {
    name: "Agentic/Reasoning detection",
    nadirclaw: { icon: "check", text: "Auto" },
    litellm: { icon: "none", text: "You write it" },
    openrouter: { icon: "dash", text: "" },
    helicone: { icon: "dash", text: "" },
    portkey: { icon: "dash", text: "" },
    premium: { icon: "none", text: "N/A" },
  },
  {
    name: "Fallback chains",
    nadirclaw: { icon: "check", text: "Per-tier" },
    litellm: { icon: "check", text: "Built-in" },
    openrouter: { icon: "check", text: "" },
    helicone: { icon: "dash", text: "" },
    portkey: { icon: "check", text: "" },
    premium: { icon: "dash", text: "" },
  },
  {
    name: "Observability",
    nadirclaw: { icon: "check", text: "+ Prometheus" },
    litellm: { icon: "none", text: "You add it" },
    openrouter: { icon: "none", text: "Basic stats" },
    helicone: { icon: "check", text: "Full suite" },
    portkey: { icon: "check", text: "Full suite" },
    premium: { icon: "none", text: "Provider dashboard" },
  },
  {
    name: "Context Optimize",
    nadirclaw: { icon: "check", text: "Lossless" },
    litellm: { icon: "cross", text: "" },
    openrouter: { icon: "cross", text: "" },
    helicone: { icon: "cross", text: "" },
    portkey: { icon: "cross", text: "" },
    premium: { icon: "cross", text: "" },
  },
  {
    name: "Setup effort",
    nadirclaw: { icon: "none", text: "1 URL swap", bold: true },
    litellm: { icon: "none", text: "Days of engineering" },
    openrouter: { icon: "none", text: "Account + config" },
    helicone: { icon: "none", text: "SDK integration" },
    portkey: { icon: "none", text: "SDK integration" },
    premium: { icon: "none", text: "None" },
  },
  {
    name: "Pricing",
    nadirclaw: { icon: "check", text: "Free tier + Pro from $9/mo", bold: true },
    litellm: { icon: "none", text: "Free (your time)" },
    openrouter: { icon: "none", text: "Per-token markup" },
    helicone: { icon: "none", text: "Free 10K, Pro $79/mo" },
    portkey: { icon: "none", text: "Free 10K, Pro $$" },
    premium: { icon: "none", text: "Full price" },
  },
];

type CellData = { icon: string; text: string; bold?: boolean };

const CellContent = ({ cell }: { cell: CellData }) => (
  <span className={cell.bold ? "font-bold" : ""}>
    {cell.icon === "check" && (
      <span className="text-[#00a86b] font-bold mr-1">&#10003;</span>
    )}
    {cell.icon === "cross" && (
      <span className="text-red-400 font-bold mr-1">&#10007;</span>
    )}
    {cell.icon === "dash" && !cell.text && (
      <span className="text-[#ccc]">&mdash;</span>
    )}
    {cell.icon === "dash" && cell.text && (
      <>
        <span className="text-[#ccc] mr-1">&mdash;</span>
        {cell.text}
      </>
    )}
    {cell.icon !== "dash" && cell.text}
  </span>
);

export const ComparisonTable = () => {
  return (
    <section
      className="py-6 md:py-10 bg-gradient-to-b from-white via-[#fafafa] to-white"
      id="compare"
    >
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            How we compare
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Verified against each product's public docs and pricing pages.
          </p>
        </div>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="border-b border-[#e5e5e5]">
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  Feature
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold bg-[#0066ff]/5 text-[#0066ff] rounded-t-lg">
                  Nadir
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  LiteLLM + rules
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  OpenRouter
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  Helicone
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  Portkey
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-[#999]">
                  Always premium
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, i) => (
                <tr
                  key={i}
                  className={`border-b border-[#f0f0f0] ${
                    i % 2 === 0 ? "" : "bg-[#fafafa]/50"
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-[#0a0a0a]">
                    {feature.name}
                  </td>
                  <td className="py-3 px-4 text-sm bg-[#0066ff]/5">
                    <CellContent cell={feature.nadirclaw} />
                  </td>
                  <td className="py-3 px-4 text-sm text-[#666]">
                    <CellContent cell={feature.litellm} />
                  </td>
                  <td className="py-3 px-4 text-sm text-[#666]">
                    <CellContent cell={feature.openrouter} />
                  </td>
                  <td className="py-3 px-4 text-sm text-[#666]">
                    <CellContent cell={feature.helicone} />
                  </td>
                  <td className="py-3 px-4 text-sm text-[#666]">
                    <CellContent cell={feature.portkey} />
                  </td>
                  <td className="py-3 px-4 text-sm text-[#666]">
                    <CellContent cell={feature.premium} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-[13px] text-[#999] text-center">
          Verified against each product's public docs. The "LiteLLM + rules"
          column reflects what you'd build yourself on top of a gateway.
        </p>
      </div>
    </section>
  );
};
