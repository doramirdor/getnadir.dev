import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
        // Normal sign-in flow.
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
