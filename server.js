import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import mongoose from "mongoose"
import multer from "multer"

dotenv.config()

// Limit file size to 4MB to avoid payload too large errors
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }
})

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// OPENAI via OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
})

// DATABASE
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

const MessageSchema = new mongoose.Schema({
  role: String,
  content: mongoose.Schema.Types.Mixed
})

const ChatSchema = new mongoose.Schema({
  sessionId: String,
  title: { type: String, default: "New chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
})

const Chat = mongoose.model("Chat", ChatSchema)

// BUILD CONTENT: text + file => AI message content
function buildUserContent(text, file) {

  // No file, just return the text
  if (!file) {
    return text || ""
  }

  const mimeType = file.mimetype || "application/octet-stream"

  // IMAGE: send as base64 image_url (supported by gpt-4o on OpenRouter)
  if (mimeType.startsWith("image/")) {
    const base64 = file.buffer.toString("base64")
    const dataUrl = "data:" + mimeType + ";base64," + base64
    const parts = []
    if (text) {
      parts.push({ type: "text", text: text })
    } else {
      parts.push({ type: "text", text: "Please analyze this image." })
    }
    parts.push({
      type: "image_url",
      image_url: { url: dataUrl }
    })
    return parts
  }

  // PDF: extract as base64 text description
  if (mimeType === "application/pdf") {
    const base64 = file.buffer.toString("base64")
    const note = "[PDF Attached: " + file.originalname + "]\nBase64: data:application/pdf;base64," + base64.substring(0, 500) + "...(truncated)"
    return text ? text + "\n\n" + note : note
  }

  // TEXT / CODE / CSV / OTHER: read as plain text
  try {
    const fileText = file.buffer.toString("utf-8")
    const note = "[File: " + file.originalname + "]\n\n" + fileText
    return text ? text + "\n\n" + note : note
  } catch (e) {
    return text ? text + "\n\n[Binary file attached: " + file.originalname + "]" : "[Binary file: " + file.originalname + "]"
  }
}

// CHAT ROUTE
app.post("/chat", upload.single("image"), async (req, res) => {

  try {

    const message = req.body.message || ""
    const sessionId = req.body.sessionId || "default"
    const chatId = req.body.chatId || ""
    const file = req.file || null

    console.log("--- NEW REQUEST ---")
    console.log("Message:", message)
    console.log("File:", file ? file.originalname + " | " + file.mimetype + " | " + file.size + " bytes" : "none")

    if (!message && !file) {
      return res.status(400).json({ error: "No message or file" })
    }

    // Find or create chat
    let chat = null

    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try {
        chat = await Chat.findById(chatId)
      } catch (e) {
        console.log("Invalid chatId, creating new chat")
        chat = null
      }
    }

    if (!chat) {
      const title = message
        ? message.substring(0, 40)
        : (file ? file.originalname.substring(0, 40) : "New chat")
      chat = await Chat.create({
        sessionId: sessionId,
        title: title,
        messages: []
      })
    }

    // Save user message to DB (plain text version for history)
    const savedContent = message || "[File: " + (file ? file.originalname : "unknown") + "]"
    chat.messages.push({ role: "user", content: savedContent })
    await chat.save()

    // Set response headers
    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    // Build history for AI (exclude last user message, we'll add it with file)
    const history = chat.messages.slice(0, -1).map(function(m) {
      return {
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      }
    })

    // Build the current user message with file if attached
    const userContent = buildUserContent(message, file)

    // Choose model: use vision model only for images
    const isImage = file && file.mimetype && file.mimetype.startsWith("image/")
    const model = isImage ? "openai/gpt-4o" : "openai/gpt-4o-mini"

    console.log("Using model:", model)

    const aiMessages = [
      {
        role: "system",
        content: "You are Datta AI, a helpful assistant. Give accurate and factual answers. If an image or file is provided, analyze it carefully. If unsure, say you don't know."
      },
      ...history,
      {
        role: "user",
        content: userContent
      }
    ]

    // Call OpenRouter API with streaming
    const stream = await openai.chat.completions.create({
      model: model,
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
    chat.messages.push({ role: "assistant", content: full })
    await chat.save()

    res.write("CHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("=== SERVER ERROR ===")
    console.error("Message:", err.message)
    console.error("Stack:", err.stack)
    if (!res.headersSent) {
      res.status(500).send("Server error: " + err.message)
    }
  }

})

// GET ALL CHATS FOR SESSION
app.get("/chats/:sessionId", async (req, res) => {
  try {
    const chats = await Chat.find({ sessionId: req.params.sessionId }).sort({ createdAt: -1 })
    res.json(chats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET MESSAGES FOR A CHAT
app.get("/chat/:id", async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
    if (!chat) return res.json([])
    res.json(chat.messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE CHAT
app.delete("/chat/:id", async (req, res) => {
  try {
    await Chat.findByIdAndDelete(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// RENAME CHAT
app.post("/chat/:id/rename", async (req, res) => {
  try {
    await Chat.findByIdAndUpdate(req.params.id, { title: req.body.title })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// START SERVER
const PORT = process.env.PORT || 3000
app.listen(PORT, function() {
  console.log("Server running on port " + PORT)
})
