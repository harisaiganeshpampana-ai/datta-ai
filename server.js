import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Datta AI server running");
});

app.post("/chat", async (req, res) => {

  try {

    const message = req.body.message;

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
        messages: [
          {
            role: "system",
            content:
              "You are Datta AI. Answer in short and clear sentences. Maximum 2-3 sentences unless the user asks for details. Do not use markdown symbols like *, #, or bullet points. Reply in plain text."
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 120
      })
    });

    const data = await response.json();

    res.json({
      reply: data.choices[0].message.content
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
