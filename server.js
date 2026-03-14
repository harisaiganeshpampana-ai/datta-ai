const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

// Test route
app.get("/", (req, res) => {
  res.send("Datta AI server running")
})

// Chat endpoint
app.post("/chat", async (req, res) => {

  try {

    const userMessage = req.body.message

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
            content: "You are Datta AI. Respond clearly using simple paragraphs and bullet points. Do not use markdown symbols like **, ###, or LaTeX formulas."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    })

    const data = await response.json()

    const reply =
      data?.choices?.[0]?.message?.content ||
      "AI did not return a response"

    res.json({ reply })

  } catch (error) {

    console.log(error)

    res.json({
      reply: "Server error. Try again."
    })

  }

})

const PORT = process.env.PORT || 10000

app.listen(PORT, () => {
  console.log("Datta AI server running")
})
