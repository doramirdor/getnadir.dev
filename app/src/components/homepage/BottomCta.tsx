import { SignupDialog } from "@/components/marketing/SignupDialog";

export const BottomCta = () => {
  return (
    <section className="py-24 md:py-28 px-6 sm:px-8 bg-[#fbfbfd] border-t border-black/[0.06]">
      <div className="max-w-[860px] mx-auto text-center">
        <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-5">
          One last thing
        </p>
        <h2 className="text-[44px] sm:text-[60px] md:text-[72px] font-semibold tracking-[-0.035em] m-0 mb-6 leading-[1.03] text-[#1d1d1f] [text-wrap:balance]">
          Stop overpaying.{" "}
          <span
            className="px-[0.05em]"
            style={{
              backgroundImage:
                "linear-gradient(transparent 64%, rgba(48,209,88,0.34) 64%, rgba(48,209,88,0.34) 92%, transparent 92%)",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            }}
          >
            First month on us.
          </span>
        </h2>
        <p className="text-lg md:text-[21px] text-[#424245] m-0 mb-11 leading-[1.4] tracking-[-0.01em]">
          Create an account, swap one URL, set <code className="font-mono text-[0.85em] bg-black/[0.04] px-1.5 py-0.5 rounded">model="auto"</code>. Stop paying Opus rates for Haiku work.
        </p>
        <div className="flex flex-col gap-4 justify-center items-center">
          <SignupDialog ctaLabel="start_free" ctaLocation="bottom_cta">
            <button
              type="button"
              className="inline-flex items-center px-7 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
            >
              Bring your own keys
            </button>
          </SignupDialog>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-[#424245] tracking-[-0.005em] mt-1">
            <li className="inline-flex items-center gap-1.5">
              <CheckGlyph />
              Pay only on savings
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CheckGlyph />
              Cancel anytime
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CheckGlyph />
              No base fee, pay only on savings
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};

const CheckGlyph = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="text-[#028a3e]">
    <path
      d="M3.5 8.5l3 3 6-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
