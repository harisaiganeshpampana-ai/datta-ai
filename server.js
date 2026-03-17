import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import Groq from "groq-sdk"

dotenv.config()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// GROQ CLIENT (free)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// DATABASE
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

const MessageSchema = new mongoose.Schema({
  role: String,
  content: String
})

const ChatSchema = new mongoose.Schema({
  sessionId: String,
  title: { type: String, default: "New chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
})

const Chat = mongoose.model("Chat", ChatSchema)

// CHAT ROUTE
app.post("/chat", upload.single("image"), async (req, res) => {

  try {

    const message = req.body.message || ""
    const sessionId = req.body.sessionId || "default"
    const chatId = req.body.chatId || ""
    const file = req.file || null

    console.log("Message:", message)
    console.log("File:", file ? file.originalname + " (" + file.mimetype + ")" : "none")

    if (!message && !file) {
      return res.status(400).json({ error: "No message or file" })
    }

    // Find or create chat
    let chat = null

    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try {
        chat = await Chat.findById(chatId)
      } catch (e) {
        chat = null
      }
    }

    if (!chat) {
      // Always use message text as title, never file name
      let title = "New chat"
      if (message && message.trim()) {
        title = message.trim().substring(0, 45)
        if (message.trim().length > 45) title += "..."
      }
      chat = await Chat.create({
        sessionId: sessionId,
        title: title,
        messages: []
      })
    }

    // Save user message to DB
    const savedContent = message || "[File: " + (file ? file.originalname : "unknown") + "]"
    chat.messages.push({ role: "user", content: savedContent })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    // Build chat history
    const history = chat.messages.slice(0, -1).map(function(m) {
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }
    })

    // Build current user message
    const isImage = file && file.mimetype && file.mimetype.startsWith("image/")
    let userContent

    if (isImage) {
      // Send image as base64 for vision model
      const base64 = file.buffer.toString("base64")
      const dataUrl = "data:" + file.mimetype + ";base64," + base64
      userContent = [
        {
          type: "text",
          text: message || "Please analyze this image."
        },
        {
          type: "image_url",
          image_url: { url: dataUrl }
        }
      ]
    } else if (file) {
      // Non-image: read as text
      try {
        const fileText = file.buffer.toString("utf-8")
        userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + fileText
      } catch (e) {
        userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]"
      }
    } else {
      userContent = message
    }

    // Choose model:
    // Text: llama-3.3-70b-versatile (free, very capable)
    // Image: llama-4-scout-17b-16e-instruct (free vision model on Groq)
    const model = isImage
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "llama-3.3-70b-versatile"

    console.log("Using model:", model)

    const aiMessages = [
      {
        role: "system",
        content: "You are Datta AI, a helpful and accurate assistant. If an image or file is provided, analyze it carefully. Keep answers clear and complete."
      },
      ...history,
      {
        role: "user",
        content: userContent
      }
    ]

    // Stream response from Groq
    const stream = await groq.chat.completions.create({
      model: model,
      messages: aiMessages,
      max_tokens: 1024,
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

    // Save AI response
    chat.messages.push({ role: "assistant", content: full })
    await chat.save()

    res.write("CHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("=== ERROR ===")
    console.error(err.message)
    if (!res.headersSent) {
      res.status(500).send("Server error: " + err.message)
    }
  }

})

// GET ALL CHATS
app.get("/chats/:sessionId", async (req, res) => {
  try {
    const chats = await Chat.find({ sessionId: req.params.sessionId }).sort({ createdAt: -1 })
    res.json(chats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET CHAT MESSAGES
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
