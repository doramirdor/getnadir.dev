import { SignupDialog } from "@/components/marketing/SignupDialog";

export const BottomCta = () => {
  return (
    <section className="py-32 md:py-40 px-6 sm:px-8 bg-[#fbfbfd] border-t border-black/[0.06]">
      <div className="max-w-[860px] mx-auto text-center">
        <h2 className="text-[44px] sm:text-[60px] md:text-[72px] font-semibold tracking-[-0.035em] m-0 mb-6 leading-[1.03] text-[#1d1d1f]">
          Stop overpaying.
          <br />
          <span className="text-[#86868b]">First month on us.</span>
        </h2>
        <p className="text-lg md:text-[21px] text-[#424245] m-0 mb-11 leading-[1.4] tracking-[-0.01em]">
          Create an account, swap one URL, set model to auto. Stop paying Opus rates for Haiku work.
        </p>
        <div className="flex flex-col gap-4 justify-center items-center">
          <SignupDialog ctaLabel="start_free" ctaLocation="bottom_cta">
            <button
              type="button"
              className="inline-flex items-center px-7 py-3.5 bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
            >
              Start free
            </button>
          </SignupDialog>
          <p className="text-[13px] text-[#86868b] m-0 tracking-[-0.01em]">
            No credit card. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
};
