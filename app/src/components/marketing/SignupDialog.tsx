import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackAuthAttempt, trackCtaClick } from "@/utils/analytics";

const GoogleIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 256 262"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid"
    aria-hidden="true"
  >
    <path
      d="M255.878,133.451 C255.878,122.717 255.007,114.884 253.122,106.761 L130.55,106.761 L130.55,155.209 L202.497,155.209 C201.047,167.249 193.214,185.381 175.807,197.565 L175.563,199.187 L214.318,229.21 L217.003,229.478 C241.662,206.704 255.878,173.196 255.878,133.451"
      fill="#4285F4"
    />
    <path
      d="M130.55,261.1 C165.798,261.1 195.389,249.495 217.003,229.478 L175.807,197.565 C164.783,205.253 149.987,210.62 130.55,210.62 C96.027,210.62 66.726,187.847 56.281,156.37 L54.75,156.5 L14.452,187.687 L13.925,189.152 C35.393,231.798 79.49,261.1 130.55,261.1"
      fill="#34A853"
    />
    <path
      d="M56.281,156.37 C53.525,148.247 51.93,139.543 51.93,130.55 C51.93,121.556 53.525,112.853 56.136,104.73 L56.063,103 L15.26,71.312 L13.925,71.947 C5.077,89.644 0,109.517 0,130.55 C0,151.583 5.077,171.455 13.925,189.152 L56.281,156.37"
      fill="#FBBC05"
    />
    <path
      d="M130.55,50.479 C155.064,50.479 171.6,61.068 181.029,69.917 L217.873,33.943 C195.245,12.91 165.798,0 130.55,0 C79.49,0 35.393,29.301 13.925,71.947 L56.136,104.73 C66.726,73.253 96.027,50.479 130.55,50.479"
      fill="#EB4335"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const MailIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

type SignupDialogProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaLocation?: string;
};

export const SignupDialog = ({
  children,
  title = "Start 1 month free",
  subtitle = "No credit card. Cancel anytime.",
  ctaLabel = "start_saving",
  ctaLocation = "unknown",
}: SignupDialogProps) => {
  const [open, setOpen] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const { toast } = useToast();

  const handleOpenChange = (next: boolean) => {
    if (next && !open) trackCtaClick(ctaLabel, ctaLocation);
    setOpen(next);
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setOauthLoading(provider);
    trackAuthAttempt(provider, "signup");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not start signup.";
      toast({ variant: "destructive", title: "Error", description: message });
      setOauthLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-8 bg-white border-black/[0.08]">
        <div className="text-center mb-6">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.02em] text-[#1d1d1f] m-0 mb-2">
            {title}
          </DialogTitle>
          <p className="text-[14px] text-[#86868b] m-0 tracking-[-0.01em]">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={oauthLoading !== null}
            className="inline-flex items-center justify-center gap-3 px-5 py-3 bg-white text-[#1d1d1f] border border-black/[0.12] rounded-full text-[15px] font-medium hover:bg-[#f5f5f7] transition-colors tracking-[-0.01em] disabled:opacity-60"
          >
            {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("github")}
            disabled={oauthLoading !== null}
            className="inline-flex items-center justify-center gap-3 px-5 py-3 bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em] disabled:opacity-60"
          >
            {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitHubIcon />}
            Continue with GitHub
          </button>
          <Link
            to="/auth?mode=signup"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-3 px-5 py-3 bg-white text-[#1d1d1f] border border-black/[0.12] rounded-full text-[15px] font-medium hover:bg-[#f5f5f7] transition-colors tracking-[-0.01em] no-underline"
          >
            <MailIcon />
            Sign up with email
          </Link>
        </div>
        <p className="text-[12px] text-[#86868b] text-center mt-6 leading-[1.5] tracking-[-0.01em] m-0">
          By continuing, you agree to our{" "}
          <Link to="/terms" className="underline hover:text-[#1d1d1f]">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline hover:text-[#1d1d1f]">
            Privacy Policy
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
};
