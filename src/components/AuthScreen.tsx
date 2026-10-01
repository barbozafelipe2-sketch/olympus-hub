import { KeyRound, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { requireSupabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const client = requireSupabase();

      if (mode === "signin") {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (signInError) throw signInError;
        return;
      }

      const { data, error: signUpError } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim() || undefined
          }
        }
      });

      if (signUpError) throw signUpError;

      if (!data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
        setPassword("");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "OlyHub could not complete authentication."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="auth-mark">OH</div>
        <span className="eyebrow">Commercial OlyHub</span>
        <h1>Your AI work, in one place.</h1>
        <p>
          Projects, conversations and account data are isolated per user with
          database row-level security.
        </p>
        <div className="auth-security">
          <ShieldCheck size={18} />
          <span>Customer data is separated from the private Zeus Proxy product.</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button
            className={mode === "signin" ? "active" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
            type="button"
          >
            Create account
          </button>
        </div>

        <div className="auth-card-heading">
          {mode === "signin" ? <LogIn size={20} /> : <UserPlus size={20} />}
          <div>
            <h2>{mode === "signin" ? "Welcome back" : "Create your OlyHub account"}</h2>
            <p>
              {mode === "signin"
                ? "Sign in to access your projects."
                : "Use an email you can verify."}
            </p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              <span>Name</span>
              <input
                autoComplete="name"
                maxLength={100}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            <span>Password</span>
            <div className="password-field">
              <KeyRound size={16} />
              <input
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8+ characters"
              />
            </div>
          </label>

          {error && <div className="auth-alert error">{error}</div>}
          {message && <div className="auth-alert success">{message}</div>}

          <button className="primary-button auth-submit" disabled={busy} type="submit">
            {busy
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function BackendSetupRequired() {
  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <ShieldCheck size={28} />
        <span className="eyebrow">Configuration required</span>
        <h2>Connect the commercial Supabase project.</h2>
        <p>
          Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the
          deployment environment. No service-role key belongs in the browser.
        </p>
      </section>
    </main>
  );
}
