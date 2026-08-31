# IM AI Assistant

A simple full-stack AI chatbot built with React, Vite, Express, and the OpenAI Responses API.

## Structure

- `client/` — React frontend
- `server/` — Express API

## Setup

### Server

```bash
cd server
npm install
copy .env.example .env
npm start
```

Set `OPENAI_API_KEY` in `.env`.

### Client

```bash
cd client
npm install
npm run dev
```

The frontend expects the API at `http://localhost:3000`.

## Security

Never put the OpenAI API key in the frontend or commit `.env` to GitHub.
