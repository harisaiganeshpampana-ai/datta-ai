const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Datta AI server running");
});

app.post("/chat", (req, res) => {

  let message = req.body.message || "";
  message = message.toLowerCase().trim();

  let reply = "I don't understand yet. Ask something else.";

  // greeting
  if (message === "hi" || message === "hello") {
    reply = "Hello! How can I help you?";
  }

  // identity
  else if (message === "who are you") {
    reply = "I am Datta AI, your assistant.";
  }

  // activity
  else if (message === "what are you doing") {
    reply = "I am talking with you right now.";
  }

  // machine learning question
  else if (message === "what is machine learning") {
    reply =
      "Machine learning is a branch of artificial intelligence where computers learn patterns from data instead of being explicitly programmed.";
  }

  // power question
  else if (message === "what is power") {
    reply =
      "In physics, power is the rate at which work is done or energy is transferred.";
  }

  // fallback
  else {
    reply = "You said: " + message;
  }

  res.json({ reply: reply });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
