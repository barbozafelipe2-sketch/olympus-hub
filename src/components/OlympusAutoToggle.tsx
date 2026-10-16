import { useEffect, useState } from "react";
import { requireSupabase } from "../lib/supabase";

export const autoModeKey = (ownerId: string) => `olyhub.olympusAuto.v1.${ownerId}`;
export function readOlympusAuto(ownerId: string): boolean {
  try { return localStorage.getItem(autoModeKey(ownerId)) === "true"; } catch { return false; }
}

export function OlympusAutoToggle({ disabled = false }: { disabled?: boolean }) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = (id: string | null) => { if (active) { setOwnerId(id); setEnabled(id ? readOlympusAuto(id) : false); } };
    void requireSupabase().auth.getSession().then(({ data }) => load(data.session?.user.id ?? null));
    const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => load(session?.user.id ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <label className="olympus-auto" title="Automatically use Olympus for complex tasks when your account and budget allow it. Off keeps Zeus; you can still select Olympus manually.">
    <input type="checkbox" checked={enabled} disabled={disabled || !ownerId} onChange={event => {
      const next = event.target.checked;
      try { localStorage.setItem(autoModeKey(ownerId!), String(next)); setEnabled(next); setError(""); }
      catch { setError("Unable to save preference. Try again."); }
    }} /> Olympus automatic: {enabled ? "On" : "Off"}
    {error && <span role="alert">{error}</span>}
  </label>;
}
