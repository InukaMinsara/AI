import { useEffect, useMemo, useState } from "react";
import Chat from "./components/Chat.jsx";

const STORAGE_KEY = "im-ai-chats-v5";
const LEGACY_KEYS = ["im-ai-chats-v4", "im-ai-chat-history-v3"];
const MEMORY_KEY = "im-ai-memory-v2";

function uid() {
  return crypto.randomUUID();
}

function welcome() {
  return {
    id: uid(),
    role: "assistant",
    content: "Hello! 👋 I’m IM AI. How can I help you today?"
  };
}

function snapshot(messages, label = "Snapshot") {
  return {
    id: uid(),
    label,
    createdAt: Date.now(),
    messages: structuredClone(messages)
  };
}

function makeChat(messages = [welcome()]) {
  const now = Date.now();
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages,
    versions: [snapshot(messages, "Original")]
  };
}

function autoTitle(messages) {
  const first = messages.find(
    (message) => message.role === "user" && message.content?.trim()
  );
  if (!first) return "New chat";

  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== "object") return null;

  const messages = Array.isArray(chat.messages) && chat.messages.length
    ? chat.messages
    : [welcome()];

  return {
    id: chat.id || uid(),
    title: chat.title || autoTitle(messages),
    createdAt: Number(chat.createdAt) || Date.now(),
    updatedAt: Number(chat.updatedAt) || Date.now(),
    messages,
    versions:
      Array.isArray(chat.versions) && chat.versions.length
        ? chat.versions
        : [snapshot(messages, "Original")]
  };
}

function readStoredChats() {
  const sources = [STORAGE_KEY, ...LEGACY_KEYS];

  for (const key of sources) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(saved) && saved.length) {
        if (key === "im-ai-chat-history-v3") return [makeChat(saved)];
        const normalized = saved.map(normalizeChat).filter(Boolean);
        if (normalized.length) return normalized;
      }
    } catch (error) {
      console.warn(`Could not load ${key}`, error);
    }
  }

  return [makeChat()];
}

function readMemory() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    return {
      name: typeof saved?.name === "string" ? saved.name : "",
      facts: Array.isArray(saved?.facts)
        ? saved.facts.filter((fact) => typeof fact === "string" && fact.trim()).slice(0, 30)
        : []
    };
  } catch {
    return { name: "", facts: [] };
  }
}

function detectMemory(text) {
  if (!text?.trim()) return {};

  const result = {};
  const nameMatch = text.match(
    /(?:\bmy name is\b|\bI'm\b|\bI am\b|\bmage nama\b)\s+([A-Za-z][A-Za-z '\u2019.-]{0,38})/i
  );
  if (nameMatch?.[1]) result.name = nameMatch[1].trim().replace(/[.,!?]+$/, "");

  const rememberMatch = text.match(/\bremember (?:that )?(.+)/i);
  if (rememberMatch?.[1]) {
    result.fact = rememberMatch[1].trim().replace(/[.!?]+$/, ".");
  }

  return result;
}

export default function App() {
  const [chats, setChats] = useState(readStoredChats);
  const [memory, setMemory] = useState(readMemory);
  const [activeId, setActiveId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeId) || chats[0],
    [chats, activeId]
  );

  const visibleChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((chat) => !needle || chat.title.toLowerCase().includes(needle));
  }, [chats, query]);

  useEffect(() => {
    if (!activeId && chats[0]) setActiveId(chats[0].id);
    if (activeId && !chats.some((chat) => chat.id === activeId) && chats[0]) {
      setActiveId(chats[0].id);
    }
  }, [activeId, chats]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  }, [memory]);

  function createChat() {
    const chat = makeChat();
    setChats((current) => [chat, ...current]);
    setActiveId(chat.id);
    setSidebarOpen(false);
    setQuery("");
  }

  function mergeMemory(text) {
    const detected = detectMemory(text);
    if (!detected.name && !detected.fact) return;

    setMemory((current) => {
      const next = { ...current, facts: [...(current.facts || [])] };
      if (detected.name) next.name = detected.name;
      if (detected.fact && !next.facts.includes(detected.fact)) {
        next.facts = [detected.fact, ...next.facts].slice(0, 30);
      }
      return next;
    });
  }

  function updateMessages(messages, options = {}) {
    const latestUser = [...messages]
      .reverse()
      .find((message) => message.role === "user" && message.content?.trim());

    if (latestUser) mergeMemory(latestUser.content);

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== activeId) return chat;

        const shouldSnapshot = Boolean(options.newVersion);
        const versions = shouldSnapshot
          ? [
              ...(chat.versions || []),
              snapshot(chat.messages || [], options.versionLabel || "Previous version")
            ].slice(-20)
          : chat.versions || [];

        return {
          ...chat,
          messages,
          title: chat.title === "New chat" ? autoTitle(messages) : chat.title,
          updatedAt: Date.now(),
          versions
        };
      })
    );
  }

  function renameChat(id) {
    const chat = chats.find((item) => item.id === id);
    const title = window.prompt("Rename chat", chat?.title || "New chat");
    if (!title?.trim()) return;

    setChats((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, title: title.trim().slice(0, 80), updatedAt: Date.now() }
          : item
      )
    );
  }

  function deleteChat(id) {
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;

    setChats((current) => {
      const remaining = current.filter((chat) => chat.id !== id);
      const next = remaining.length ? remaining : [makeChat()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function restoreVersion(version) {
    const restored = structuredClone(version.messages);
    updateMessages(restored, {
      newVersion: true,
      versionLabel: `Before restoring ${version.label || "version"}`
    });
  }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-head">
            <div className="sidebar-brand">
              <div className="brand-mark">IM</div>
              <strong>IM AI</strong>
            </div>
            <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} type="button" aria-label="Close sidebar">
              ×
            </button>
          </div>

          <button className="new-chat" onClick={createChat} type="button">
            ＋ <span>New chat</span>
          </button>

          <div className="sidebar-search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats..."
              aria-label="Search chats"
            />
          </div>

          <div className="chat-list">
            <div className="section-label">Your chats</div>
            {visibleChats.length === 0 ? (
              <div className="empty-sidebar">No chats found.</div>
            ) : (
              visibleChats.map((chat) => (
                <div className={`chat-item ${chat.id === activeChat?.id ? "active" : ""}`} key={chat.id}>
                  <button
                    className="chat-select"
                    onClick={() => {
                      setActiveId(chat.id);
                      setSidebarOpen(false);
                    }}
                    type="button"
                  >
                    <span className="chat-icon">◌</span>
                    <span className="chat-title">{chat.title}</span>
                  </button>
                  <div className="chat-actions">
                    <button onClick={() => renameChat(chat.id)} title="Rename chat" type="button">✎</button>
                    <button onClick={() => deleteChat(chat.id)} title="Delete chat" type="button">⌫</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sidebar-foot">
            {memory.name
              ? `Memory: ${memory.name}${memory.facts?.length ? ` · ${memory.facts.length} fact${memory.facts.length === 1 ? "" : "s"}` : ""}`
              : "Chats and memory are saved on this device."}
          </div>
        </aside>

        {sidebarOpen && (
          <button className="sidebar-overlay mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" type="button" />
        )}

        <div className="main-panel">
          <header className="topbar">
            <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)} type="button" aria-label="Open sidebar">☰</button>
            <div className="brand">
              <div className="brand-mark">IM</div>
              <div>
                <h1>{activeChat?.title || "IM AI"}</h1>
                <p><span className="status-dot" /> OpenRouter · Nemotron 3.5 Lightning</p>
              </div>
            </div>
            <button className="ghost-button" onClick={createChat} type="button">＋ New chat</button>
          </header>

          <Chat
            key={activeChat?.id}
            messages={activeChat?.messages || []}
            onMessagesChange={updateMessages}
            versions={activeChat?.versions || []}
            onRestoreVersion={restoreVersion}
            memory={memory}
          />
        </div>
      </section>
    </main>
  );
}
