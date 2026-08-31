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

    const userMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const history = [...messages, userMessage];
    onAddMessage(userMessage);
    setInput("");
    setLoading(true);

    const assistantId = crypto.randomUUID();
    onAddMessage({ id: assistantId, role: "assistant", content: "" });

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content }))
        })
      });

      if (!response.ok) {
        let errorMessage = "Request failed";
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      if (!response.body) throw new Error("Streaming is not supported by this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });

        onAddMessage({
          id: assistantId,
          role: "assistant",
          content: reply,
          replace: true
        });
      }

      reply += decoder.decode();
      onAddMessage({ id: assistantId, role: "assistant", content: reply, replace: true });
    } catch (error) {
      onAddMessage({
        id: assistantId,
        role: "assistant",
        content: `Sorry, I couldn't respond. ${error.message}`,
        replace: true
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
        {loading && messages.at(-1)?.role !== "assistant" && (
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
      <p className="disclaimer">V3 · Conversation memory is saved locally. IM AI can make mistakes.</p>
    </div>
  );
}
