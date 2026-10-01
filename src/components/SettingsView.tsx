import {
  AlertTriangle,
  Gauge,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { deleteCurrentAccount } from "../lib/account";
import {
  loadAccountSettings,
  type AccountSettings
} from "../lib/settings";

type Props = {
  email: string;
};

function number(value: number) {
  return value.toLocaleString();
}

function limit(value: number | null) {
  return value == null ? "Not configured" : number(value);
}

export function SettingsView({ email }: Props) {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      setSettings(await loadAccountSettings());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load account settings."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function removeAccount() {
    if (deleteText !== "DELETE MY ACCOUNT" || deleting) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteCurrentAccount();
    } catch (caught) {
      setDeleting(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "OlyHub could not delete this account."
      );
    }
  }

  return (
    <section className="settings-view">
      <div className="settings-header">
        <div>
          <span className="eyebrow">Account & operations</span>
          <h2>Settings</h2>
          <p>
            Your identity, usage and account lifecycle. OlyHub does not invent plan
            pricing or quota values that are not configured.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCcw size={15} />
          {refreshing ? "Refreshing..." : "Refresh usage"}
        </button>
      </div>

      {error && <div className="settings-error">{error}</div>}

      {loading ? (
        <div className="settings-loading">Loading account state...</div>
      ) : settings ? (
        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card-title">
              <UserRound size={18} />
              <div>
                <strong>Account</strong>
                <span>Authenticated OlyHub identity</span>
              </div>
            </div>
            <dl className="settings-list">
              <div><dt>Email</dt><dd>{email}</dd></div>
              <div><dt>Plan</dt><dd>{settings.limits.plan_code}</dd></div>
              <div><dt>Status</dt><dd>{settings.limits.status}</dd></div>
              <div>
                <dt>Onboarding</dt>
                <dd>{settings.profile.onboarding_completed ? "Complete" : "Incomplete"}</dd>
              </div>
            </dl>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">
              <Gauge size={18} />
              <div>
                <strong>Usage</strong>
                <span>Recorded from provider-reported token usage</span>
              </div>
            </div>
            <dl className="settings-list">
              <div>
                <dt>Requests today</dt>
                <dd>{number(settings.usage.dailyRequests)}</dd>
              </div>
              <div>
                <dt>Tokens today</dt>
                <dd>{number(settings.usage.dailyTokens)}</dd>
              </div>
              <div>
                <dt>Tokens this month</dt>
                <dd>{number(settings.usage.monthlyTokens)}</dd>
              </div>
            </dl>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">
              <ShieldCheck size={18} />
              <div>
                <strong>Server limits</strong>
                <span>Enforced before provider tokens are spent</span>
              </div>
            </div>
            <dl className="settings-list">
              <div>
                <dt>Daily requests</dt>
                <dd>{limit(settings.limits.daily_request_limit)}</dd>
              </div>
              <div>
                <dt>Daily tokens</dt>
                <dd>{limit(settings.limits.daily_token_limit)}</dd>
              </div>
              <div>
                <dt>Monthly tokens</dt>
                <dd>{limit(settings.limits.monthly_token_limit)}</dd>
              </div>
            </dl>
            <p className="settings-note">
              “Not configured” means the account-specific database limit is empty.
              Deployment-wide server limits may still apply.
            </p>
          </section>

          <section className="settings-card danger-card">
            <div className="settings-card-title">
              <AlertTriangle size={18} />
              <div>
                <strong>Delete account</strong>
                <span>Permanently remove this OlyHub account and its private data</span>
              </div>
            </div>

            {!deleteOpen ? (
              <button
                className="danger-button"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={15} />
                Delete my account
              </button>
            ) : (
              <div className="delete-confirm">
                <p>
                  This removes your Projects, conversations, memory, artifacts,
                  execution history and private Storage objects. This cannot be undone.
                </p>
                <label>
                  <span>Type DELETE MY ACCOUNT</span>
                  <input
                    value={deleteText}
                    onChange={(event) => setDeleteText(event.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    autoComplete="off"
                  />
                </label>
                <div className="delete-actions">
                  <button
                    className="secondary-button"
                    disabled={deleting}
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteText("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger-button"
                    disabled={deleting || deleteText !== "DELETE MY ACCOUNT"}
                    onClick={() => void removeAccount()}
                  >
                    <Trash2 size={15} />
                    {deleting ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
