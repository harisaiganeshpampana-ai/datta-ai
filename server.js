import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import mongoose from "mongoose"

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

app.post("/chat", async (req, res) => {

  try {

    const { message, sessionId, chatId } = req.body

    if (!message) {
      return res.status(400).json({ error: "No message" })
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

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chat.messages,
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
