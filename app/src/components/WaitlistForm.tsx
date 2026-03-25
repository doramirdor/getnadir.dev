import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BatchVisualization } from "@/components/BatchVisualization";

interface WaitlistFormProps {
  variant?: "inline" | "card";
  source?: string;
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

export const WaitlistForm = ({ variant = "inline", source = "website" }: WaitlistFormProps) => {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [showBanner, setShowBanner] = useState(false);
  const processedRef = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Add user to waitlist after OAuth sign-in or on any authenticated visit
  useEffect(() => {
    if (processedRef.current) return;

    async function addToWaitlistIfNeeded() {
      // Check if we're returning from an OAuth waitlist flow
      const pendingWaitlist = sessionStorage.getItem("nadir-waitlist-pending");
      const hasAuthTokens = window.location.hash.includes("access_token") || window.location.search.includes("code=");

      if (!pendingWaitlist && !hasAuthTokens) return;

      processedRef.current = true;
      sessionStorage.removeItem("nadir-waitlist-pending");

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.email) return;

        const userEmail = session.user.email;

        // Check if already on list
        const { data: existing } = await supabase
          .from("waitlist_entries")
          .select("position")
          .eq("email", userEmail)
          .maybeSingle();

        if (existing) {
          setMsg("You're already on the list!");
          setDone(true);
          setShowBanner(true);
          return;
        }

        const meta = session.user.user_metadata || {};
        const avatarUrl = meta.avatar_url || meta.picture || null;
        const displayName = meta.full_name || meta.name || null;

        const { count } = await supabase
          .from("waitlist_entries")
          .select("*", { count: "exact", head: true });

        const position = (count ?? 0) + 1;
        const batch_number = Math.floor((position - 1) / 100) + 1;

        const insertData: Record<string, any> = {
          email: userEmail,
          position,
          batch_number,
          display_name: displayName,
          source,
        };
        // Only include avatar_url if column exists (graceful handling)
        if (avatarUrl) insertData.avatar_url = avatarUrl;

        const { error: insertError } = await supabase.from("waitlist_entries").insert(insertData);

        if (insertError) {
          // If avatar_url column doesn't exist, retry without it
          if (insertError.message?.includes("avatar_url")) {
            delete insertData.avatar_url;
            await supabase.from("waitlist_entries").insert(insertData);
          } else {
            throw insertError;
          }
        }

        setMsg("You're on the waitlist!");
        setDone(true);
        setShowBanner(true);
        (await import("@/utils/analytics")).trackWaitlistSignup("google", source);

        window.history.replaceState(null, "", window.location.pathname);
      } catch (err) {
        console.error("OAuth waitlist error:", err);
      }
    }

    // Listen for auth state change (catches OAuth return reliably)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && sessionStorage.getItem("nadir-waitlist-pending")) {
        addToWaitlistIfNeeded();
      }
    });

    // Also try immediately (for page reload after redirect)
    addToWaitlistIfNeeded();

    return () => subscription.unsubscribe();
  }, []);

  // Auto-dismiss banner
  useEffect(() => {
    if (!showBanner) return;
    const t = setTimeout(() => setShowBanner(false), 6000);
    return () => clearTimeout(t);
  }, [showBanner]);

  async function signInWith(provider: "google" | "github") {
    // Flag that user came from waitlist — picked up after OAuth redirect
    sessionStorage.setItem("nadir-waitlist-pending", source);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      sessionStorage.removeItem("nadir-waitlist-pending");
      console.error("OAuth error:", error);
      setMsg("Something went wrong. Try the email option instead.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true);
    setMsg("");

    try {
      const { count } = await supabase
        .from("waitlist_entries")
        .select("*", { count: "exact", head: true });

      const position = (count ?? 0) + 1;
      const batch_number = Math.floor((position - 1) / 100) + 1;

      const { error } = await supabase.from("waitlist_entries").insert({
        email: email.trim().toLowerCase(),
        position,
        batch_number,
        display_name: email.charAt(0).toUpperCase(),
        source,
      });

      if (error) {
        if (error.code === "23505") {
          setMsg("You're already on the list!");
        } else {
          throw error;
        }
      } else {
        setMsg("You're on the waitlist!");
      }

      setDone(true);
      setShowBanner(true);
      import("@/utils/analytics").then(a => a.trackWaitlistSignup("email", source));
    } catch (err) {
      console.error("Waitlist error:", err);
      const existing = JSON.parse(localStorage.getItem("nadir-waitlist") || "[]");
      existing.push({ email, ts: Date.now() });
      localStorage.setItem("nadir-waitlist", JSON.stringify(existing));
      setMsg("You're on the list!");
      setDone(true);
      setShowBanner(true);
    } finally {
      setEmail("");
      setLoading(false);
    }
  }

  const banner = showBanner && (
    <div className="fixed top-0 left-0 right-0 z-[9999] animate-[slideDown_0.3s_ease-out]">
      <div className="max-w-lg mx-auto mt-4 bg-[#0a0a0a] text-white rounded-xl px-5 py-3 flex items-center gap-3 shadow-2xl">
        <span className="flex-shrink-0 w-6 h-6 bg-[#00a86b] rounded-full flex items-center justify-center text-white text-xs font-bold">&#10003;</span>
        <span className="text-sm font-medium flex-1">{msg || "You're on the list!"}</span>
        <button onClick={() => setShowBanner(false)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>
    </div>
  );

  const formContent = !done ? (
    <>
      {/* OAuth buttons */}
      <div className={`grid grid-cols-2 gap-2 ${variant === "inline" ? "mb-3" : "mb-4"}`}>
        <button
          onClick={() => signInWith("google")}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            variant === "inline"
              ? "bg-gray-800 border border-gray-600 text-white hover:bg-gray-700"
              : "bg-white border border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#fafafa]"
          }`}
        >
          <GoogleIcon />
          Google
        </button>
        <button
          onClick={() => signInWith("github")}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            variant === "inline"
              ? "bg-gray-800 border border-gray-600 text-white hover:bg-gray-700"
              : "bg-white border border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#fafafa]"
          }`}
        >
          <GitHubIcon />
          GitHub
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex-1 h-px ${variant === "inline" ? "bg-gray-700" : "bg-[#e5e5e5]"}`} />
        <span className={`text-xs ${variant === "inline" ? "text-gray-400" : "text-[#999]"}`}>or</span>
        <div className={`flex-1 h-px ${variant === "inline" ? "bg-gray-700" : "bg-[#e5e5e5]"}`} />
      </div>

      {/* Email form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={loading}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm transition-all ${
            variant === "inline"
              ? "bg-gray-800 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20"
              : "bg-white border border-[#e5e5e5] text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#0066ff] focus:ring-1 focus:ring-[#0066ff]/20"
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all disabled:opacity-50 ${
            variant === "inline"
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "bg-gradient-to-r from-[#00a86b] to-[#0066ff] text-white hover:-translate-y-px hover:shadow-lg"
          }`}
        >
          {loading ? "Joining..." : "Join waitlist"}
        </button>
      </form>
    </>
  ) : (
    <div className={`flex items-center justify-center gap-2 py-3 font-semibold text-sm ${
      variant === "inline" ? "text-blue-400" : "text-[#00a86b]"
    }`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="2 8.5 6 12.5 14 3.5" />
      </svg>
      {msg}
    </div>
  );

  if (variant === "card") {
    return (
      <>
        {banner}
        <div id="waitlist" ref={sectionRef}>
          {/* Form section */}
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="text-2xl font-bold mb-2">Join the waitlist for hosted Pro</h3>
            <p className="text-sm text-[#666] mb-6">
              Get notified when the hosted version launches. You only pay a share of what we save you. No savings, no charge.
            </p>
            <div className="max-w-lg mx-auto">{formContent}</div>
            {!done && (
              <p className="text-xs text-[#999] mt-3">
                Free and open source stays free. Pro adds hosted proxy + advanced algorithms.
              </p>
            )}
          </div>

          {/* Full-width batch visualization */}
          <BatchVisualization />

          {/* Self-host quickstart */}
          <div className="mt-10 text-center max-w-[640px] mx-auto">
            <h3 className="text-lg font-semibold tracking-tight mb-2 text-[#666]">Or self-host the free version</h3>
            <p className="text-[#999] text-xs mb-4">Two commands. No signup required.</p>
            <div className="bg-[#0a0a0a] rounded-xl p-5 font-mono text-sm text-white text-left">
              <div className="mb-1"><span className="text-[#666]">$</span> <span className="text-white">pip install nadir</span></div>
              <div className="text-[#999] mb-3">Successfully installed nadir-0.7.0</div>
              <div className="mb-1"><span className="text-[#666]">$</span> <span className="text-white">nadir serve</span></div>
              <div className="text-[#00a86b]">&#10003; Router running on http://localhost:8856</div>
              <div className="text-[#00a86b]">&#10003; Dashboard at http://localhost:8856/dashboard</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Inline variant (for pricing tier)
  return (
    <>
      {banner}
      <div ref={sectionRef}>{formContent}</div>
    </>
  );
};
