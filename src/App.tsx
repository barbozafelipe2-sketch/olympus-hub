import {
  Archive,
  ArchiveRestore,
  Check,
  Circle,
  ChevronDown,
  Download,
  FileText,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen, BackendSetupRequired } from "./components/AuthScreen";
import { useAuth } from "./hooks/useAuth";
import { sendChat } from "./lib/api";
import {
  archiveProject,
  createProject,
  listProjects,
  restoreProject,
  type ProjectRow
} from "./lib/projects";
import {
  addMessage,
  createProjectTask,
  deleteArtifact,
  ensureConversation,
  listArtifacts,
  listConversations,
  listProjectTasks,
  loadMessages,
  saveArtifact,
  signedArtifactUrl,
  updateProjectTask,
  uploadSource,
  type ArtifactRow,
  type TaskRow
} from "./lib/workspace";
import { requireSupabase } from "./lib/supabase";
import {
  MODES,
  type AttachmentDraft,
  type ChatMessage,
  type ModeId
} from "./types";

type View = "home" | "projects";
type ConversationRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  mode: string;
  created_at: string;
  updated_at: string;
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
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectFilter, setProjectFilter] = useState<"active" | "archived">("active");
  const [currentProject, setCurrentProject] = useState<ProjectRow | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [artifactBusyId, setArtifactBusyId] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = auth.user;

  const selectedMode = useMemo(
    () => MODES.find((item) => item.id === mode) ?? MODES[0],
    [mode]
  );

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    let active = true;
    setProjectsLoading(true);
    setProjectError(null);

    void Promise.all([listProjects(), listConversations(null)])
      .then(async ([rows, homeConversations]) => {
        if (!active) return;
        setProjects(rows);
        setConversations(homeConversations);
        const first = homeConversations[0];
        if (first) {
          setActiveConversationId(first.id);
          setWorkspaceLoading(true);
          const [storedMessages, storedArtifacts] = await Promise.all([
            loadMessages(first.id),
            listArtifacts(first.id, null)
          ]);
          if (!active) return;
          setMessages(storedMessages.length ? storedMessages.map((item) => ({
            id: item.id,
            role: item.role as ChatMessage["role"],
            content: item.content,
            createdAt: item.created_at
          })) : initialMessages);
          setArtifacts(storedArtifacts);
        } else {
          setMessages(initialMessages);
          setArtifacts([]);
        }
      })
      .catch((caught) => {
        if (!active) return;
        setProjectError(
          caught instanceof Error ? caught.message : "Unable to load projects."
        );
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
        if (active) setWorkspaceLoading(false);
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
    if (next === "home" && currentProject) {
      setCurrentProject(null);
      setActiveConversationId(null);
      setMessages(initialMessages);
      setArtifacts([]);
      setRunMeta(null);
    }
    setView(next);
    setMobileNavOpen(false);
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;

    const accepted: AttachmentDraft[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["txt", "md", "csv", "json", "xml", "html"].includes(extension)) {
        rejected.push(file.name);
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        rejected.push(`${file.name} (over 2 MB)`);
        continue;
      }
      accepted.push({
        id: makeId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        file
      });
    }

    const remainingSlots = Math.max(0, 5 - attachments.length);
    if (accepted.length > remainingSlots) rejected.push("maximum of five source files per message");
    setAttachments((current) => [...current, ...accepted.slice(0, remainingSlots)]);
    if (rejected.length) setError(`Supported source files are TXT, MD, CSV, JSON, XML, and HTML, up to 2 MB each. Not added: ${rejected.join(", ")}`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || isSending) return;

    const attachmentNote = attachments.length > 0
      ? "\n\nAttached sources: " + attachments.map((file) => file.name).join(", ")
      : "";

    if (attachments.length && attachments.reduce((sum, file) => sum + file.size, 0) > 5 * 1024 * 1024) {
      setError("The combined source size must be 5 MB or less.");
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text + attachmentNote,
      createdAt: new Date().toISOString()
    };

    const contextMessages = messages.filter((message) => message.id !== "welcome");
    const nextMessages = [...contextMessages, userMessage];
    setMessages((current) => [...current.filter((message) => message.id !== "welcome"), userMessage]);
    setPrompt("");
    setAttachments([]);
    setError(null);
    setRunMeta(null);
    setIsSending(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    let conversationIdForRecovery = activeConversationId;

    try {
      const conversation = await ensureConversation({
        ownerId: userId,
        projectId: currentProject?.id ?? null,
        mode,
        firstMessage: text
      });
      setActiveConversationId(conversation.id);
      conversationIdForRecovery = conversation.id;
      const attachedTextParts: string[] = [];
      for (const attachment of attachments) {
        const raw = await attachment.file.text();
        if (raw.includes("\0")) throw new Error(`${attachment.name} does not look like a text file.`);
        const excerpt = raw.slice(0, 10000);
        attachedTextParts.push(`SOURCE FILE: ${attachment.name}\n${excerpt}${raw.length > excerpt.length ? "\n[Source excerpt truncated at 10,000 characters.]" : ""}`);
        await uploadSource({
          ownerId: userId,
          conversationId: conversation.id,
          projectId: currentProject?.id ?? null,
          file: attachment.file
        });
      }
      const userContent = [userMessage.content, ...attachedTextParts].join("\n\n").slice(0, 30000);
      setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, content: userContent } : message));
      if (attachments.length) {
        setArtifacts(await listArtifacts(conversation.id, currentProject?.id ?? null));
      }
      await addMessage({ ownerId: userId, conversationId: conversation.id, role: "user", content: userContent, mode });
      const candidateMessages = [...nextMessages.slice(0, -1), { ...userMessage, content: userContent }].slice(-80);
      const requestMessages: ChatMessage[] = [];
      let contextSize = 0;
      for (const message of [...candidateMessages].reverse()) {
        if (contextSize + message.content.length > 80000) continue;
        requestMessages.unshift(message);
        contextSize += message.content.length;
      }
      const result = await sendChat(
        { messages: requestMessages, mode },
        controller.signal
      );

      const assistantRow = await addMessage({
        ownerId: userId,
        conversationId: conversation.id,
        role: "assistant",
        content: result.reply,
        mode
      });

      setMessages((current) => [
        ...current,
        {
          id: assistantRow.id,
          role: "assistant",
          content: result.reply,
          createdAt: assistantRow.created_at
        }
      ]);
      const [nextConversations, nextArtifacts] = await Promise.all([
        listConversations(currentProject?.id ?? null),
        listArtifacts(conversation.id, currentProject?.id ?? null)
      ]);
      setConversations((current) => currentProject
        ? [...current.filter((item) => item.project_id !== currentProject.id), ...nextConversations]
        : nextConversations);
      setArtifacts(nextArtifacts);

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
      setPrompt(text);
      if (conversationIdForRecovery) {
        void listArtifacts(conversationIdForRecovery, currentProject?.id ?? null)
          .then(setArtifacts)
          .catch(() => undefined);
      }
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  async function openConversation(conversation: ConversationRow) {
    setWorkspaceLoading(true);
    setError(null);
    setRunMeta(null);
    setMessages([]);
    setArtifacts([]);
    if (MODES.some((item) => item.id === conversation.mode)) setMode(conversation.mode as ModeId);
    setCurrentProject(projects.find((item) => item.id === conversation.project_id) ?? null);
    setActiveConversationId(conversation.id);
    setView("home");
    try {
      const [storedMessages, storedArtifacts] = await Promise.all([
        loadMessages(conversation.id), listArtifacts(conversation.id, conversation.project_id)
      ]);
      setMessages(storedMessages.length ? storedMessages.map((item) => ({
        id: item.id,
        role: item.role as ChatMessage["role"],
        content: item.content,
        createdAt: item.created_at
      })) : initialMessages);
      setArtifacts(storedArtifacts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load this conversation.");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function openProject(project: ProjectRow) {
    setCurrentProject(project);
    setView("projects");
    setMobileNavOpen(false);
    setError(null);
    setProjectError(null);
    setRunMeta(null);
    setActiveConversationId(null);
    setMessages(initialMessages);
    setArtifacts([]);
    setTasks([]);
    setTaskTitle("");
    setWorkspaceLoading(true);
    try {
      const [projectConversations, projectTasks] = await Promise.all([
        listConversations(project.id), listProjectTasks(project.id)
      ]);
      setTasks(projectTasks);
      setConversations((current) => [
        ...current.filter((row) => row.project_id !== project.id),
        ...projectConversations
      ]);
      const conversation = projectConversations[0];
      if (conversation) {
        setActiveConversationId(conversation.id);
        const [storedMessages, storedArtifacts] = await Promise.all([
          loadMessages(conversation.id), listArtifacts(conversation.id, project.id)
        ]);
        setMessages(storedMessages.length ? storedMessages.map((item) => ({
          id: item.id,
          role: item.role as ChatMessage["role"],
          content: item.content,
          createdAt: item.created_at
        })) : initialMessages);
        setArtifacts(storedArtifacts);
      } else {
        setActiveConversationId(null);
        setMessages(initialMessages);
        setArtifacts([]);
      }
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : "Unable to load this project.");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function leaveProject() {
    setCurrentProject(null);
    setView("projects");
    setActiveConversationId(null);
    setMessages(initialMessages);
    setArtifacts([]);
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!currentProject || !taskTitle.trim() || taskBusy) return;
    setTaskBusy(true);
    try {
      const task = await createProjectTask({ ownerId: userId, projectId: currentProject.id, title: taskTitle });
      setTasks((current) => [task, ...current]);
      setTaskTitle("");
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : "Could not add the task.");
    } finally {
      setTaskBusy(false);
    }
  }

  async function toggleTask(task: TaskRow) {
    const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    try {
      const updated = await updateProjectTask(task.id, next);
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : "Could not update the task.");
    }
  }

  async function saveAnswer(message: ChatMessage) {
    if (!activeConversationId || artifactBusyId) return;
    setArtifactBusyId(message.id);
    setArtifactError(null);
    try {
      const artifact = await saveArtifact({
        ownerId: userId,
        conversationId: activeConversationId,
        projectId: currentProject?.id ?? null,
        name: message.content.split("\n").find(Boolean)?.replace(/^#+\s*/, "").slice(0, 100) || "OlyHub answer",
        content: message.content
      });
      setArtifacts((current) => [artifact, ...current]);
    } catch (caught) {
      setArtifactError(caught instanceof Error ? caught.message : "Could not save this answer.");
    } finally {
      setArtifactBusyId(null);
    }
  }

  async function openArtifact(artifact: ArtifactRow) {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await signedArtifactUrl(artifact.storage_path);
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch (caught) {
      popup?.close();
      setArtifactError(caught instanceof Error ? caught.message : "Could not open this file.");
    }
  }

  async function removeArtifact(artifact: ArtifactRow) {
    try {
      await deleteArtifact(artifact);
      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
    } catch (caught) {
      setArtifactError(caught instanceof Error ? caught.message : "Could not delete this file.");
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
      setProjects((current) => current.map((project) => project.id === projectId ? { ...project, status: "archived" } : project));
    } catch (caught) {
      setProjectError(
        caught instanceof Error ? caught.message : "Unable to archive project."
      );
    }
  }

  async function unarchiveProject(projectId: string) {
    setProjectError(null);
    try {
      await restoreProject(projectId);
      setProjects((current) => current.map((project) => project.id === projectId ? { ...project, status: "active" } : project));
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : "Unable to restore project.");
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
            setCurrentProject(null);
            setActiveConversationId(null);
            setArtifacts([]);
            setAttachments([]);
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
        </nav>

        <div className="recent-section">
          <div className="recent-heading">Recent chats</div>
          {conversations.filter((item) => !item.project_id).slice(0, 8).map((item) => (
            <button
              className={activeConversationId === item.id && view === "home" ? "recent-chat active" : "recent-chat"}
              key={item.id}
              onClick={() => void openConversation(item)}
              title={item.title}
            >
              <MessageSquare size={14} />
              <span>{item.title}</span>
            </button>
          ))}
          {conversations.filter((item) => !item.project_id).length === 0 && (
            <p className="recent-empty">Your saved chats will appear here.</p>
          )}
        </div>

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
                {currentProject ? "Project chat" : view === "home" ? "Home" : "Project workspace"}
              </span>
              <h1>{currentProject ? currentProject.name : view === "home" ? "Talk to OlyHub" : "Projects"}</h1>
            </div>
          </div>

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
        </header>

        {view === "home" ? (
          <section className="home-layout">
            <div className={currentProject ? "conversation-column project-conversation-column" : "conversation-column"}>
              {currentProject && (
                <div className="project-chat-head">
                  <button className="text-button" onClick={leaveProject}>← All projects</button>
                  <div><span className="eyebrow">PROJECT WORKSPACE</span><p>{currentProject.goal || "Persistent project conversation, tasks, files, and deliverables."}</p></div>
                </div>
              )}
              <div className="mode-summary">
                <div>
                  <strong>{selectedMode.label}</strong>
                  <span>{selectedMode.description}</span>
                </div>
                <span className="status-dot">{workspaceLoading ? "Loading saved work" : currentProject ? "Project saved" : "Workspace saved"}</span>
              </div>

              <div className="chat-stream" aria-live="polite">
                {workspaceLoading && <div className="loading-line">Loading your saved conversation…</div>}
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
                      {message.role === "assistant" && message.id !== "welcome" && (
                        <button className="save-answer" onClick={() => void saveAnswer(message)} disabled={!activeConversationId || artifactBusyId === message.id}>
                          <Download size={14} /> {artifactBusyId === message.id ? "Saving…" : "Save as file"}
                        </button>
                      )}
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
                    accept=".txt,.md,.csv,.json,.xml,.html,text/plain,text/markdown,text/csv,application/json,application/xml,text/html"
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
                <div className="composer-help">Attach TXT, MD, CSV, JSON, XML, or HTML files (2 MB each, 5 MB per message). Files are stored privately and their text is sent with this request.</div>
                {mode === "olympus" && <div className="mode-notice">Olympus council adapters are not enabled in this commercial stage; this request uses the configured OpenAI route without claiming multi-model review.</div>}
                {(mode === "claude" || mode === "google") && <div className="mode-notice">No {mode === "claude" ? "Claude" : "Google AI"} server adapter is configured in this stage. This request uses the OpenAI fallback.</div>}
                <p className="composer-caption">
                  AI can make mistakes. Verify important outputs before acting.
                </p>
              </div>
            </div>

            <aside className="context-rail">
              <section className="rail-card">
                <div className="rail-heading">
                  <Archive size={17} />
                  <strong>Files & artifacts</strong>
                </div>
                {artifactError && <div className="projects-error">{artifactError}</div>}
                {artifacts.length ? <div className="artifact-list">{artifacts.map((artifact) => (
                  <div className="artifact-item" key={artifact.id}>
                    <button className="artifact-open" onClick={() => void openArtifact(artifact)}><FileText size={15} /><span>{artifact.name}<small>{artifact.kind === "source" ? "Source file" : "Saved answer"} · {formatBytes(artifact.size_bytes)}</small></span></button>
                    <button className="artifact-delete" aria-label={`Delete ${artifact.name}`} onClick={() => void removeArtifact(artifact)}><Trash2 size={14} /></button>
                  </div>
                ))}</div> : <div className="empty-rail">Attach a supported source file or save any answer to keep it here.</div>}
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
            {currentProject ? (
              <div className="project-detail">
                <div className="project-detail-heading">
                  <button className="text-button" onClick={leaveProject}>← All projects</button>
                  <span className="eyebrow">{currentProject.goal || "Persistent project workspace"}</span>
                </div>
                <form className="task-create" onSubmit={(event) => void addTask(event)}>
                  <input value={taskTitle} maxLength={240} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a task for this project…" />
                  <button className="primary-button" type="submit" disabled={taskBusy || !taskTitle.trim()}><Plus size={15} /> Add task</button>
                </form>
                {projectError && <div className="projects-error">{projectError}</div>}
                <div className="task-list">
                  {tasks.length ? tasks.map((task) => <div className="task-row" key={task.id}>
                    <button className="task-toggle" onClick={() => void toggleTask(task)} aria-label={`Change task status: ${task.title}`}>
                      {task.status === "done" ? <Check size={17} /> : <Circle size={17} />}
                    </button>
                    <span className={task.status === "done" ? "task-title done" : "task-title"}>{task.title}</span>
                    <span className={`task-status ${task.status}`}>{task.status.replace("_", " ")}</span>
                  </div>) : <div className="empty-rail">Add the first task to turn this project into a trackable plan.</div>}
                </div>
                <div className="project-chat-link">
                  <div><strong>Project conversation</strong><span>Persistent chat, sources, and saved answers live in this workspace.</span></div>
                  <button className="primary-button" onClick={() => {
                    setView("home");
                    setCurrentProject(currentProject);
                    const projectConversation = conversations.find((item) => item.project_id === currentProject.id);
                    if (projectConversation) void openConversation(projectConversation);
                    else { setActiveConversationId(null); setMessages(initialMessages); setArtifacts([]); }
                  }}><MessageSquare size={16} /> Open project chat</button>
                </div>
              </div>
            ) : <>
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

            {!currentProject && <div className="project-filter" role="tablist" aria-label="Project status">
              <button className={projectFilter === "active" ? "active" : ""} onClick={() => setProjectFilter("active")}>Active</button>
              <button className={projectFilter === "archived" ? "active" : ""} onClick={() => setProjectFilter("archived")}>Archived</button>
            </div>}

            {projectError && <div className="projects-error">{projectError}</div>}

            {projectsLoading ? (
              <div className="project-empty">
                <FolderKanban size={32} />
                <h3>Loading projects...</h3>
              </div>
            ) : projects.filter((project) => project.status === projectFilter).length === 0 ? (
              <div className="project-empty">
                <FolderKanban size={32} />
                <h3>{projectFilter === "active" ? "No active projects" : "No archived projects"}</h3>
                <p>{projectFilter === "active" ? "Create a workspace for work that needs continuity." : "Archived projects stay here and can be restored at any time."}</p>
                {projectFilter === "active" && <button className="primary-button" onClick={() => setProjectDialogOpen(true)}>Create first project</button>}
              </div>
            ) : (
              <div className="project-grid">
                {projects.filter((project) => project.status === projectFilter).map((project) => (
                  <article className="project-card" key={project.id}>
                    <div className="project-card-top">
                      <div className="project-icon">
                        <FolderKanban size={20} />
                      </div>
                      <button
                        className="project-archive"
                        onClick={() => void (project.status === "archived" ? unarchiveProject(project.id) : removeProject(project.id))}
                        aria-label={`${project.status === "archived" ? "Restore" : "Archive"} ${project.name}`}
                        title={project.status === "archived" ? "Restore project" : "Archive project"}
                      >
                        {project.status === "archived" ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      </button>
                    </div>
                    <h3 className="project-name"><button className="project-open" onClick={() => void openProject(project)}>{project.name}</button></h3>
                    <p>{project.goal || "No goal defined yet."}</p>
                    <span>Updated {formatUpdatedAt(project.updated_at)}</span>
                    <button className="project-open-cta" onClick={() => project.status === "archived" ? void unarchiveProject(project.id) : void openProject(project)}>{project.status === "archived" ? "Restore project" : "Open workspace"} <span>→</span></button>
                  </article>
                ))}
              </div>
            )}
            </>}
          </section>
        )}
      </main>

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
