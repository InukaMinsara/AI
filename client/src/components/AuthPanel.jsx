import { useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient.js";

export default function AuthPanel({ session, onSession }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!supabaseConfigured || !supabase) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }

    onSession?.(result.data.session || null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    onSession?.(null);
  }

  if (session) {
    return (
      <div className="account-box">
        <div className="account-copy">
          <span className="account-avatar">{session.user.email?.[0]?.toUpperCase() || "U"}</span>
          <div>
            <strong>{session.user.email}</strong>
            <span>Cloud sync on</span>
          </div>
        </div>
        <button type="button" className="account-action" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <form className="auth-box" onSubmit={submit}>
      <div className="auth-heading">
        <strong>{mode === "signin" ? "Sign in" : "Create account"}</strong>
        <span>Sync your chats across devices.</span>
      </div>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" minLength={6} required />
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      {message && <p className="auth-message">{message}</p>}
      <button type="button" className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>
        {mode === "signin" ? "Create a new account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
