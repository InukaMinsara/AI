import { useState } from "react";
import Chat from "./components/Chat.jsx";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content: "Hello! 👋 I’m IM AI. How can I help you today?"
  }
];

export default function App() {
  const [messages, setMessages] = useState(initialMessages);

  function addMessage(message) {
    setMessages((current) => [...current, message]);
  }

  function clearChat() {
    setMessages(initialMessages);
  }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">IM</div>
            <div>
              <h1>IM AI</h1>
              <p><span className="status-dot" /> Gemini connected</p>
            </div>
          </div>
          <button className="ghost-button" onClick={clearChat}>＋ New chat</button>
        </header>
        <Chat messages={messages} onAddMessage={addMessage} />
      </section>
    </main>
  );
}
