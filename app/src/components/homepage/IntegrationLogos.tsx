type Brand = {
  name: string;
  mark: string;
};

const BRANDS: Brand[] = [
  { name: "Claude Code", mark: "CC" },
  { name: "Cursor", mark: "C" },
  { name: "Codex", mark: "Cx" },
  { name: "Aider", mark: "A" },
  { name: "Windsurf", mark: "W" },
  { name: "Continue", mark: "Co" },
  { name: "LangChain", mark: "LC" },
  { name: "OpenAI SDK", mark: "OA" },
];

const LogoMark = ({ brand }: { brand: Brand }) => (
  <span className="inline-flex items-center gap-2.5">
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] border border-black/[0.10] bg-white text-[#6e6e73] text-[10.5px] font-semibold tracking-[-0.01em]"
    >
      {brand.mark}
    </span>
    <span className="text-[14px] md:text-[15px] text-[#424245] font-medium tracking-[-0.012em]">
      {brand.name}
    </span>
  </span>
);

export const IntegrationLogos = () => (
  <div className="flex justify-center items-center gap-x-7 md:gap-x-9 gap-y-4 flex-wrap">
    {BRANDS.map((b) => (
      <LogoMark key={b.name} brand={b} />
    ))}
  </div>
);
