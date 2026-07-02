import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";
import { trackAuthAttempt, trackAuthSuccess } from "@/utils/analytics";
import { getStoredAttribution } from "@/utils/attribution";
import { redeemReferralCode } from "@/services/referralsApi";
import { SEO } from "@/components/SEO";
import {
  Sparkle, ContourLines, ConstructionField, CrossMarks, Birds, SketchRule,
} from "@/components/brand/motifs";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <path d="M255.878,133.451 C255.878,122.717 255.007,114.884 253.122,106.761 L130.55,106.761 L130.55,155.209 L202.497,155.209 C201.047,167.249 193.214,185.381 175.807,197.565 L175.563,199.187 L214.318,229.21 L217.003,229.478 C241.662,206.704 255.878,173.196 255.878,133.451" fill="#4285F4"/>
    <path d="M130.55,261.1 C165.798,261.1 195.389,249.495 217.003,229.478 L175.807,197.565 C164.783,205.253 149.987,210.62 130.55,210.62 C96.027,210.62 66.726,187.847 56.281,156.37 L54.75,156.5 L14.452,187.687 L13.925,189.152 C35.393,231.798 79.49,261.1 130.55,261.1" fill="#34A853"/>
    <path d="M56.281,156.37 C53.525,148.247 51.93,139.543 51.93,130.55 C51.93,121.556 53.525,112.853 56.136,104.73 L56.063,103 L15.26,71.312 L13.925,71.947 C5.077,89.644 0,109.517 0,130.55 C0,151.583 5.077,171.455 13.925,189.152 L56.281,156.37" fill="#FBBC05"/>
    <path d="M130.55,50.479 C155.064,50.479 171.6,61.068 181.029,69.917 L217.873,33.943 C195.245,12.91 165.798,0 130.55,0 C79.49,0 35.393,29.301 13.925,71.947 L56.136,104.73 C66.726,73.253 96.027,50.479 130.55,50.479" fill="#EB4335"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
);

/** Shared blueprint field styling (warm paper fill, hairline border, ink focus). */
const FIELD =
  "w-full h-11 rounded-[2px] border border-[var(--line)] bg-[var(--paper)] px-3.5 text-[14px] text-[var(--ink)] " +
  "placeholder:text-[#a89e8b] outline-none transition-colors focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--strawberry)]/25";

const LABEL = "eyebrow block text-[var(--ink)]/55";

/** Compact routing-receipt specimen shown on the left showcase panel. Mirrors
 *  the homepage price ladder so the auth page reads as part of the same manual. */
const ROUTE_LADDER = [
  { model: "Haiku 4.5", price: "$0.0006", picked: true },
  { model: "Sonnet 4.6", price: "$0.0019" },
  { model: "Opus 4.6", price: "$0.0096" },
];

function RoutingSpecimen() {
  return (
    <div className="relative mt-10 max-w-[330px]">
      <span className="tape absolute -left-3 -top-3 z-10 h-7 w-20 -rotate-6 rounded-[2px]" aria-hidden />
      <div className="sheet relative -rotate-[0.6deg] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow text-[var(--ink)]/55">Routing receipt</span>
          <Sparkle className="twinkle h-3.5 w-3.5" color="var(--strawberry)" />
        </div>
        <ul className="space-y-2">
          {ROUTE_LADDER.map((r) => (
            <li key={r.model} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${r.picked ? "border-[var(--strawberry)] bg-[var(--strawberry)] pulse-ring" : "border-[var(--ink)]/40"}`} />
              <span className={`font-mono text-[12px] ${r.picked ? "font-semibold text-[var(--strawberry)]" : "text-[var(--ink)]/70"}`}>{r.model}</span>
              <span className="mx-1 flex-1 translate-y-[-2px] border-b border-dotted border-[var(--ink)]/25" />
              <span className={`font-mono text-[12px] tabular-nums ${r.picked ? "font-semibold text-[var(--strawberry)]" : "text-[var(--ink)]/55"}`}>{r.price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-dashed border-[var(--ink)]/15 pt-3">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--ink)] text-[9px] text-[var(--shell)]">✓</span>
          <span className="eyebrow text-[var(--ink)]/70">Verified · accept 0.91</span>
        </div>
      </div>
    </div>
  );
}

const Auth = ({ notice }: { notice?: string } = {}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [resetEmail, setResetEmail] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkUser();
  }, [navigate]);

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    // Implicit consent: clicking the OAuth button is the agreement to Terms
    // and Privacy. The visible notice below the buttons documents this.
    // (The previous explicit-checkbox gate was the source of an error during
    // Google login — users hit "Continue with Google" before ticking the box
    // and got a blocking toast. Dropped.)
    setOauthLoading(provider);
    trackAuthAttempt(provider, mode === "signup" ? "signup" : "signin");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
      setOauthLoading(null);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implicit consent — clicking "Create account" is the agreement.
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            name: name,
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // If we have a referral code from the landing URL, attempt to redeem
        // it. Fire-and-forget — failures shouldn't block signup. We only have
        // a session yet if email confirmation is disabled; otherwise the
        // redeem call from AuthCallback (post-confirm) handles it.
        const ref = getStoredAttribution().ref;
        if (ref && data.session) {
          redeemReferralCode(ref).catch(() => {});
        }
        toast({
          title: "Account created",
          description: "Check your email to confirm your account.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        trackAuthSuccess("email", data.user.id, data.user.email ?? undefined);
        toast({
          title: "Welcome back",
          description: "Successfully signed in.",
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + '/auth?mode=reset',
      });

      if (error) throw error;

      toast({
        title: "Email sent",
        description: "Check your email for a password reset link.",
      });
      setResetEmail("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === "signin" ? "Welcome back"
    : mode === "signup" ? "Create your account"
    : "Reset your password";
  const subheading =
    mode === "signin" ? "Sign in to match every request to the model that fits the task."
    : mode === "signup" ? "Start matching every prompt to the model that fits, at the cost that fits."
    : "Enter your email and we'll send you a reset link.";

  return (
    <div className="nadir-brand grain relative min-h-screen overflow-hidden bg-[var(--shell)]">
      <SEO
        title={mode === "signup" ? "Create your account · Nadir" : "Sign in · Nadir"}
        description="Access your Nadir dashboard. Intelligent LLM routing that matches every request to the model that fits, at the cost that fits."
        path="/auth"
      />

      {/* Decorative sketch field */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <ContourLines animate className="pencil absolute -left-10 top-[22%] hidden h-44 w-48 opacity-30 lg:block" color="currentColor" />
        <ConstructionField variant={1} className="pencil absolute right-[6%] top-[14%] hidden h-28 w-24 opacity-50 lg:block" color="currentColor" />
        <CrossMarks className="pencil absolute right-[30%] top-10 hidden h-8 w-16 opacity-45 lg:block" color="currentColor" />
        <Birds className="pencil absolute left-[46%] top-8 hidden h-6 w-20 opacity-30 lg:block" color="currentColor" />
        <Sparkle className="twinkle absolute left-[8%] bottom-[18%] hidden h-4 w-4 opacity-60 lg:block" color="var(--sky)" />
        <Sparkle className="twinkle absolute right-[10%] bottom-[24%] hidden h-4 w-4 opacity-55 lg:block" color="var(--strawberry)" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1200px] grid-cols-1 lg:grid-cols-2">
        {/* Left showcase panel (desktop) */}
        <div className="relative hidden flex-col justify-between px-10 py-12 lg:flex xl:px-14">
          <Link to="/" className="inline-flex items-center gap-1.5 no-underline">
            <span className="font-editorial text-[24px] leading-none tracking-[-0.01em] text-[var(--ink)]">Nadir</span>
            <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
          </Link>

          <div className="max-w-md">
            <div className="mb-6 flex items-center gap-3">
              <span className="eyebrow text-[var(--ink)]/50">AI routing infrastructure</span>
              <span className="h-px w-8 bg-[var(--line)]" />
            </div>
            <h2 className="font-editorial text-[clamp(38px,4.4vw,54px)] font-semibold leading-[0.98] text-[var(--ink)]">
              Right model.<br />
              <span className="whitespace-nowrap">
                <span className="italic text-[var(--strawberry)]">Right cost.</span>
                <Sparkle className="twinkle inline-block h-4 w-4 align-super" color="var(--strawberry)" />
              </span>
            </h2>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-[var(--ink)]/70">
              Nadir matches every request to the model that fits the task, then
              verifies the result. Right-sized cost, no quality lost.
            </p>

            <RoutingSpecimen />

            <span className="mt-8 inline-block font-hand text-[19px] -rotate-1 text-[var(--ink)]/65">
              every answer, a receipt ↘
            </span>
          </div>

          <div className="flex items-center gap-8">
            <div>
              <div className="font-editorial text-[30px] leading-none text-[var(--terracotta)]">60%</div>
              <div className="mt-1.5 eyebrow text-[var(--ink)]/55">lower cost</div>
            </div>
            <span className="h-9 w-px bg-[var(--line)]" />
            <div>
              <div className="font-editorial text-[30px] leading-none text-[var(--ink)]">98%</div>
              <div className="mt-1.5 eyebrow text-[var(--ink)]/55">quality kept</div>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-10 lg:border-l lg:border-[var(--ink)]/12">
          <div className="w-full max-w-[400px]">
            {/* Mobile logo */}
            <Link to="/" className="mb-10 inline-flex items-center gap-1.5 no-underline lg:hidden">
              <span className="font-editorial text-[22px] leading-none tracking-[-0.01em] text-[var(--ink)]">Nadir</span>
              <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
            </Link>

            {notice && (
              <div className="mb-6 rounded-[2px] border border-[var(--line)] bg-[var(--paper)]/70 px-4 py-3 text-[13px] text-[var(--ink)]/70">
                {notice}
              </div>
            )}

            <div className="mb-7">
              <h1 className="font-editorial text-[30px] leading-tight text-[var(--ink)]">{heading}</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink)]/60">{subheading}</p>
            </div>

            {mode === "forgot" ? (
              <>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="reset-email" className={LABEL}>Email</label>
                    <input
                      id="reset-email"
                      type="email"
                      placeholder="you@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      className={FIELD}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="press flex w-full items-center justify-center gap-2 rounded-[2px] bg-[var(--ink)] py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--shell)] transition-colors hover:bg-[var(--ink-soft)] disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Send reset link <ArrowRight className="h-3.5 w-3.5" /></>)}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="text-[13px] text-[var(--ink)]/60 transition-colors hover:text-[var(--ink)]"
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* OAuth buttons */}
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={oauthLoading !== null}
                    onClick={() => handleOAuthSignIn("google")}
                    className="press flex w-full items-center justify-center gap-2.5 rounded-[2px] border border-[var(--ink)]/20 bg-[var(--paper)] py-2.5 text-[13.5px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]/45 hover:bg-[var(--blush-soft)] disabled:opacity-60"
                  >
                    {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    disabled={oauthLoading !== null}
                    onClick={() => handleOAuthSignIn("github")}
                    className="press flex w-full items-center justify-center gap-2.5 rounded-[2px] border border-[var(--ink)]/20 bg-[var(--paper)] py-2.5 text-[13.5px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]/45 hover:bg-[var(--blush-soft)] disabled:opacity-60"
                  >
                    {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitHubIcon />}
                    Continue with GitHub
                  </button>
                </div>

                {/*
                  Passive ToS notice for OAuth signup. Matches the SignupDialog
                  footer — visible reference without a blocking checkbox, so
                  Google/GitHub flows never hit "Agreement required" errors.
                */}
                {mode === "signup" && (
                  <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--ink)]/50">
                    By continuing, you agree to our{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="ed-link text-[var(--terracotta)]">Terms</a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="ed-link text-[var(--terracotta)]">Privacy Policy</a>.
                  </p>
                )}

                {/* Divider */}
                <div className="relative my-6">
                  <SketchRule className="h-2 w-full opacity-30" color="var(--ink)" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--shell)] px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]/45">
                    or with email
                  </span>
                </div>

                <form
                  onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
                  className="space-y-4"
                >
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <label htmlFor="name" className={LABEL}>Full name</label>
                      <input
                        id="name"
                        type="text"
                        placeholder="Jane Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className={FIELD}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className={LABEL}>Email</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={FIELD}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="password" className={LABEL}>Password</label>
                    <input
                      id="password"
                      type="password"
                      placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className={FIELD}
                    />
                  </div>

                  {mode === "signin" && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-[12px] text-[var(--ink)]/55 transition-colors hover:text-[var(--terracotta)]"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="press flex w-full items-center justify-center gap-2 rounded-[2px] bg-[var(--ink)] py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--shell)] transition-colors hover:bg-[var(--ink-soft)] disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <>
                        {mode === "signin" ? "Sign in" : "Create account"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>

                  {/*
                    Implicit-consent notice for signup. Rendered below the
                    submit button (matching SignupDialog's pattern) so the
                    visible ToS/Privacy reference is preserved without a
                    blocking checkbox. Clicking "Create account" (or any
                    OAuth button above) constitutes agreement.
                  */}
                  {mode === "signup" && (
                    <p className="text-center text-[11px] leading-relaxed text-[var(--ink)]/50">
                      By creating an account, you agree to our{" "}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="ed-link text-[var(--terracotta)]">Terms of Service</a>{" "}
                      and{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="ed-link text-[var(--terracotta)]">Privacy Policy</a>.
                    </p>
                  )}
                </form>

                <div className="mt-7 border-t border-dashed border-[var(--ink)]/12 pt-5 text-center">
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="text-[13px] text-[var(--ink)]/60 transition-colors hover:text-[var(--ink)]"
                  >
                    {mode === "signin" ? (
                      <>Don't have an account? <span className="font-medium text-[var(--terracotta)]">Sign up</span></>
                    ) : (
                      <>Already have an account? <span className="font-medium text-[var(--terracotta)]">Sign in</span></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
