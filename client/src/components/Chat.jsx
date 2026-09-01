import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Message from "./Message.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ACCEPTED = [
  ".txt", ".md", ".json", ".csv", ".js", ".jsx", ".ts", ".tsx", ".py", ".html", ".css", ".pdf",
  "image/*"
].join(",");

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const MAX_TEXT_CHARS = 120000;

function fileKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "text";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || "").join(" ").trim();
    if (text) parts.push(`Page ${pageNumber}: ${text}`);
    if (parts.join("\n\n").length >= MAX_TEXT_CHARS) break;
  }

  return parts.join("\n\n").slice(0, MAX_TEXT_CHARS);
}

async function prepareAttachment(file) {
  const kind = fileKind(file);

  if (kind === "image") {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is too large. Please keep images under 2.5 MB.`);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: "image",
      mimeType: file.type,
      dataUrl: await readFileAsDataUrl(file)
    };
  }

  const text = kind === "pdf"
    ? await extractPdfText(file)
    : (await file.text()).slice(0, MAX_TEXT_CHARS);

  if (!text.trim()) throw new Error(`No readable text was found in ${file.name}.`);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: kind,
    mimeType: file.type || "text/plain",
    text
  };
}

function buildApiMessages(messages) {
  return messages.map(({ role, content, attachments }) => {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const imageParts = safeAttachments
      .filter((item) => item.type === "image" && typeof item.dataUrl === "string")
      .map((item) => ({
        type: "image_url",
        image_url: { url: item.dataUrl }
      }));

    const documentParts = safeAttachments
      .filter((item) => item.type !== "image" && typeof item.text === "string")
      .map((item) => `\n\n[Attached ${item.type.toUpperCase()} file: ${item.name}]\n${item.text}`)
      .join("");

    const textContent = `${typeof content === "string" ? content : ""}${documentParts}`.trim();

    if (imageParts.length) {
      return {
        role,
        content: [
          ...(textContent ? [{ type: "text", text: textContent }] : []),
          ...imageParts
        ]
      };
    }

    return { role, content: textContent };
  });
}

export default function Chat({ messages, onMessagesChange, versions, onRestoreVersion, memory }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function requestAI(history, assistantId, { saveVersion = false } = {}) {
    onMessagesChange(history);

    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: buildApiMessages(history),
        memory
      })
    });

    if (!response.ok) {
      let msg = "Request failed";
      try {
        const payload = await response.json();
        msg = payload?.error || msg;
        if (response.status === 429) msg = `Rate limit reached. ${msg}`;
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
      reply += decoder.decode(value || new Uint8Array(), { stream: !done });
      onMessagesChange([...history, { id: assistantId, role: "assistant", content: reply }]);
      if (done) break;
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
    if ((!text && attachments.length === 0) || loading) return;

    const attachmentSummary = attachments.length
      ? `\n\n[Attached: ${attachments.map((item) => item.name).join(", ")}]`
      : "";

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: `${text}${attachmentSummary}`.trim()
    };

    if (attachments.length) userMessage.attachments = attachments;

    const history = [...messages, userMessage];

    setInput("");
    setAttachments([]);
    setAttachmentError("");
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

  async function handleFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;

    setAttachmentError("");
    try {
      const prepared = [];
      for (const file of files.slice(0, 4)) {
        prepared.push(await prepareAttachment(file));
      }
      setAttachments((current) => [...current, ...prepared].slice(0, 4));
    } catch (error) {
      setAttachmentError(error.message || "Could not add that file.");
    }
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAttachmentError("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      setListening(true);
      setAttachmentError("");
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript || "";
      }
      if (transcript) setInput((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setAttachmentError("Voice input could not start. Check browser microphone permission.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
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
    delete edited.attachments;
    const history = [...messages.slice(0, index), edited];

    setEditingId(null);
    setEditText("");
    setLoading(true);

    try {
      await requestAI(history, crypto.randomUUID(), { saveVersion: true });
    } catch (error) {
      onMessagesChange(
        [...history, { id: crypto.randomUUID(), role: "assistant", content: `Sorry, I couldn't respond. ${error.message}` }],
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
        [...history, { id: crypto.randomUUID(), role: "assistant", content: `Sorry, I couldn't respond. ${error.message}` }],
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
              <div>Thinking<span className="typing-dots">•••</span></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {versions.length > 1 && (
        <div className="versions" aria-label="Conversation versions">
          <span>Versions:</span>
          {versions.map((version, index) => (
            <button key={version.id} type="button" onClick={() => onRestoreVersion(version)}>
              {index === 0 ? "Original" : `Version ${index}`}
            </button>
          ))}
        </div>
      )}

      {(attachments.length > 0 || attachmentError) && (
        <div className="attachment-area" aria-live="polite">
          {attachments.map((item) => (
            <div className="attachment-chip" key={item.id}>
              <span>{item.type === "image" ? "🖼️" : item.type === "pdf" ? "📄" : "📎"}</span>
              <span title={item.name}>{item.name}</span>
              <button type="button" onClick={() => removeAttachment(item.id)} aria-label={`Remove ${item.name}`}>×</button>
            </div>
          ))}
          {attachmentError && <div className="attachment-error">{attachmentError}</div>}
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
        <input
          ref={fileInputRef}
          className="file-input-hidden"
          type="file"
          accept={ACCEPTED}
          multiple
          onChange={handleFiles}
        />
        <button type="button" className="composer-tool" onClick={() => fileInputRef.current?.click()} disabled={loading} aria-label="Attach file">📎</button>
        <button type="button" className={`composer-tool ${listening ? "active" : ""}`} onClick={toggleVoice} disabled={loading} aria-label={listening ? "Stop voice input" : "Start voice input"}>
          {listening ? "⏹" : "🎙️"}
        </button>
        <button type="submit" disabled={(!input.trim() && attachments.length === 0) || loading} aria-label="Send message">➤</button>
      </form>

      <p className="disclaimer">
        V5 · Voice input, image/document attachments, chats, edits, versions and remembered preferences are supported. IM AI can make mistakes.
      </p>
    </div>
  );
}
