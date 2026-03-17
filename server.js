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

// OPENAI (OpenRouter)
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

// HELPER: build content block for AI
function buildUserContent(text, file) {

  if (!file) return text || ""

  const mimeType = file.mimetype
  const base64 = file.buffer.toString("base64")

  // Image file
  if (mimeType.startsWith("image/")) {
    const content = []
    if (text) {
      content.push({ type: "text", text: text })
    }
    content.push({
      type: "image_url",
      image_url: {
        url: "data:" + mimeType + ";base64," + base64
      }
    })
    return content
  }

  // PDF file
  if (mimeType === "application/pdf") {
    const pdfText = "[PDF file: " + file.originalname + "]\ndata:application/pdf;base64," + base64
    return text ? text + "\n\n" + pdfText : pdfText
  }

  // Text / code / other files
  const fileContent = file.buffer.toString("utf-8")
  const combined = "[File: " + file.originalname + "]\n\n" + fileContent
  return text ? text + "\n\n" + combined : combined
}

// CHAT ROUTE
app.post("/chat", upload.single("image"), async (req, res) => {

  try {

    const message = req.body.message || ""
    const sessionId = req.body.sessionId
    const chatId = req.body.chatId
    const file = req.file || null

    console.log("MESSAGE:", message)
    console.log("FILE:", file ? file.originalname + " (" + file.mimetype + ")" : "none")

    if (!message && !file) {
      return res.status(400).json({ error: "No message or file provided" })
    }

    let chat = null

    if (chatId && chatId !== "null" && chatId !== "") {
      try {
        chat = await Chat.findById(chatId)
      } catch (e) {
        chat = null
      }
    }

    if (!chat) {
      const title = message ? message.substring(0, 40) : (file ? file.originalname : "New chat")
      chat = await Chat.create({
        sessionId: sessionId || "default",
        title: title,
        messages: []
      })
    }

    if (!chat.messages) {
      chat.messages = []
    }

    const userContent = buildUserContent(message, file)

    chat.messages.push({
      role: "user",
      content: message || "[File: " + (file ? file.originalname : "unknown") + "]"
    })

    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    const historyMessages = chat.messages.slice(0, -1).map(function(m) {
      return {
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      }
    })

    const systemMsg = {
      role: "system",
      content: "Give accurate and factual answers. Keep them short but complete. If an image or file is provided, analyze it carefully. If unsure, say you don't know."
    }

    const userMsg = {
      role: "user",
      content: userContent
    }

    const aiMessages = [systemMsg].concat(historyMessages).concat([userMsg])

    const model = (file && file.mimetype.startsWith("image/"))
      ? "openai/gpt-4o"
      : "openai/gpt-4o-mini"

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

// GET ALL CHATS
app.get("/chats/:sessionId", async (req, res) => {
  const chats = await Chat.find({ sessionId: req.params.sessionId }).sort({ createdAt: -1 })
  res.json(chats)
})

// GET SINGLE CHAT MESSAGES
app.get("/chat/:id", async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.json([])
  res.json(chat.messages)
})

// DELETE CHAT
app.delete("/chat/:id", async (req, res) => {
  await Chat.findByIdAndDelete(req.params.id)
  res.json({ success: true })
})

// RENAME CHAT
app.post("/chat/:id/rename", async (req, res) => {
  const title = req.body.title
  await Chat.findByIdAndUpdate(req.params.id, { title: title })
  res.json({ success: true })
})

// START SERVER
const PORT = process.env.PORT || 3000
app.listen(PORT, function() {
  console.log("Server running on port " + PORT)
})
