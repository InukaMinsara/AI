import { useState } from "react";
import Message from "./Message.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Chat({ messages, onAddMessage }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    onAddMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");

      onAddMessage({ id: crypto.randomUUID(), role: "assistant", content: data.reply });
    } catch (error) {
      onAddMessage({ id: crypto.randomUUID(), role: "assistant", content: `Sorry, I couldn't respond. ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-layout">
      <div className="messages" aria-live="polite">
        {messages.map((message) => <Message key={message.id} {...message} />)}
        {loading && (
          <div className="message-row assistant">
            <div className="avatar">AI</div>
            <div className="message-bubble typing">Thinking<span>•••</span></div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message IM AI..."
          aria-label="Message IM AI"
          disabled={loading}
        />
        <button type="submit" disabled={!input.trim() || loading} aria-label="Send message">➤</button>
      </form>
      <p className="disclaimer">AI can make mistakes. Check important information.</p>
    </div>
  );
}
