import { useEffect, useMemo, useState } from "react";
import Chat from "./components/Chat.jsx";

const STORAGE_KEY = "im-ai-chats-v4";
const OLD_KEY = "im-ai-chat-history-v3";
const MEMORY_KEY = "im-ai-memory-v1";

function welcome() {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "Hello! 👋 I’m IM AI. How can I help you today?"
  };
}

function makeChat(messages = [welcome()]) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages,
    versions: [
      {
        id: crypto.randomUUID(),
        label: "Original",
        messages: structuredClone(messages)
      }
    ]
  };
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== "object") return null;

  const messages = Array.isArray(chat.messages) ? chat.messages : [welcome()];
  const now = Date.now();

  return {
    id: chat.id || crypto.randomUUID(),
    title: chat.title || autoTitle(messages),
    createdAt: chat.createdAt || now,
    updatedAt: chat.updatedAt || now,
    messages,
    versions: Array.isArray(chat.versions) && chat.versions.length
      ? chat.versions
      : [{ id: crypto.randomUUID(), label: "Original", messages: structuredClone(messages) }]
  };
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) {
      return saved.map(normalizeChat).filter(Boolean);
    }

    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (Array.isArray(old) && old.length) return [makeChat(old)];
  } catch (error) {
    console.warn("Could not load saved chats", error);
  }

  return [makeChat()];
}

function loadMemory() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function autoTitle(messages) {
  const first = messages.find(
    (message) => message.role === "user" && message.content?.trim()
  );

  if (!first) return "New chat";

  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function detectName(text) {
  const patterns = [
    /\bmy name is\s+([A-Za-z][A-Za-z '\u2019.-]{0,38})/i,
    /\bi am\s+([A-Za-z][A-Za-z '\u2019.-]{0,38})/i,
    /\bi'm\s+([A-Za-z][A-Za-z '\u2019.-]{0,38})/i,
    /\bmage nama\s+([A-Za-z][A-Za-z '\u2019.-]{0,38})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.,!?]+$/, "");
    }
  }

  return null;
}

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [memory, setMemory] = useState(loadMemory);
  const [activeId, setActiveId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeId) || chats[0],
    [chats, activeId]
  );

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
  }

  function updateMessages(messages, { newVersion = false } = {}) {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user" && message.content?.trim());
    const detectedName = latestUserMessage ? detectName(latestUserMessage.content) : null;

    if (detectedName) {
      setMemory((current) => ({ ...current, name: detectedName }));
    }

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== activeId) return chat;

        const versions = newVersion
          ? [
              ...(chat.versions || []),
              {
                id: crypto.randomUUID(),
                label: `Version ${(chat.versions || []).length}`,
                messages: structuredClone(messages)
              }
            ]
          : chat.versions || [];

        return {
          ...chat,
          messages,
          title:
            chat.title === "New chat" ? autoTitle(messages) : chat.title,
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
          ? { ...item, title: title.trim(), updatedAt: Date.now() }
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
    updateMessages(restored);
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
            <button
              className="icon-button mobile-only"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ×
            </button>
          </div>

          <button className="new-chat" onClick={createChat} type="button">
            ＋ <span>New chat</span>
          </button>

          <div className="chat-list">
            <div className="section-label">Your chats</div>
            {[...chats]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((chat) => (
                <div
                  className={`chat-item ${chat.id === activeChat?.id ? "active" : ""}`}
                  key={chat.id}
                >
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
                    <button
                      onClick={() => renameChat(chat.id)}
                      title="Rename chat"
                      type="button"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => deleteChat(chat.id)}
                      title="Delete chat"
                      type="button"
                    >
                      ⌫
                    </button>
                  </div>
                </div>
              ))}
          </div>

          <div className="sidebar-foot">
            {memory.name ? `Remembering: ${memory.name}` : "Chats are saved on this device."}
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="sidebar-overlay mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            type="button"
          />
        )}

        <div className="main-panel">
          <header className="topbar">
            <button
              className="icon-button mobile-only"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              type="button"
            >
              ☰
            </button>

            <div className="brand">
              <div className="brand-mark">IM</div>
              <div>
                <h1>{activeChat?.title || "IM AI"}</h1>
                <p>
                  <span className="status-dot" /> Gemini connected · V4
                </p>
              </div>
            </div>

            <button className="ghost-button" onClick={createChat} type="button">
              ＋ New chat
            </button>
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
