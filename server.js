const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

// store conversation
let conversation = []

app.get("/", (req, res) => {
  res.send("Datta AI server running")
})

app.post("/chat", async (req, res) => {

  try {

    const userMessage = req.body.message

    conversation.push({
      role: "user",
      content: userMessage
    })

    // keep last 12 messages only
    if (conversation.length > 12) {
      conversation.shift()
    }

    const today = new Date().toDateString()

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You are Datta AI. Give clear simple answers. Do NOT use markdown symbols like ** ### or LaTeX. Use normal text only. Today's date is " + today
          },
          ...conversation
        ]
      })
    })

    const data = await response.json()

    const reply =
      data?.choices?.[0]?.message?.content ||
      "AI did not return a response"

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
