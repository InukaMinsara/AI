import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "im-ai-assistant",
    provider: "gemini",
    model,
    apiKeyConfigured: Boolean(apiKey)
  });
});

app.post("/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const memory = req.body?.memory && typeof req.body.memory === "object" ? req.body.memory : {};

    if (!apiKey || !ai) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Add it to server/.env and restart the server."
      });
    }

    const cleanMessages = messages
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          item.content.trim()
      )
      .slice(-40);

    if (!cleanMessages.length) {
      return res.status(400).json({ error: "Messages are required." });
    }

    const contents = cleanMessages.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }]
    }));

    const memoryLines = [];
    if (typeof memory.name === "string" && memory.name.trim()) {
      memoryLines.push(`The user's name is ${memory.name.trim()}.`);
    }

    const systemInstruction = [
      "You are IM AI Assistant.",
      "Be helpful, clear, friendly, and natural.",
      "Support Sinhala and English.",
      "Use the supplied conversation history to maintain context.",
      "Do not claim to remember information that is not present in the supplied history or persistent memory.",
      memoryLines.length
        ? `Persistent user memory: ${memoryLines.join(" ")}`
        : ""
    ]
      .filter(Boolean)
      .join(" ");

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction }
    });

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (text) res.write(text);
    }

    res.end();
  } catch (error) {
    console.error("Gemini API Error:", error);

    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    const message = error?.message || "Gemini API request failed.";

    if (!res.headersSent) {
      return res.status(status).json({
        error: message,
        status,
        model
      });
    }

    res.end();
  }
});

app.listen(port, () => {
  console.log(`IM AI server running on http://localhost:${port}`);
  console.log(`Gemini model: ${model}`);
  console.log(`Gemini API key: ${apiKey ? "configured" : "MISSING"}`);
});
