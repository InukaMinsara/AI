import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Chat({ messages, onMessagesChange, versions, onRestoreVersion }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function requestAI(history, assistantId, { saveVersion = false } = {}) {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map(({ role, content }) => ({ role, content }))
      })
    });

    if (!response.ok) {
      let msg = "Request failed";
      try {
        msg = (await response.json()).error || msg;
      } catch {}
      throw new Error(msg);
    }

    if (!response.body) throw new Error("Streaming is not supported by this browser.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let reply = "";

    onMessagesChange([...history, { id: assistantId, role: "assistant", content: "" }]);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      onMessagesChange([...history, { id: assistantId, role: "assistant", content: reply }]);
    }

    reply += decoder.decode();
    onMessagesChange(
      [...history, { id: assistantId, role: "assistant", content: reply }],
      { newVersion: saveVersion }
    );
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text
    };
    const history = [...messages, userMessage];

    setInput("");
    setLoading(true);

    try {
      await requestAI(history, crypto.randomUUID());
    } catch (error) {
      onMessagesChange([
        ...history,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Sorry, I couldn't respond. ${error.message}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(message) {
    setEditingId(message.id);
    setEditText(message.content);
  }

  async function saveEdit(message) {
    const text = editText.trim();
    if (!text || loading) return;

    const index = messages.findIndex((m) => m.id === message.id);
    if (index < 0) return;

    const edited = { ...message, content: text };
    const history = [...messages.slice(0, index), edited];

    setEditingId(null);
    setEditText("");
    setLoading(true);

    try {
      // Save the edited branch as a new version after the streamed reply completes.
      await requestAI(history, crypto.randomUUID(), { saveVersion: true });
    } catch (error) {
      onMessagesChange(
        [
          ...history,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Sorry, I couldn't respond. ${error.message}`
          }
        ],
        { newVersion: true }
      );
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(message) {
    if (loading || message.role !== "assistant") return;

    const index = messages.findIndex((m) => m.id === message.id);
    if (index < 0) return;

    const history = messages.slice(0, index);
    if (!history.length) return;

    setLoading(true);

    try {
      await requestAI(history, crypto.randomUUID(), { saveVersion: true });
    } catch (error) {
      onMessagesChange(
        [
          ...history,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Sorry, I couldn't respond. ${error.message}`
          }
        ],
        { newVersion: true }
      );
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
        {messages.map((message) => (
          <Message
            key={message.id}
            {...message}
            editing={editingId === message.id}
            editText={editText}
            setEditText={setEditText}
            onEdit={() => startEdit(message)}
            onSaveEdit={() => saveEdit(message)}
            onCancelEdit={() => setEditingId(null)}
            onRegenerate={() => regenerate(message)}
          />
        ))}

        {loading && messages.at(-1)?.role !== "assistant" && (
          <div className="message-row assistant">
            <div className="avatar">AI</div>
            <div className="message-bubble typing">
              <div className="message-role">IM AI</div>
              <div>
                Thinking<span className="typing-dots">•••</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {versions.length > 1 && (
        <div className="versions" aria-label="Conversation versions">
          <span>Versions:</span>
          {versions.map((version, index) => (
            <button
              key={version.id}
              type="button"
              onClick={() => onRestoreVersion(version)}
              title="Restore this conversation version"
            >
              {index === 0 ? "Original" : `Version ${index}`}
            </button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message IM AI..."
          aria-label="Message IM AI"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Send message"
        >
          ➤
        </button>
      </form>

      <p className="disclaimer">
        V4 · Chats, edits and versions are saved locally. IM AI can make mistakes.
      </p>
    </div>
  );
}
