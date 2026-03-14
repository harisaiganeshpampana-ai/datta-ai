const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

// conversation memory
let conversation = []

app.get("/", (req, res) => {
  res.send("Datta AI server running")
})

app.post("/chat", async (req, res) => {

  try {

    const userMessage = req.body.message

    // save user message
    conversation.push({
      role: "user",
      content: userMessage
    })

    // keep memory short (last 10 messages)
    if (conversation.length > 10) {
      conversation.shift()
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You are Datta AI. Give clear and helpful answers."
          },
          ...conversation
        ]
      })
    })

    const data = await response.json()

    const reply =
      data?.choices?.[0]?.message?.content ||
      "AI did not return a response"

    // save AI reply
    conversation.push({
      role: "assistant",
      content: reply
    })

    res.json({ reply })

  } catch (error) {

    console.log(error)

    res.json({
      reply: "Server error"
    })

  }

})

const PORT = process.env.PORT || 10000

app.listen(PORT, () => {
  console.log("Datta AI server running")
})
