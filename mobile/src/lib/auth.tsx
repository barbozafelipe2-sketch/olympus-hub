import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
};
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  configured: Boolean(supabase),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          if (error)
            console.warn("Unable to restore OlyHub session:", error.message);
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (alive) {
          console.warn("Unable to restore OlyHub session:", error);
          setLoading(false);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) {
        setSession(next);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  const value = useMemo(
    () => ({ session, loading, configured: Boolean(supabase) }),
    [session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
