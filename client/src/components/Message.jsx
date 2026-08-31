export default function Message({ role, content }) {
  const isUser = role === "user";

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar">AI</div>}
      <div className="message-bubble">
        <div className="message-role">{isUser ? "You" : "IM AI"}</div>
        <div className="message-content">{content}</div>
      </div>
    </div>
  );
}
