import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "im-ai-assistant", provider: "gemini", model });
});

app.post("/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const cleanMessages = messages
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-30);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
    }

    if (!cleanMessages.length) {
      return res.status(400).json({ error: "Messages are required." });
    }

    const contents = cleanMessages.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }]
    }));

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: "You are IM AI Assistant. Be helpful, clear, concise, friendly, and support Sinhala and English. Remember the conversation context provided in the request."
      }
    });

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (text) res.write(text);
    }

    res.end();
  } catch (error) {
    console.error("Gemini API Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Gemini API request failed." });
    }
    res.end();
  }
});

app.listen(port, () => {
  console.log(`IM AI server running on http://localhost:${port}`);
});
