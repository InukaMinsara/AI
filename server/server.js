import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.MISTRAL_API_KEY;
const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
const visionModel = process.env.MISTRAL_VISION_MODEL || "mistral-large-2512";

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "im-ai-assistant", provider: "mistral", model, visionModel, apiKeyConfigured: Boolean(apiKey) });
});

function normalizeImageUrl(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.url === "string") return value.url;
  return "";
}

function cleanContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (!part || typeof part !== "object") return null;
    if (part.type === "text") {
      const text = String(part.text || "").trim();
      return text ? { type: "text", text } : null;
    }
    if (part.type === "image_url") {
      const url = normalizeImageUrl(part.image_url);
      return url ? { type: "image_url", image_url: url } : null;
    }
    return null;
  }).filter(Boolean);
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && ["user", "assistant", "system"].includes(item.role))
    .map(({ role, content }) => ({ role, content: cleanContent(content) }))
    .filter((item) => typeof item.content === "string" ? Boolean(item.content) : item.content.length > 0)
    .slice(-60);
}

function containsImage(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
}

function buildSystemPrompt(memory) {
  const lines = [
    "You are IM AI, a friendly personal AI assistant.",
    "Be helpful, concise, natural, and accurate.",
    "Support English and Sinhala/Singlish naturally.",
    "Maintain continuity using the conversation history provided in the request.",
    "Do not invent memories. Only use persistent memory explicitly supplied.",
    "When the user attaches an image, use it to answer the user's question."
  ];
  const memoryItems = [];
  if (memory && typeof memory === "object") {
    if (typeof memory.name === "string" && memory.name.trim()) memoryItems.push(`The user's name is ${memory.name.trim()}.`);
    if (Array.isArray(memory.facts)) for (const fact of memory.facts.slice(0, 20)) if (typeof fact === "string" && fact.trim()) memoryItems.push(fact.trim());
  }
  if (memoryItems.length) lines.push(`Persistent user memory: ${memoryItems.join(" ")}`);
  return lines.join(" ");
}

function sendJsonError(res, status, error, modelName, retryAfter = null) {
  return res.status(status).json({ error, status, model: modelName, retryAfter });
}

async function readError(response) {
  const text = await response.text();
  let detail = text;
  try { const parsed = JSON.parse(text); detail = parsed?.message || parsed?.error?.message || parsed?.error || text; } catch {}
  return { detail: String(detail), retryAfter: response.headers.get("retry-after") };
}

async function callMistral({ selectedModel, messages, stream }) {
  return fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: selectedModel, messages, stream })
  });
}

app.post("/chat", async (req, res) => {
  try {
    if (!apiKey) return sendJsonError(res, 500, "MISTRAL_API_KEY is not configured. Add it to server/.env and restart the server.", model);

    const incoming = cleanMessages(req.body?.messages);
    const memory = req.body?.memory && typeof req.body.memory === "object" ? req.body.memory : {};
    const hasImage = containsImage(incoming);
    const selectedModel = hasImage ? visionModel : model;
    if (!incoming.length) return sendJsonError(res, 400, "Messages are required.", selectedModel);

    if (hasImage) {
      const imageTurn = [...incoming].reverse().find((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
      if (!imageTurn) return sendJsonError(res, 400, "An image user message is required.", selectedModel);
      const upstream = await callMistral({
        selectedModel,
        messages: [{ role: "system", content: buildSystemPrompt(memory) }, { role: "user", content: imageTurn.content }],
        stream: false
      });
      if (!upstream.ok) {
        const { detail, retryAfter } = await readError(upstream);
        console.error("Mistral vision error:", detail);
        return sendJsonError(res, upstream.status, detail, selectedModel, retryAfter);
      }
      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return sendJsonError(res, 502, "The vision model returned an empty response.", selectedModel);
      res.type("text/plain; charset=utf-8");
      return res.send(content);
    }

    const upstream = await callMistral({ selectedModel, messages: [{ role: "system", content: buildSystemPrompt(memory) }, ...incoming], stream: true });
    if (!upstream.ok) {
      const { detail, retryAfter } = await readError(upstream);
      return sendJsonError(res, upstream.status, detail, selectedModel, retryAfter);
    }
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    const reader = upstream.body?.getReader();
    if (!reader) return res.end();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try { const json = JSON.parse(payload); const text = json?.choices?.[0]?.delta?.content; if (typeof text === "string" && text) res.write(text); } catch {}
      }
      if (done) break;
    }
    res.end();
  } catch (error) {
    console.error("Mistral API Error:", error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (!res.headersSent) return sendJsonError(res, status, error?.message || "Mistral request failed.", model);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`IM AI server running on http://localhost:${port}`);
  console.log(`Mistral model: ${model}`);
  console.log(`Mistral vision model: ${visionModel}`);
  console.log(`Mistral API key: ${apiKey ? "configured" : "MISSING"}`);
});
