import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Datta AI server running");
});

app.post("/chat", async (req, res) => {

  const message = req.body.message;

  try {

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "sk-bc9d7ff1b9e64b19a444481b3ba5171c"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are Datta AI, a helpful assistant." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();

    const reply = data.choices[0].message.content;

    res.json({ reply });

  } catch (err) {

    res.json({ reply: "AI server error" });

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
