import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

let chatHistory = [
  {
    role: "system",
    content:
      "You are Datta AI. Answer clearly and briefly. Maximum 2-3 sentences unless the user asks for details."
  }
];

app.get("/", (req, res) => {
  res.send("Datta AI server running");
});

app.post("/chat", async (req, res) => {

  try {

    const message = req.body.message;

    // Add user message to history
    chatHistory.push({
      role: "user",
      content: message
    });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://datta-ai.vercel.app",
        "X-Title": "Datta AI"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: chatHistory,
        max_tokens: 120
      })
    });

    const data = await response.json();

    const reply = data.choices[0].message.content;

    // Add AI reply to history
    chatHistory.push({
      role: "assistant",
      content: reply
    });

    res.json({
      reply: reply
    });

  } catch (error) {

    console.log(error);

    res.json({
      reply: "AI server error"
    });

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running");
});
