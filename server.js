import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import { GoogleGenerativeAI } from "@google/generative-ai"

dotenv.config()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// GEMINI AI (free)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

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
      const title = message
        ? message.substring(0, 40)
        : (file ? file.originalname.substring(0, 40) : "New chat")
      chat = await Chat.create({
        sessionId: sessionId,
        title: title,
        messages: []
      })
    }

    // Build chat history for Gemini format
    const history = chat.messages.map(function(m) {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }
    })

    // Save user message to DB
    const savedContent = message || "[File: " + (file ? file.originalname : "unknown") + "]"
    chat.messages.push({ role: "user", content: savedContent })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    // Choose model
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are Datta AI, a helpful and accurate assistant. If an image or file is provided, analyze it carefully. Keep answers clear and complete."
    })

    // Start chat session with history
    const chatSession = model.startChat({ history: history })

    // Build the current user message parts
    const parts = []

    if (file) {
      const mimeType = file.mimetype || "application/octet-stream"

      if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
        // Images and PDFs sent as inline data
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: file.buffer.toString("base64")
          }
        })
      } else {
        // Text/code/csv files — read as plain text
        try {
          const fileText = file.buffer.toString("utf-8")
          parts.push({ text: "[File: " + file.originalname + "]\n\n" + fileText })
        } catch (e) {
          parts.push({ text: "[Binary file attached: " + file.originalname + "]" })
        }
      }
    }

    if (message) {
      parts.push({ text: message })
    } else if (!file) {
      parts.push({ text: "Please analyze this." })
    }

    // Stream response from Gemini
    const result = await chatSession.sendMessageStream(parts)

    let full = ""

    for await (const chunk of result.stream) {
      const token = chunk.text()
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
