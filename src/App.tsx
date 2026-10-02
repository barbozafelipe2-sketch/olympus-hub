import {
  Archive,
  ChevronDown,
  Download,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Settings2,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArtifactPreview } from "./components/ArtifactPreview";
import { AuthScreen, BackendSetupRequired } from "./components/AuthScreen";
import { MessageSources } from "./components/MessageSources";
import { Onboarding } from "./components/Onboarding";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { SettingsView } from "./components/SettingsView";
import { useAuth } from "./hooks/useAuth";
import { sendChat } from "./lib/api";
import {
  deleteArtifact,
  downloadArtifact,
  listConversationArtifacts,
  type ArtifactRow
} from "./lib/artifacts";
import {
  createHomeConversation,
  listHomeConversations,
  loadConversationMessages,
  persistMessage,
  renameConversation,
  setConversationMode,
  touchConversation,
  type ConversationRow
} from "./lib/conversations";
import {
  createProject,
  listProjects,
  setProjectStatus,
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
type ProjectStatusFilter = "active" | "archived";

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
  const [homeConversations, setHomeConversations] = useState<ConversationRow[]>([]);
  const [hasOlderHomeConversations, setHasOlderHomeConversations] = useState(false);
  const [loadingOlderHomeConversations, setLoadingOlderHomeConversations] =
    useState(false);
  const [activeHomeConversation, setActiveHomeConversation] =
    useState<ConversationRow | null>(null);
  const [homeArtifacts, setHomeArtifacts] = useState<ArtifactRow[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeChatBusy, setHomeChatBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectStatusFilter, setProjectStatusFilter] =
    useState<ProjectStatusFilter>("active");
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
      setHomeConversations([]);
      setHasOlderHomeConversations(false);
      setActiveHomeConversation(null);
      setHomeArtifacts([]);
      setMessages(initialMessages);
      setOnboardingComplete(null);
      return;
    }

    let active = true;
    setProjectsLoading(true);
    setProjectError(null);

    setProjects([]);
    void listProjects(projectStatusFilter)
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
  }, [user?.id, projectStatusFilter]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    setHomeLoading(true);

    void listHomeConversations()
      .then(async (rows) => {
        if (!active) return;

        setHomeConversations(rows);
        setHasOlderHomeConversations(rows.length === 50);
        const latest = rows[0] ?? null;

        if (!latest) {
          setActiveHomeConversation(null);
          setMessages(initialMessages);
          setHomeArtifacts([]);
          setMode("zeus");
          return;
        }

        const [savedMessages, savedArtifacts] = await Promise.all([
          loadConversationMessages(latest.id),
          listConversationArtifacts(latest.id)
        ]);

        if (!active) return;

        setActiveHomeConversation(latest);
        setMessages(savedMessages.length > 0 ? savedMessages : initialMessages);
        setHomeArtifacts(savedArtifacts);
        setMode(
          MODES.some((item) => item.id === latest.mode)
            ? (latest.mode as ModeId)
            : "zeus"
        );
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to restore Home conversations."
        );
      })
      .finally(() => {
        if (active) setHomeLoading(false);
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

  async function ensureHomeConversation(): Promise<ConversationRow> {
    if (activeHomeConversation) return activeHomeConversation;

    const conversation = await createHomeConversation({
      ownerId: userId,
      mode
    });

    setActiveHomeConversation(conversation);
    setHomeConversations((current) => [conversation, ...current]);
    return conversation;
  }

  async function openHomeConversation(conversation: ConversationRow) {
    if (homeLoading || isSending) return;

    setHomeLoading(true);
    setError(null);
    setRunMeta(null);
    setSelectedProject(null);
    setView("home");
    setMobileNavOpen(false);

    try {
      const [savedMessages, savedArtifacts] = await Promise.all([
        loadConversationMessages(conversation.id),
        listConversationArtifacts(conversation.id)
      ]);

      setActiveHomeConversation(conversation);
      setMessages(savedMessages.length > 0 ? savedMessages : initialMessages);
      setHomeArtifacts(savedArtifacts);
      setMode(
        MODES.some((item) => item.id === conversation.mode)
          ? (conversation.mode as ModeId)
          : "zeus"
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to open this Home conversation."
      );
    } finally {
      setHomeLoading(false);
    }
  }

  async function loadOlderHomeConversations() {
    if (loadingOlderHomeConversations || !hasOlderHomeConversations) return;

    setLoadingOlderHomeConversations(true);
    try {
      const rows = await listHomeConversations(50, homeConversations.length);
      setHomeConversations((current) => {
        const known = new Set(current.map((conversation) => conversation.id));
        return [...current, ...rows.filter((conversation) => !known.has(conversation.id))];
      });
      setHasOlderHomeConversations(rows.length === 50);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load older Home conversations."
      );
    } finally {
      setLoadingOlderHomeConversations(false);
    }
  }

  async function newHomeChat() {
    if (homeChatBusy || isSending) return;

    setHomeChatBusy(true);
    setError(null);
    setRunMeta(null);

    try {
      const conversation = await createHomeConversation({
        ownerId: userId,
        mode: "zeus"
      });

      setHomeConversations((current) => [conversation, ...current]);
      setActiveHomeConversation(conversation);
      setMessages(initialMessages);
      setHomeArtifacts([]);
      setPrompt("");
      setMode("zeus");
      setSelectedProject(null);
      setView("home");
      setMobileNavOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create a new chat."
      );
    } finally {
      setHomeChatBusy(false);
    }
  }

  async function changeHomeMode(nextMode: ModeId) {
    const previous = mode;
    setMode(nextMode);

    if (!activeHomeConversation) return;

    try {
      await setConversationMode(activeHomeConversation.id, nextMode);
      setActiveHomeConversation((current) =>
        current ? { ...current, mode: nextMode } : current
      );
      setHomeConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeHomeConversation.id
            ? { ...conversation, mode: nextMode }
            : conversation
        )
      );
    } catch (caught) {
      setMode(previous);
      setError(
        caught instanceof Error ? caught.message : "Unable to save chat mode."
      );
    }
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || isSending || homeLoading) return;

    setPrompt("");
    setError(null);
    setRunMeta(null);
    setIsSending(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    let userSaved = false;

    try {
      const conversation = await ensureHomeConversation();
      const persistedUser = await persistMessage({
        conversationId: conversation.id,
        ownerId: userId,
        role: "user",
        content: text
      });
      userSaved = true;

      const nextMessages = [...messages, persistedUser];
      setMessages(nextMessages);

      let localConversation = conversation;
      if (conversation.title === "New chat") {
        const title =
          text.replace(/\s+/g, " ").trim().slice(0, 72) || "New chat";
        await renameConversation(conversation.id, title);
        localConversation = {
          ...conversation,
          title,
          updated_at: new Date().toISOString()
        };
        setActiveHomeConversation(localConversation);
        setHomeConversations((current) => [
          localConversation,
          ...current.filter((item) => item.id !== conversation.id)
        ]);
      }

      const result = await sendChat(
        {
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .slice(-40),
          mode,
          conversationId: conversation.id
        },
        controller.signal
      );

      const assistant = await persistMessage({
        conversationId: conversation.id,
        ownerId: userId,
        role: "assistant",
        content: result.reply,
        metadata: {
          request_id: result.requestId,
          execution_id: result.executionId,
          provider: result.provider,
          model: result.model,
          fallback_used: result.fallbackUsed,
          orchestration: result.orchestration,
          trace: result.trace,
          sources: result.sources
        }
      });

      setMessages((current) => [...current, assistant]);

      if (result.artifact) {
        const refreshed = await listConversationArtifacts(conversation.id).catch(
          () => null
        );
        if (refreshed) setHomeArtifacts(refreshed);
      }

      const updatedAt = new Date().toISOString();
      await touchConversation(conversation.id).catch(() => undefined);
      const updatedConversation = {
        ...localConversation,
        mode,
        updated_at: updatedAt
      };
      setActiveHomeConversation(updatedConversation);
      setHomeConversations((current) => [
        updatedConversation,
        ...current.filter((item) => item.id !== conversation.id)
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
      const base =
        err instanceof DOMException && err.name === "AbortError"
          ? "The request timed out before the server completed it."
          : err instanceof Error
            ? err.message
            : "Unexpected request failure.";
      setError(userSaved ? "Your message is saved. " + base : base);
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  async function downloadHomeArtifact(artifact: ArtifactRow) {
    setError(null);
    try {
      await downloadArtifact(artifact);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to download artifact."
      );
    }
  }

  async function removeHomeArtifact(artifactId: string) {
    setError(null);
    try {
      await deleteArtifact(artifactId);
      setHomeArtifacts((current) =>
        current.filter((artifact) => artifact.id !== artifactId)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to delete artifact."
      );
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

      setProjectStatusFilter("active");
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

  async function changeProjectStatus(
    projectId: string,
    nextStatus: ProjectStatusFilter
  ) {
    setProjectError(null);

    try {
      await setProjectStatus(projectId, nextStatus);
      setProjects((current) =>
        current.filter((project) => project.id !== projectId)
      );
    } catch (caught) {
      setProjectError(
        caught instanceof Error
          ? caught.message
          : "Unable to update project status."
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
          disabled={homeChatBusy || isSending}
          onClick={() => void newHomeChat()}
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

        {homeConversations.length > 0 && (
          <section className="recent-chats">
            <span className="recent-chats-label">Recent</span>
            <div className="recent-chats-list">
              {homeConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={
                    view === "home" &&
                    activeHomeConversation?.id === conversation.id
                      ? "recent-chat active"
                      : "recent-chat"
                  }
                  onClick={() => void openHomeConversation(conversation)}
                  title={conversation.title}
                >
                  <span>{conversation.title}</span>
                </button>
              ))}
              {hasOlderHomeConversations && (
                <button
                  className="recent-chat-load-more"
                  disabled={loadingOlderHomeConversations}
                  onClick={() => void loadOlderHomeConversations()}
                >
                  {loadingOlderHomeConversations ? "Loading..." : "Load older"}
                </button>
              )}
            </div>
          </section>
        )}

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

          {view === "home" && (
            <label className="mode-select">
              <Sparkles size={16} />
              <select
                value={mode}
                onChange={(event) =>
                  void changeHomeMode(event.target.value as ModeId)
                }
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
                <span className="status-dot">
                  {homeLoading ? "Restoring" : "Persistent"}
                </span>
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
                    <div className="message-bubble">
                      <div>{message.content}</div>
                      <MessageSources sources={message.sources} />
                    </div>
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
                    disabled={homeLoading}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder="Ask OlyHub to research, plan, analyze or build..."
                    rows={1}
                  />
                  <button
                    className="send-button"
                    disabled={homeLoading || !prompt.trim() || isSending}
                    onClick={() => void submit()}
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="composer-caption">
                  Home chats and artifacts persist. Use a Project when work also needs files, memory and a durable goal.
                </p>
              </div>
            </div>

            <aside className="context-rail">
              <section className="rail-card">
                <div className="rail-heading rail-heading-split">
                  <span>
                    <Archive size={17} />
                    <strong>Artifacts</strong>
                  </span>
                  <small>{homeArtifacts.length}</small>
                </div>
                <div className="rail-list">
                  {homeArtifacts.length === 0 ? (
                    <div className="empty-rail">
                      Ask OlyHub to create a document, report, plan, code file or other explicit deliverable.
                    </div>
                  ) : (
                    homeArtifacts.map((artifact) => (
                      <div className="rail-list-item file-row" key={artifact.id}>
                        <div className="artifact-copy">
                          <ArtifactPreview artifact={artifact} />
                          <div>
                            <p>{artifact.title}</p>
                            <small>
                              {artifact.kind} · v{artifact.current_version}
                            </small>
                          </div>
                        </div>
                        <span className="row-actions">
                          <button
                            aria-label={"Download " + artifact.title}
                            onClick={() => void downloadHomeArtifact(artifact)}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            aria-label={"Delete " + artifact.title}
                            onClick={() => void removeHomeArtifact(artifact.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    ))
                  )}
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
                <h2>{projectStatusFilter === "active" ? "Projects" : "Archived projects"}</h2>
                <p>
                  {projectStatusFilter === "active"
                    ? "Projects are stored in Supabase and isolated by user with row-level security."
                    : "Archived Projects stay saved and can be restored at any time."}
                </p>
              </div>
              <div className="projects-heading-actions">
                <button
                  className="secondary-button"
                  onClick={() => setProjectStatusFilter((current) =>
                    current === "active" ? "archived" : "active"
                  )}
                >
                  {projectStatusFilter === "active" ? "View archived" : "Active projects"}
                </button>
                {projectStatusFilter === "active" && (
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
                )}
              </div>
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
                <h3>{projectStatusFilter === "active" ? "No projects yet" : "No archived projects"}</h3>
                {projectStatusFilter === "active" ? (
                  <>
                    <p>Create a workspace for work that needs continuity.</p>
                    <button
                      className="primary-button"
                      onClick={() => setProjectDialogOpen(true)}
                    >
                      Create first project
                    </button>
                  </>
                ) : (
                  <p>Projects you archive will remain available here.</p>
                )}
              </div>
            ) : (
              <div className="project-grid">
                {projects.map((project) => (
                  <article
                    className="project-card project-card-hover"
                    key={project.id}
                  >
                    <div className="project-card-top">
                      <div className="project-icon">
                        <FolderKanban size={20} />
                      </div>
                      <button
                        className="project-archive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void changeProjectStatus(
                            project.id,
                            projectStatusFilter === "active" ? "archived" : "active"
                          );
                        }}
                        aria-label={(projectStatusFilter === "active" ? "Archive " : "Restore ") + project.name}
                        title={projectStatusFilter === "active" ? "Archive project" : "Restore project"}
                      >
                        {projectStatusFilter === "active" ? <Archive size={15} /> : <RotateCcw size={15} />}
                      </button>
                    </div>
                    <h3>
                      <button
                        className="project-open"
                        onClick={() => setSelectedProject(project)}
                      >
                        {project.name}
                      </button>
                    </h3>
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
