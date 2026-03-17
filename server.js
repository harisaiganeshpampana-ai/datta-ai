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

/* OPENAI */

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
})

/* DATABASE */

mongoose.connect(process.env.MONGO_URI)

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

/* CHAT STREAM */

app.post("/chat", upload.single("image"), async (req, res) => {

  try {

const message = req.body?.message || ""
const sessionId = req.body?.sessionId
const chatId = req.body?.chatId
const file = req.file || null
console.log("MESSAGE:", message)
console.log("FILE:", file)
    
  if (!message && !file) {
  return res.status(400).json({ error: "No message or image" })
}
    let chat

    if (chatId) {
      chat = await Chat.findById(chatId)
    }

    if (!chat) {
   chat = await Chat.create({
      sessionId,
      title: req.body.title || req.body.message.substring(0,40),
      messages: []
   })
}

    chat.messages.push({
      role: "user",
      content: message
    })

    await chat.save()

res.setHeader("x-chat-id", chat._id.toString())

   const stream = await openai.chat.completions.create({
  model: "openai/gpt-4o-mini",
  temperature: 0.3,

  messages: [
    {
      role: "system",
      content: "Give accurate and factual answers. Keep them short but complete. Do not guess. If unsure, say you don't know."
    },
    ...chat.messages
  ],

  stream: true
})
    res.setHeader("Content-Type", "text/plain")

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

    console.error(err)
    res.status(500).send("Server error")

  }

})

/* GET CHAT HISTORY */

app.get("/chats/:sessionId", async (req, res) => {

  const chats = await Chat.find({
    sessionId: req.params.sessionId
  }).sort({ createdAt: -1 })

  res.json(chats)

})

/* OPEN CHAT */

app.get("/chat/:id", async (req, res) => {

  const chat = await Chat.findById(req.params.id)

  if (!chat) return res.json([])

  res.json(chat.messages)

})

/* DELETE CHAT */

app.delete("/chat/:id", async (req, res) => {

  await Chat.findByIdAndDelete(req.params.id)

  res.json({ success: true })

})

/* RENAME CHAT */

app.post("/chat/:id/rename", async (req, res) => {

  const { title } = req.body

  await Chat.findByIdAndUpdate(req.params.id, {
    title
  })

  res.json({ success: true })

})

/* START SERVER */

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})
