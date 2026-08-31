import { useEffect, useMemo, useState } from "react";
import Chat from "./components/Chat.jsx";

const STORAGE_KEY = "im-ai-chats-v4";
const OLD_KEY = "im-ai-chat-history-v3";

const welcome = () => ({ id: crypto.randomUUID(), role: "assistant", content: "Hello! 👋 I’m IM AI. How can I help you today?" });
function makeChat(messages = [welcome()]) { return { id: crypto.randomUUID(), title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages, versions: [{ id: crypto.randomUUID(), label: "Original", messages }] }; }
function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (Array.isArray(old) && old.length) return [makeChat(old)];
  } catch {}
  return [makeChat()];
}
function autoTitle(messages) {
  const first = messages.find((m) => m.role === "user" && m.content?.trim());
  if (!first) return "New chat";
  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => loadChats()[0]?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) || chats[0], [chats, activeId]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { if (!activeChat && chats[0]) setActiveId(chats[0].id); }, [activeChat, chats]);

  function createChat() { const chat = makeChat(); setChats((c) => [chat, ...c]); setActiveId(chat.id); setSidebarOpen(false); }
  function updateMessages(messages, { newVersion = false } = {}) {
    setChats((current) => current.map((chat) => {
      if (chat.id !== activeId) return chat;
      const versions = newVersion ? [...(chat.versions || []), { id: crypto.randomUUID(), label: `Edit ${(chat.versions || []).length}`, messages }] : (chat.versions || []);
      return { ...chat, messages, title: chat.title === "New chat" ? autoTitle(messages) : chat.title, updatedAt: Date.now(), versions };
    }));
  }
  function renameChat(id) {
    const chat = chats.find((c) => c.id === id);
    const title = window.prompt("Rename chat", chat?.title || "New chat");
    if (!title?.trim()) return;
    setChats((c) => c.map((item) => item.id === id ? { ...item, title: title.trim(), updatedAt: Date.now() } : item));
  }
  function deleteChat(id) {
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    const remaining = chats.filter((c) => c.id !== id);
    const next = remaining.length ? remaining : [makeChat()];
    setChats(next);
    if (id === activeId) setActiveId(next[0].id);
  }
  function restoreVersion(version) { updateMessages(version.messages); }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-head"><div className="sidebar-brand"><div className="brand-mark">IM</div><strong>IM AI</strong></div><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)}>×</button></div>
          <button className="new-chat" onClick={createChat}>＋ <span>New chat</span></button>
          <div className="chat-list"><div className="section-label">Your chats</div>
            { [...chats].sort((a,b) => b.updatedAt-a.updatedAt).map((chat) => (
              <div className={`chat-item ${chat.id === activeChat?.id ? "active" : ""}`} key={chat.id}>
                <button className="chat-select" onClick={() => { setActiveId(chat.id); setSidebarOpen(false); }}><span className="chat-icon">◌</span><span className="chat-title">{chat.title}</span></button>
                <div className="chat-actions"><button onClick={() => renameChat(chat.id)} title="Rename">✎</button><button onClick={() => deleteChat(chat.id)} title="Delete">⌫</button></div>
              </div>
            ))}
          </div>
          <div className="sidebar-foot">Chats are saved on this device.</div>
        </aside>
        {sidebarOpen && <button className="sidebar-overlay mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
        <div className="main-panel">
          <header className="topbar"><button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)}>☰</button><div className="brand"><div className="brand-mark">IM</div><div><h1>{activeChat?.title || "IM AI"}</h1><p><span className="status-dot" /> Gemini connected · V4</p></div></div><button className="ghost-button" onClick={createChat}>＋ New chat</button></header>
          <Chat key={activeChat?.id} messages={activeChat?.messages || []} onMessagesChange={updateMessages} versions={activeChat?.versions || []} onRestoreVersion={restoreVersion} />
        </div>
      </section>
    </main>
  );
}
