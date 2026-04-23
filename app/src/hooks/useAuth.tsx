import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { trackAuthSuccess } from '@/utils/analytics';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const handleAuthChange = useCallback((event: AuthChangeEvent, newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    setLoading(false);

    switch (event) {
      case 'SIGNED_OUT':
        // Session expired or user signed out — clear any cached application state.
        // Layout already renders <Auth /> when user is null, so no redirect needed.
        break;

      case 'TOKEN_REFRESHED':
        // Token was successfully refreshed — no action needed, session is updated above.
        break;

      case 'SIGNED_IN':
      case 'INITIAL_SESSION':
        // Central PostHog identify point. Per-page callers (Auth.tsx email
        // signin, AuthCallback.tsx OAuth) previously raced the Supabase URL
        // hash exchange and silently dropped identify on OAuth returns,
        // leaving those users as anonymous PostHog distinct_ids. Because
        // `person_profiles: 'identified_only'` is set in index.html, no
        // identify means no person row and the user becomes invisible in
        // the funnel. Firing here guarantees identify on every sign-in
        // path. trackAuthSuccess is idempotent per (userId, tab session)
        // via sessionStorage so per-page callers don't double-capture.
        if (newSession?.user) {
          const provider =
            (newSession.user.app_metadata?.provider as string | undefined) ?? 'email';
          trackAuthSuccess(provider, newSession.user.id);
        }
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST (Supabase best practice).
    // This handles all auth events: sign-in, sign-out, token refresh, etc.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    // Then get the initial session.
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);
    }).catch(() => {
      // If initial session fetch fails (e.g. network down), mark loading as done
      // so the app renders the auth page rather than showing a spinner forever.
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [handleAuthChange]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
