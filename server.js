// Datta AI v2 — backend server
// Streams answers from Groq's free AI models to the chat page.

import express from "express"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config()

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const GROQ_API_KEY = process.env.GROQ_API_KEY

// Main model first; if it fails, the next one is tried.
const MODELS = [
  process.env.MAIN_MODEL || "openai/gpt-oss-120b",
  process.env.BACKUP_MODEL || "llama-3.3-70b-versatile",
]

const SYSTEM_PROMPT = `You are Datta AI, a friendly and very capable AI assistant made by LR AgroSense.
You can help with anything, but you are especially strong at coding.

When writing code:
- Give complete, working code — never leave "..." or "rest of code here".
- Always put code inside fenced code blocks with the language name (\`\`\`html, \`\`\`js, \`\`\`python, etc).
- For websites, games or UI demos, prefer ONE self-contained \`\`\`html block with the CSS and JavaScript inside it, so the user can preview it instantly.
- Explain briefly what the code does and how to run it. Assume the user may be a beginner.

For everything else, answer clearly and simply. Use markdown (headings, lists, tables) when it helps.`

// Allow the page on datta-ai.com (Vercel) to talk to this server (Render)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(204).end()
  next()
})

app.use(express.json({ limit: "1mb" }))
app.use(express.static(path.join(__dirname, "public")))

// ── Simple limit: 30 messages per minute per person ──────────────────────────
const hits = new Map()
function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  if (recent.length >= 30) {
    return res.status(429).json({ error: "Too many messages. Please wait a minute and try again." })
  }
  recent.push(now)
  hits.set(ip, recent)
  next()
}
setInterval(() => hits.clear(), 10 * 60_000)

app.get("/health", (req, res) => res.json({ status: "ok", keySet: Boolean(GROQ_API_KEY) }))

// ── Chat: receives the conversation, streams the answer back as plain text ──
app.post("/api/chat", rateLimit, async (req, res) => {
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "Server is missing GROQ_API_KEY. Add it to your .env file." })
  }

  const incoming = Array.isArray(req.body.messages) ? req.body.messages : []
  const messages = incoming
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20) // keep the last 20 messages so requests stay small
    .map((m) => ({ role: m.role, content: m.content.slice(0, 30_000) }))

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Please send a message." })
  }

  // Stop calling the AI if the user presses Stop or closes the page
  const controller = new AbortController()
  res.on("close", () => controller.abort())

  let lastError = "Unknown error"
  for (const model of MODELS) {
    try {
      const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.6,
          max_tokens: 8000,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        }),
      })

      if (!aiRes.ok) {
        lastError = `${model} → ${aiRes.status} ${await aiRes.text()}`
        console.error("[AI error]", lastError.slice(0, 300))
        continue // try the backup model
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("X-Model", model)

      // Read Groq's stream and pass just the text to the browser
      const decoder = new TextDecoder()
      let buffer = ""
      for await (const chunk of aiRes.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") continue
          try {
            const text = JSON.parse(data).choices?.[0]?.delta?.content
            if (text) res.write(text)
          } catch {
            /* ignore incomplete pieces */
          }
        }
      }
      return res.end()
    } catch (err) {
      if (controller.signal.aborted) return res.end()
      lastError = `${model} → ${err.message}`
      console.error("[AI error]", lastError)
      if (res.headersSent) return res.end()
    }
  }

  res.status(502).json({ error: "The AI is busy right now. Please try again in a moment." })
})

// Any other address shows the chat page
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")))

app.listen(PORT, () => {
  console.log(`Datta AI running at http://localhost:${PORT}`)
  if (!GROQ_API_KEY) console.warn("⚠ GROQ_API_KEY is not set — chat will not work yet.")
})
