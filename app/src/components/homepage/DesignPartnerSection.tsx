import { Link } from "react-router-dom";
import { MessageSquare, Wrench, Lock, Sparkles } from "lucide-react";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick } from "@/utils/analytics";

// The high-touch track. Every other CTA on the page is self-serve ("Start
// saving" / "Bring your own keys"). This dark band is the one place that
// invites a company into a relationship: founder access, hands-on onboarding,
// pricing that stays put. It deliberately breaks the all-white scroll so it
// reads as the premium, founding-cohort moment right after pricing.

const PERKS = [
  {
    Icon: MessageSquare,
    title: "A direct line to the founders",
    body: "A shared channel and fast replies. The edge cases you hit become the roadmap, not a backlog ticket.",
  },
  {
    Icon: Wrench,
    title: "White-glove onboarding",
    body: "We map your traffic, tune routing to your workload, and stand up your dashboards with you. Not a docs link.",
  },
  {
    Icon: Lock,
    title: "Founder pricing, locked in",
    body: "Preferential rates that stay put as we grow. Betting on us early keeps paying off later.",
  },
  {
    Icon: Sparkles,
    title: "Ship-first access",
    body: "New models, routing controls, and analytics reach you before they reach anyone else.",
  },
];

const PARTNER_LINK = "/contact?reason=partner&source=home_design_partner";

export const DesignPartnerSection = () => {
  return (
    <section
      id="design-partner"
      className="relative overflow-hidden bg-[#0a0a0a] text-white py-24 md:py-32 px-6 sm:px-8"
    >
      {/* Soft green glow, top-left, to lift the flat black without a gradient seam. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full opacity-[0.18] blur-[120px]"
        style={{ background: "radial-gradient(circle, #30d158 0%, transparent 70%)" }}
      />
      <div className="relative max-w-[1100px] mx-auto">
        <div className="max-w-[720px]">
          <p className="text-[12px] uppercase tracking-[0.14em] font-semibold text-[#30d158] mb-5">
            Design partner program
          </p>
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.035em] leading-[1.05] m-0 mb-6 [text-wrap:balance]">
            Build the routing layer with us.
          </h2>
          <p className="text-lg md:text-[21px] text-[#a1a1a6] leading-[1.45] tracking-[-0.01em] m-0">
            We're working hands-on with a small group of teams running real LLM
            traffic in production. You bring the workload and the honest
            feedback. We tune Nadir around it and give you a direct line to the
            people building it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px mt-14 md:mt-16 rounded-[20px] overflow-hidden bg-white/[0.08] border border-white/[0.08]">
          {PERKS.map(({ Icon, title, body }) => (
            <div key={title} className="bg-[#0a0a0a] p-7 md:p-8">
              <div className="w-10 h-10 rounded-full bg-[#30d158]/[0.12] flex items-center justify-center mb-5">
                <Icon className="w-[18px] h-[18px] text-[#30d158]" aria-hidden />
              </div>
              <h3 className="text-[18px] md:text-[19px] font-semibold tracking-[-0.018em] m-0 mb-2">
                {title}
              </h3>
              <p className="text-[14.5px] text-[#a1a1a6] leading-[1.5] tracking-[-0.005em] m-0">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 md:mt-14 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <p className="text-[14px] text-[#86868b] leading-[1.55] tracking-[-0.005em] m-0 max-w-[460px]">
            A good fit if you're shipping LLM features in production and want
            routing tuned to your traffic, not a generic default. In return we
            ask for real usage and candid feedback.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <Link
              to={PARTNER_LINK}
              onClick={() => trackCtaClick("design_partner_apply", "home_design_partner")}
              className="inline-flex items-center justify-center px-7 py-[14px] bg-white text-[#0a0a0a] rounded-full text-[15px] font-medium no-underline tracking-[-0.01em] hover:bg-white/90 active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]"
            >
              Apply to be a design partner
            </Link>
            <SignupDialog ctaLabel="start_free" ctaLocation="home_design_partner">
              <button
                type="button"
                className="inline-flex items-center justify-center px-5 py-[13px] rounded-full text-[14.5px] font-medium text-white/90 hover:text-white tracking-[-0.01em] transition-colors"
              >
                Prefer self-serve? Start free
                <span className="ml-1.5 text-[14px]">›</span>
              </button>
            </SignupDialog>
          </div>
        </div>
      </div>
    </section>
  );
};
