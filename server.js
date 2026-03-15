import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* MongoDB connection */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

/* Chat endpoint */
app.post("/chat", async (req, res) => {
  try {

    const userMessage = req.body.message;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "user", content: userMessage }
        ]
      })
    });

    const data = await response.json();

    const aiMessage = data.choices[0].message.content;

    res.json({ reply: aiMessage });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "AI error occurred" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
