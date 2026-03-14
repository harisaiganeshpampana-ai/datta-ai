const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

// check server
app.get("/", (req, res) => {
  res.send("Datta AI server running")
})

// chat endpoint
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
          { role: "user", content: userMessage }
        ]
      })
    })

    const data = await response.json()

    const reply = data.choices[0].message.content

    res.json({ reply: reply || "AI did not return a response" })

  } catch (error) {

    console.log(error)

    res.json({ reply: "Server error" })

  }
})

const PORT = process.env.PORT || 10000

app.listen(PORT, () => {
  console.log("Datta AI server running")
})
