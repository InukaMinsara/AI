import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "im-ai-assistant" });
});

app.post("/chat", async (req, res) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      instructions: "You are IM AI Assistant. Be helpful, clear, concise, and support Sinhala and English.",
      input: message
    });

    res.json({ reply: response.output_text || "I could not generate a response." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI request failed." });
  }
});

app.listen(port, () => {
  console.log(`IM AI server running on http://localhost:${port}`);
});
