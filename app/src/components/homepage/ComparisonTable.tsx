type Cell = true | false | string;

const ROWS: { feature: string; cells: [Cell, Cell, Cell, Cell, Cell] }[] = [
  { feature: "Automatic model selection", cells: [true, false, "Manual", "Rules", false] },
  { feature: "OpenAI compatible API", cells: [true, true, true, true, false] },
  { feature: "BYOK and hosted keys", cells: [true, "BYOK only", true, "BYOK only", true] },
  { feature: "Semantic cache included", cells: [true, false, false, true, false] },
  { feature: "Per request cost dashboard", cells: [true, false, true, true, false] },
  { feature: "Provider failover", cells: [true, false, true, true, true] },
  { feature: "Starts free", cells: [true, true, false, true, false] },
];

const COLS = ["Nadir", "OpenRouter", "Requesty", "Portkey", "DIY"];

const renderCell = (v: Cell) => {
  if (v === true) return <span className="text-[#028a3e] font-medium text-[16px]">✓</span>;
  if (v === false) return <span className="text-[#c7c7cc] text-[16px]">·</span>;
  return <span className="text-[13px] text-[#424245]">{v}</span>;
};

export const ComparisonTable = () => {
  return (
    <section className="py-24 md:py-36">
      <div className="max-w-[1040px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            What the other gateways are missing.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            The routing gateways you already know, with the pieces that actually lower your bill.
          </p>
        </div>

        <div className="bg-white border border-black/[0.08] rounded-[18px] overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse text-[14px] min-w-[560px]">
            <thead>
              <tr className="bg-[#fbfbfd] border-b border-black/[0.06]">
                <th className="text-left px-7 py-5 font-medium text-[13px] text-[#86868b] tracking-[-0.005em]">
                  Feature
                </th>
                {COLS.map((c, i) => (
                  <th
                    key={c}
                    className="text-center px-6 py-5 font-semibold text-[14px] text-[#1d1d1f] tracking-[-0.01em]"
                    style={{ background: i === 0 ? "rgba(0,113,227,0.04)" : "transparent" }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => (
                <tr
                  key={row.feature}
                  className={ri < ROWS.length - 1 ? "border-b border-black/[0.05]" : ""}
                >
                  <td className="px-7 py-[18px] text-[#1d1d1f] tracking-[-0.005em]">{row.feature}</td>
                  {row.cells.map((v, i) => (
                    <td
                      key={i}
                      className="text-center px-6 py-[18px]"
                      style={{ background: i === 0 ? "rgba(0,113,227,0.04)" : "transparent" }}
                    >
                      {renderCell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
