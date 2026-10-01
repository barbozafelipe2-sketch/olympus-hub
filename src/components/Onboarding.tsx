import {
  Brain,
  FolderKanban,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import { completeOnboarding } from "../lib/settings";

type Props = {
  onComplete: (destination: "home" | "project") => void;
};

export function Onboarding({ onComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(destination: "home" | "project") {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await completeOnboarding();
      onComplete(destination);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "OlyHub could not save onboarding state."
      );
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" role="dialog" aria-modal="true">
        <div className="auth-mark">OH</div>
        <span className="eyebrow">Welcome to OlyHub</span>
        <h1>Your work should outlive the chat.</h1>
        <p className="onboarding-lead">
          Zeus is the default. Projects keep the context that should still exist
          tomorrow: conversations, memory, files and artifacts.
        </p>

        <div className="onboarding-points">
          <article>
            <Sparkles size={19} />
            <div>
              <strong>Use Zeus first</strong>
              <span>OlyHub chooses the route and keeps OpenAI as fallback.</span>
            </div>
          </article>
          <article>
            <FolderKanban size={19} />
            <div>
              <strong>Move serious work into Projects</strong>
              <span>Projects restore where you left off across sessions.</span>
            </div>
          </article>
          <article>
            <Brain size={19} />
            <div>
              <strong>Approve what OlyHub remembers</strong>
              <span>Project memory is explicit, bounded and removable.</span>
            </div>
          </article>
        </div>

        {error && <div className="auth-alert error">{error}</div>}

        <div className="onboarding-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void finish("home")}
          >
            Start with Zeus
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void finish("project")}
          >
            {busy ? "Saving..." : "Create my first Project"}
          </button>
        </div>
      </section>
    </div>
  );
}
