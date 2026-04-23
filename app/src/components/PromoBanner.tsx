import { useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { SignupDialog } from "@/components/marketing/SignupDialog";

const DISMISS_KEY = "nadir_promo_banner_dismissed";

export default function PromoBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative bg-[#0a0a0a] text-white text-center text-sm py-2.5 px-4">
      <div className="max-w-[1120px] mx-auto flex items-center justify-center gap-2 flex-wrap">
        <span className="font-medium">
          <span className="font-bold">First month free</span>
          {" "}only pay for what we save you. Use code{" "}
          <code className="bg-white/15 px-1.5 py-0.5 rounded text-xs font-mono font-bold">
            FIRST1
          </code>
          {" "}at checkout
        </span>
        {/* Opens the SignupDialog modal in place rather than full-page navigating
            to /auth. Keeps the homepage context (incl. campaign referrer) and
            cuts a load off the signup flow — the biggest drop in our funnel is
            homepage → auth page. */}
        <SignupDialog ctaLabel="promo_get_started" ctaLocation="promo_banner">
          <button
            type="button"
            className="inline-flex items-center px-3 py-1 bg-white text-[#0a0a0a] text-xs font-semibold rounded-md hover:bg-gray-100 transition-colors ml-1 border-0 cursor-pointer"
          >
            Get started
          </button>
        </SignupDialog>
        <Link
          to="/terms#promotions"
          className="text-white/60 text-xs hover:text-white/80 transition-colors no-underline ml-1"
        >
          Terms apply
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white transition-colors"
        aria-label="Dismiss promotion banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
