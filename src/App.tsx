import {
  Archive,
  ChevronDown,
  FileText,
  FolderKanban,
  Home,
  Menu,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { sendChat } from "./lib/api";
import {
  MODES,
  type AttachmentDraft,
  type ChatMessage,
  type ModeId
} from "./types";

type View = "home" | "projects";

type Project = {
  id: string;
  name: string;
  goal: string;
};

type RunMeta = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
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

export default function App() {
  const [view, setView] = useState<View>("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mode, setMode] = useState<ModeId>("zeus");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedMode = useMemo(
    () => MODES.find((item) => item.id === mode) ?? MODES[0],
    [mode]
  );

  function chooseView(next: View) {
    setView(next);
    setMobileNavOpen(false);
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;

    const next = Array.from(files)
      .slice(0, 8)
      .map((file) => ({
        id: makeId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size
      }));

    setAttachments((current) => [...current, ...next].slice(0, 8));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || isSending) return;

    const attachmentNote =
      attachments.length > 0
        ? "\n\nAttached locally: " +
          attachments.map((file) => file.name).join(", ") +
          ". File transport is not enabled in this foundation yet."
        : "";

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text + attachmentNote,
      createdAt: new Date().toISOString()
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setPrompt("");
    setAttachments([]);
    setError(null);
    setRunMeta(null);
    setIsSending(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const result = await sendChat(
        {
          messages: nextMessages,
          mode
        },
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
        requestId: result.requestId
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

  function addProject() {
    setProjects((current) => [
      ...current,
      {
        id: makeId(),
        name: "Untitled project",
        goal: "Define the outcome for this workspace."
      }
    ]);
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

        <button className="new-chat" onClick={() => setMessages(initialMessages)}>
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
        </nav>

        <div className="sidebar-spacer" />

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
                {view === "home" ? "Home" : "Project workspace"}
              </span>
              <h1>{view === "home" ? "Talk to OlyHub" : "Projects"}</h1>
            </div>
          </div>

          <label className="mode-select">
            <Sparkles size={16} />
            <select value={mode} onChange={(event) => setMode(event.target.value as ModeId)}>
              {MODES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
        </header>

        {view === "home" ? (
          <section className="home-layout">
            <div className="conversation-column">
              <div className="mode-summary">
                <div>
                  <strong>{selectedMode.label}</strong>
                  <span>{selectedMode.description}</span>
                </div>
                <span className="status-dot">Ready</span>
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
                {attachments.length > 0 && (
                  <div className="attachment-strip">
                    {attachments.map((file) => (
                      <div className="attachment-chip" key={file.id}>
                        <FileText size={15} />
                        <span>
                          {file.name}
                          <small>{formatBytes(file.size)}</small>
                        </span>
                        <button
                          aria-label={"Remove " + file.name}
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter((item) => item.id !== file.id)
                            )
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="composer">
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    multiple
                    onChange={(event) => onFilesPicked(event.target.files)}
                  />
                  <button
                    className="icon-button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach files"
                  >
                    <Paperclip size={19} />
                  </button>
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
                  AI can make mistakes. Verify important outputs before acting.
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
                      <dt>Fallback</dt>
                      <dd>{runMeta.fallbackUsed ? "Used" : "No"}</dd>
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
        ) : (
          <section className="projects-view">
            <div className="projects-heading">
              <div>
                <span className="eyebrow">Durable workspaces</span>
                <h2>Projects</h2>
                <p>
                  Each commercial project will own its goal, conversations, files,
                  approved memory and generated artifacts.
                </p>
              </div>
              <button className="primary-button" onClick={addProject}>
                <Plus size={17} />
                New project
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="project-empty">
                <FolderKanban size={32} />
                <h3>No projects yet</h3>
                <p>Create a workspace for work that needs continuity.</p>
                <button className="primary-button" onClick={addProject}>
                  Create first project
                </button>
              </div>
            ) : (
              <div className="project-grid">
                {projects.map((project) => (
                  <article className="project-card" key={project.id}>
                    <div className="project-icon">
                      <FolderKanban size={20} />
                    </div>
                    <h3>{project.name}</h3>
                    <p>{project.goal}</p>
                    <span>Local shell only — persistence comes with the backend layer.</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
