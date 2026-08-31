import { useEffect, useState } from "react";
import Chat from "./components/Chat.jsx";

const STORAGE_KEY = "im-ai-chat-history-v3";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "Hello! 👋 I’m IM AI. How can I help you today?"
  }
];

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : initialMessages;
  } catch {
    return initialMessages;
  }
}

export default function App() {
  const [messages, setMessages] = useState(loadMessages);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  function addMessage(message) {
    setMessages((current) => [...current, message]);
  }

  function clearChat() {
    setMessages(initialMessages);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">IM</div>
            <div>
              <h1>IM AI</h1>
              <p><span className="status-dot" /> Gemini connected · V3</p>
            </div>
          </div>
          <button className="ghost-button" onClick={clearChat}>＋ New chat</button>
        </header>
        <Chat messages={messages} onAddMessage={addMessage} />
      </section>
    </main>
  );
}
