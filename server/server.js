import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free";
const visionModel = process.env.OPENROUTER_VISION_MODEL || "google/gemma-4-31b-it:free";
const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:5173";
const siteName = process.env.OPENROUTER_SITE_NAME || "IM AI";

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "im-ai-assistant",
    provider: "openrouter",
    model,
    visionModel,
    apiKeyConfigured: Boolean(apiKey)
  });
});

function cleanContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .filter((part) => {
      if (!part || typeof part !== "object") return false;
      if (part.type === "text") return typeof part.text === "string" && part.text.trim();
      if (part.type === "image_url") {
        const url = part.image_url?.url;
        return typeof url === "string" && (url.startsWith("data:image/") || /^https?:\/\//i.test(url));
      }
      return false;
    })
    .map((part) => {
      if (part.type === "text") return { type: "text", text: part.text.trim() };
      return { type: "image_url", image_url: { url: part.image_url.url } };
    });
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];

  const messages = value
    .filter((item) => item && (item.role === "user" || item.role === "assistant" || item.role === "system"))
    .map(({ role, content }) => ({ role, content: cleanContent(content) }))
    .filter((item) => {
      if (typeof item.content === "string") return Boolean(item.content);
      return Array.isArray(item.content) && item.content.length > 0;
    });

  const last = messages.at(-1);
  if (last?.role === "assistant") {
    messages.push({ role: "user", content: "Please continue from the conversation above." });
  }

  return messages.slice(-60);
}

function containsImage(messages) {
  return messages.some((message) =>
    Array.isArray(message.content) && message.content.some((part) => part.type === "image_url")
  );
}

function buildSystemPrompt(memory) {
  const lines = [
    "You are IM AI, a friendly personal AI assistant.",
    "Be helpful, concise, natural, and accurate.",
    "Support English and Sinhala/Singlish naturally.",
    "Maintain continuity using the conversation history provided in the request.",
    "Do not invent memories. Only use persistent memory items that are explicitly supplied.",
    "When the user attaches a document or image, use its provided content to answer the user's question."
  ];

  if (memory && typeof memory === "object") {
    const memoryItems = [];
    if (typeof memory.name === "string" && memory.name.trim()) {
      memoryItems.push(`The user's name is ${memory.name.trim()}.`);
    }
    if (Array.isArray(memory.facts)) {
      for (const fact of memory.facts.slice(0, 20)) {
        if (typeof fact === "string" && fact.trim()) memoryItems.push(fact.trim());
      }
    }
    if (memoryItems.length) lines.push(`Persistent user memory: ${memoryItems.join(" ")}`);
  }

  return lines.join(" ");
}

async function readError(response) {
  const text = await response.text();
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = parsed?.error?.message || parsed?.error || text;
  } catch {}
  return { detail: String(detail), retryAfter: response.headers.get("retry-after") };
}

function sendJsonError(res, status, error, modelName, retryAfter = null) {
  return res.status(status).json({ error, status, model: modelName, retryAfter });
}

async function callOpenRouter({ selectedModel, messages, stream }) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": siteName
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      stream
    })
  });
}

app.post("/chat", async (req, res) => {
  try {
    if (!apiKey) {
      return sendJsonError(
        res,
        500,
        "OPENROUTER_API_KEY is not configured. Add it to server/.env and restart the server.",
        model
      );
    }

    const messages = cleanMessages(req.body?.messages);
    const memory = req.body?.memory && typeof req.body.memory === "object" ? req.body.memory : {};
    const hasImage = containsImage(messages);
    const selectedModel = hasImage
      ? visionModel
      : (typeof req.body?.model === "string" && req.body.model ? req.body.model : model);

    if (!messages.length) return sendJsonError(res, 400, "Messages are required.", selectedModel);

    if (hasImage) {
      const imageTurn = [...messages].reverse().find(
        (message) => message.role === "user" && Array.isArray(message.content) && message.content.some((part) => part.type === "image_url")
      );

      if (!imageTurn) return sendJsonError(res, 400, "An image user message is required.", selectedModel);

      const userText = imageTurn.content.filter((part) => part.type === "text");
      const userImages = imageTurn.content.filter((part) => part.type === "image_url");
      const fallbackText = userText.length
        ? userText
        : [{ type: "text", text: "Describe and analyze this image." }];

      // Important: send only one user turn for vision requests.
      // Some OpenRouter vision providers reject any prompt history containing
      // a system/model turn combination with `Requests ending with a model turn...`.
      const visionMessages = [{
        role: "user",
        content: [...fallbackText, ...userImages]
      }];

      const upstream = await callOpenRouter({
        selectedModel,
        messages: visionMessages,
        stream: false
      });

      if (!upstream.ok) {
        const { detail, retryAfter } = await readError(upstream);
        console.error("OpenRouter vision error:", detail);
        return sendJsonError(res, upstream.status, detail, selectedModel, retryAfter);
      }

      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return sendJsonError(res, 502, "The vision model returned an empty response.", selectedModel);
      }

      res.type("text/plain; charset=utf-8");
      return res.send(content);
    }

    const upstream = await callOpenRouter({
      selectedModel,
      messages: [{ role: "system", content: buildSystemPrompt(memory) }, ...messages],
      stream: true
    });

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

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const json = JSON.parse(payload);
            const text = json?.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) res.write(text);
          } catch {
            // Ignore malformed SSE fragments and continue streaming.
          }
        }
      }

      if (done) break;
    }

    res.end();
  } catch (error) {
    console.error("OpenRouter API Error:", error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (!res.headersSent) {
      return sendJsonError(res, status, error?.message || "OpenRouter request failed.", model);
    }
    res.end();
  }
});

app.listen(port, () => {
  console.log(`IM AI server running on http://localhost:${port}`);
  console.log(`OpenRouter model: ${model}`);
  console.log(`OpenRouter vision model: ${visionModel}`);
  console.log(`OpenRouter API key: ${apiKey ? "configured" : "MISSING"}`);
});
