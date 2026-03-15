const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

/* ------------------ MongoDB ------------------ */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

const MemorySchema = new mongoose.Schema({
  question: String,
  answer: String
});

const Memory = mongoose.model("Memory", MemorySchema);

/* ------------------ AI Route ------------------ */

app.post("/chat", async (req, res) => {

  const userMessage = req.body.message;

  try {

    // Check memory first
    const memory = await Memory.findOne({ question: userMessage });

    if(memory){
      return res.json({ reply: memory.answer });
    }

    // Ask DeepSeek AI
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are Datta AI, a helpful intelligent assistant."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const aiReply = response.data.choices[0].message.content;

    // Save to memory
    await Memory.create({
      question: userMessage,
      answer: aiReply
    });

    res.json({ reply: aiReply });

  } catch (error) {

    console.log(error.response?.data || error.message);

    res.json({
      reply: "AI error occurred"
    });

  }

});

/* ------------------ Test Route ------------------ */

app.get("/", (req,res)=>{
  res.send("Datta AI server running");
});

/* ------------------ Server ------------------ */

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{
  console.log("Server running on port", PORT);
});
