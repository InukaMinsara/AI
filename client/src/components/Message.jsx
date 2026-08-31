import { useState } from "react";

export default function Message({ role, content, editing, editText, setEditText, onEdit, onSaveEdit, onCancelEdit, onRegenerate }) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  }

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar">AI</div>}
      <div className="message-bubble">
        <div className="message-meta"><div className="message-role">{isUser ? "You" : "IM AI"}</div><div className="message-tools">
          {isUser && !editing && <button className="message-tool" onClick={onEdit} type="button">Edit</button>}
          {!isUser && content && <><button className="message-tool" onClick={copyMessage} type="button">{copied ? "Copied" : "Copy"}</button><button className="message-tool" onClick={onRegenerate} type="button">↻ Retry</button></>}
        </div></div>
        {editing ? <div className="edit-box"><textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus /><div className="edit-actions"><button type="button" onClick={onCancelEdit}>Cancel</button><button type="button" className="save-edit" onClick={onSaveEdit}>Save & retry</button></div></div> : <div className="message-content">{content}</div>}
      </div>
    </div>
  );
}
