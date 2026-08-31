import { useState } from "react";

export default function Message({ role, content }) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard permissions can be unavailable in some browsers.
    }
  }

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar">AI</div>}
      <div className="message-bubble">
        <div className="message-meta">
          <div className="message-role">{isUser ? "You" : "IM AI"}</div>
          {!isUser && (
            <button className="copy-button" onClick={copyMessage} type="button">
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <div className="message-content">{content}</div>
      </div>
    </div>
  );
}
