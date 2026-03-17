import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import mongoose from "mongoose"
import multer from "multer"

const upload = multer({ storage: multer.memoryStorage() })

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

/* ── OPENAI (OpenRouter) ───────────────────────────────────────────────────── */

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
})

/* ── DATABASE ─────────────────────────────────────────────────────────────── */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

const MessageSchema = new mongoose.Schema({
  role: String,
  content: mongoose.Schema.Types.Mixed   // allows string OR array (for image messages)
})

const ChatSchema = new mongoose.Schema({
  sessionId: String,
  title: { type: String, default: "New chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
})

const Chat = mongoose.model("Chat", ChatSchema)

/* ── HELPER: build user content block ────────────────────────────────────── */

function buildUserContent(text, file) {

  // No file → plain text
  if (!file) return text || ""

  const mimeType = file.mimetype
  const base64 = file.buffer.toString("base64")

  // ── IMAGE ──────────────────────────────────────────────────────────────────
  if (mimeType.startsWith("image/")) {
    const content = []

    if (text) {
      content.push({ type: "text", text })
    }

    content.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`
      }
    })

    return content
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  if (mimeType === "application/pdf") {
    const pdfText = `[PDF file: ${file.originalname}]\n(PDF content attached as base64 — ask the AI to analyze it)\ndata:application/pdf;base64,${base64}`
    return text ? `${text}\n\n${pdfText}` : pdfText
  }

  // ── TEXT / CODE / OTHER ────────────────────────────────────────────────────
  const fileContent = file.buffer.toString("utf-8")
  const combined = `[File: ${file.originalname}]\n\n${fileContent}`
  return text ? `${text}\n\n${combined}` : combined
}

/* ── CHAT STREAM ──────────────────────────────────────────────────────────── */

app.post("/chat", upload.single("image"), async (req, res) => {

  try {

    const message = req.body?.message || ""
    const sessionId = req.body?.sessionId
    const chatId = req.body?.chatId
    const file = req.file || null

    console.log("MESSAGE:", message)
    console.log("FILE:", file ? `${file.originalname} (${file.mimetype})` : "none")

    if (!message && !file) {
      return res.status(400).json({ error: "No message or file provided" })
    }

    // ── Find or create chat ──────────────────────────────────────────────────
    let chat

    if (chatId) {
      try {
        chat = await Chat.findById(chatId)
      } catch {
        chat = null
      }
    }

    if (!chat) {
      chat = await Chat.create({
        sessionId: sessionId || "default",
        title: message ? message.substring(0, 40) : (file?.originalname || "New chat"),
        messages: []
      })
    }

    if (!chat.messages) chat.messages = []

    // ── Build user content (text + optional file) ────────────────────────────
    const userContent = buildUserContent(message, file)

    // Save to DB (store text version for history display)
    chat.messages.push({
      role: "user",
      content: message || `[File: ${file?.originalname}]`
    })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    // ── Build messages for AI ────────────────────────────────────────────────
    // Use full history as plain text, replace the last message with rich content
    const historyMessages = chat.messages.slice(0, -1).map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    }))

    const aiMessages = [
      {
        role: "system",
        content: "Give accurate and factual answers. Keep them short but complete. If an image or file is provided, analyze it carefully. If unsure, say you don't know."
      },
      ...historyMessages,
      {
        role: "user",
        content: userContent   // this is the rich content with file if attached
      }
    ]

    // ── Choose model based on whether image is attached ──────────────────────
    // gpt-4o supports vision; gpt-4o-mini also supports vision on OpenRouter
    const model = file && file.mimetype.startsWith("image/")
      ? "openai/gpt-4o"        // vision model for images
      : "openai/gpt-4o-mini"   // fast model for text/files

    const stream = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: aiMessages,
      stream: true
    })

    let full = ""

    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content
      if (token) {
        full += token
        res.write(token)
      }
    }

    // Save AI response to DB
    chat.messages.push({
      role: "assistant",
      content: full
    })
    await chat.save()

    res.write("CHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("Chat error:", err)
    res.status(500).send("Server error")
  }

})

/* ── GET CHAT LIST ────────────────────────────────────────────────────────── */

app.get("/chats/:sessionId", async (req, res) => {
  const chats = await Chat.find({ sessionId: req.params.sessionId }).sort({ createdAt: -1 })
  res.json(chats)
})

/* ── OPEN CHAT ────────────────────────────────────────────────────────────── */

app.get("/chat/:id", async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.json([])
  res.json(chat.messages)
})

/* ── DELETE CHAT ──────────────────────────────────────────────────────────── */

app.delete("/chat/:id", async (req, res) => {
  await Chat.findByIdAndDelete(req.params.id)
  res.json({ success: true })
})

/* ── RENAME CHAT ──────────────────────────────────────────────────────────── */

app.post("/chat/:id/rename", async (req, res) => {
  const { title } = req.body
  await Chat.findByIdAndUpdate(req.params.id, { title })
  res.json({ success: true })
})

/* ── START SERVER ─────────────────────────────────────────────────────────── */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("Server running
