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
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();

    console.log("AI RESPONSE:", data);

    if (!data.choices || !data.choices[0]) {
      return res.json({
        reply: "AI provider returned an error"
      });
    }

    res.json({
      reply: data.choices[0].message.content
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    res.json({
      reply: "AI server error"
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
