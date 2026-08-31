import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Chat({ messages, onAddMessage }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

      onAddMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "I couldn't generate a response."
      });
    } catch (error) {
      onAddMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Sorry, I couldn't respond. ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="chat-layout">
      <div className="messages" aria-live="polite">
        {messages.map((message) => <Message key={message.id} {...message} />)}
        {loading && (
          <div className="message-row assistant">
            <div className="avatar">AI</div>
            <div className="message-bubble typing">
              <div className="message-role">IM AI</div>
              <div>Thinking<span className="typing-dots">•••</span></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message IM AI..."
          aria-label="Message IM AI"
          disabled={loading}
        />
        <button type="submit" disabled={!input.trim() || loading} aria-label="Send message">➤</button>
      </form>
      <p className="disclaimer">IM AI can make mistakes. Check important information.</p>
    </div>
  );
}
