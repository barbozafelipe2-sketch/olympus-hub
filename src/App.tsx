import {
  Archive,
  ChevronDown,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen, BackendSetupRequired } from "./components/AuthScreen";
import { Onboarding } from "./components/Onboarding";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { SettingsView } from "./components/SettingsView";
import { useAuth } from "./hooks/useAuth";
import { sendChat } from "./lib/api";
import {
  archiveProject,
  createProject,
  listProjects,
  type ProjectRow
} from "./lib/projects";
import { getOnboardingState } from "./lib/settings";
import { requireSupabase } from "./lib/supabase";
import {
  MODES,
  type ChatMessage,
  type ModeId
} from "./types";

type View = "home" | "projects" | "settings";

type RunMeta = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
  executionId: string | null;
  calls: number;
  multiProvider: boolean;
  degraded: boolean;
  route: string;
  totalTokens: number;
  usageRecorded: boolean;
} | null;

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Welcome to OlyHub. Use Home for open-ended work, or Projects when the work needs a durable goal, files and artifacts.",
    createdAt: new Date().toISOString()
  }
];

function makeId() {
  return crypto.randomUUID();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export default function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mode, setMode] = useState<ModeId>("zeus");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta>(null);
  const [error, setError] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  const user = auth.user;

  const selectedMode = useMemo(
    () => MODES.find((item) => item.id === mode) ?? MODES[0],
    [mode]
  );

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setSelectedProject(null);
      setOnboardingComplete(null);
      return;
    }

    let active = true;
    setProjectsLoading(true);
    setProjectError(null);

    void listProjects()
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch((caught) => {
        if (!active) return;
        setProjectError(
          caught instanceof Error ? caught.message : "Unable to load projects."
        );
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void getOnboardingState()
      .then((completed) => {
        if (active) setOnboardingComplete(completed);
      })
      .catch(() => {
        if (active) setOnboardingComplete(true);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  if (!auth.configured) return <BackendSetupRequired />;

  if (auth.loading) {
    return (
      <main className="auth-shell single">
        <section className="auth-card setup-card">
          <div className="auth-mark">OH</div>
          <span className="eyebrow">OlyHub</span>
          <h2>Restoring your workspace...</h2>
        </section>
      </main>
    );
  }

  if (!user) return <AuthScreen />;

  const userId = user.id;

  function chooseView(next: View) {
    setSelectedProject(null);
    setView(next);
    setMobileNavOpen(false);
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setPrompt("");
    setError(null);
    setRunMeta(null);
    setIsSending(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const result = await sendChat(
        { messages: nextMessages, mode },
        controller.signal
      );

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: result.reply,
          createdAt: new Date().toISOString()
        }
      ]);

      setRunMeta({
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        requestId: result.requestId,
        executionId: result.executionId,
        calls: result.orchestration.calls,
        multiProvider: result.orchestration.multiProvider,
        degraded: result.orchestration.degraded,
        route: [...new Set(result.trace.map((entry) => entry.provider))].join(" → "),
        totalTokens: result.usage.totalTokens,
        usageRecorded: result.usageRecorded
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "The request timed out before the server completed it."
          : err instanceof Error
            ? err.message
            : "Unexpected request failure.";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || projectBusy) return;

    setProjectBusy(true);
    setProjectError(null);

    try {
      const project = await createProject({
        ownerId: userId,
        name,
        goal: projectGoal
      });

      setProjects((current) => [project, ...current]);
      setSelectedProject(project);
      setView("projects");
      setProjectName("");
      setProjectGoal("");
      setProjectDialogOpen(false);
    } catch (caught) {
      setProjectError(
        caught instanceof Error ? caught.message : "Unable to create project."
      );
    } finally {
      setProjectBusy(false);
    }
  }

  async function removeProject(projectId: string) {
    setProjectError(null);

    try {
      await archiveProject(projectId);
      setProjects((current) =>
        current.filter((project) => project.id !== projectId)
      );
      setSelectedProject((current) =>
        current?.id === projectId ? null : current
      );
    } catch (caught) {
      setProjectError(
        caught instanceof Error ? caught.message : "Unable to archive project."
      );
    }
  }

  async function signOut() {
    setError(null);
    const { error: signOutError } = await requireSupabase().auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileNavOpen ? "sidebar-open" : "")}>
        <div className="brand-row">
          <div className="brand-mark">OH</div>
          <div>
            <strong>OlyHub</strong>
            <span>One AI Environment</span>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setMessages(initialMessages);
            setRunMeta(null);
            setError(null);
            chooseView("home");
          }}
        >
          <Plus size={17} />
          New chat
        </button>

        <nav className="nav-stack" aria-label="Primary navigation">
          <button
            className={view === "home" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("home")}
          >
            <Home size={18} />
            Home
          </button>
          <button
            className={view === "projects" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("projects")}
          >
            <FolderKanban size={18} />
            Projects
          </button>
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("settings")}
          >
            <Settings2 size={18} />
            Settings
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="account-card">
          <UserRound size={17} />
          <div>
            <strong>{user.user_metadata.display_name || "OlyHub member"}</strong>
            <span>{user.email}</span>
          </div>
          <button
            className="account-signout"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div className="commercial-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Commercial build</strong>
            <span>Customer-safe defaults. No personal Zeus Proxy data.</span>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="workspace">
        {selectedProject ? (
          <ProjectWorkspace
            project={selectedProject}
            ownerId={userId}
            onBack={() => setSelectedProject(null)}
            onProjectTouched={(projectId, updatedAt) => {
              setProjects((current) =>
                current.map((project) =>
                  project.id === projectId
                    ? { ...project, updated_at: updatedAt }
                    : project
                )
              );
              setSelectedProject((current) =>
                current?.id === projectId
                  ? { ...current, updated_at: updatedAt }
                  : current
              );
            }}
          />
        ) : (
          <>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div>
              <span className="eyebrow">
                {view === "home"
                  ? "Home"
                  : view === "projects"
                    ? "Project workspace"
                    : "Account"}
              </span>
              <h1>
                {view === "home"
                  ? "Talk to OlyHub"
                  : view === "projects"
                    ? "Projects"
                    : "Settings"}
              </h1>
            </div>
          </div>

          {view !== "settings" && (
            <label className="mode-select">
              <Sparkles size={16} />
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as ModeId)}
              >
                {MODES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
          )}
        </header>

        {view === "home" ? (
          <section className="home-layout">
            <div className="conversation-column">
              <div className="mode-summary">
                <div>
                  <strong>{selectedMode.label}</strong>
                  <span>{selectedMode.description}</span>
                </div>
                <span className="status-dot">Authenticated</span>
              </div>

              <div className="chat-stream" aria-live="polite">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={"message-row " + message.role}
                  >
                    {message.role === "assistant" && (
                      <div className="message-avatar">Z</div>
                    )}
                    <div className="message-bubble">{message.content}</div>
                  </article>
                ))}

                {isSending && (
                  <article className="message-row assistant">
                    <div className="message-avatar">Z</div>
                    <div className="message-bubble thinking">
                      Working on it
                      <span className="typing-dots">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  </article>
                )}

                {error && <div className="error-banner">{error}</div>}
              </div>

              <div className="composer-wrap">
                <div className="composer home-composer">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder="Ask OlyHub to research, plan, analyze or build..."
                    rows={1}
                  />
                  <button
                    className="send-button"
                    disabled={!prompt.trim() || isSending}
                    onClick={() => void submit()}
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="composer-caption">
                  AI can make mistakes. Use a Project for persistent files, memory and artifacts.
                </p>
              </div>
            </div>

            <aside className="context-rail">
              <section className="rail-card">
                <div className="rail-heading">
                  <Archive size={17} />
                  <strong>Artifacts</strong>
                </div>
                <div className="empty-rail">
                  Files OlyHub creates for this chat will appear here.
                </div>
              </section>

              <section className="rail-card">
                <div className="rail-heading">
                  <ShieldCheck size={17} />
                  <strong>Last run</strong>
                </div>
                {runMeta ? (
                  <dl className="run-grid">
                    <div>
                      <dt>Provider</dt>
                      <dd>{runMeta.provider}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{runMeta.model}</dd>
                    </div>
                    <div>
                      <dt>Calls</dt>
                      <dd>{runMeta.calls}</dd>
                    </div>
                    <div>
                      <dt>Route</dt>
                      <dd title={runMeta.route}>{runMeta.route || runMeta.provider}</dd>
                    </div>
                    <div>
                      <dt>Multi-provider</dt>
                      <dd>{runMeta.multiProvider ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Fallback</dt>
                      <dd>{runMeta.fallbackUsed ? "Used" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Degraded</dt>
                      <dd>{runMeta.degraded ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Tokens</dt>
                      <dd>{runMeta.totalTokens.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Ledger</dt>
                      <dd>{runMeta.usageRecorded ? "Stored" : "Not stored"}</dd>
                    </div>
                    <div>
                      <dt>Execution</dt>
                      <dd>{runMeta.executionId ? runMeta.executionId.slice(0, 8) : "Not stored"}</dd>
                    </div>
                    <div>
                      <dt>Request</dt>
                      <dd>{runMeta.requestId.slice(0, 8)}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="empty-rail">
                    Run metadata appears after a completed request.
                  </div>
                )}
              </section>
            </aside>
          </section>
        ) : view === "projects" ? (
          <section className="projects-view">
            <div className="projects-heading">
              <div>
                <span className="eyebrow">Durable workspaces</span>
                <h2>Projects</h2>
                <p>
                  Projects are stored in Supabase and isolated by user with
                  row-level security.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => {
                  setProjectError(null);
                  setProjectDialogOpen(true);
                }}
              >
                <Plus size={17} />
                New project
              </button>
            </div>

            {projectError && <div className="projects-error">{projectError}</div>}

            {projectsLoading ? (
              <div className="project-empty">
                <FolderKanban size={32} />
                <h3>Loading projects...</h3>
              </div>
            ) : projects.length === 0 ? (
              <div className="project-empty">
                <FolderKanban size={32} />
                <h3>No projects yet</h3>
                <p>Create a workspace for work that needs continuity.</p>
                <button
                  className="primary-button"
                  onClick={() => setProjectDialogOpen(true)}
                >
                  Create first project
                </button>
              </div>
            ) : (
              <div className="project-grid">
                {projects.map((project) => (
                  <article
                    className="project-card project-card-clickable"
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedProject(project)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedProject(project);
                      }
                    }}
                  >
                    <div className="project-card-top">
                      <div className="project-icon">
                        <FolderKanban size={20} />
                      </div>
                      <button
                        className="project-archive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeProject(project.id);
                        }}
                        aria-label={"Archive " + project.name}
                        title="Archive project"
                      >
                        <Archive size={15} />
                      </button>
                    </div>
                    <h3>{project.name}</h3>
                    <p>{project.goal || "No goal defined yet."}</p>
                    <span>Updated {formatUpdatedAt(project.updated_at)}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <SettingsView email={user.email || ""} />
        )}
          </>
        )}
      </main>

      {onboardingComplete === false && (
        <Onboarding
          onComplete={(destination) => {
            setOnboardingComplete(true);
            if (destination === "project") {
              setView("projects");
              setProjectDialogOpen(true);
            } else {
              setView("home");
            }
          }}
        />
      )}

      {projectDialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !projectBusy) {
              setProjectDialogOpen(false);
            }
          }}
        >
          <form className="project-dialog" onSubmit={submitProject}>
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">New workspace</span>
                <h2>Create project</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={projectBusy}
                onClick={() => setProjectDialogOpen(false)}
                aria-label="Close project dialog"
              >
                <X size={17} />
              </button>
            </div>

            <label>
              <span>Name</span>
              <input
                autoFocus
                maxLength={120}
                required
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Launch OlyHub"
              />
            </label>

            <label>
              <span>Goal</span>
              <textarea
                maxLength={5000}
                value={projectGoal}
                onChange={(event) => setProjectGoal(event.target.value)}
                placeholder="What outcome should this project produce?"
                rows={5}
              />
            </label>

            {projectError && <div className="auth-alert error">{projectError}</div>}

            <button
              className="primary-button dialog-submit"
              type="submit"
              disabled={projectBusy || !projectName.trim()}
            >
              {projectBusy ? "Creating..." : "Create project"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
