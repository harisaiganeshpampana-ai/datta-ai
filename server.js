const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Datta AI server running");
});

app.post("/chat", (req, res) => {

  let message = req.body.message;

  if(!message){
    return res.json({reply:"No message received"});
  }

  message = message.toLowerCase().trim();

  let reply = "I don't understand yet.";

  if(message === "hi" || message === "hello"){
    reply = "Hello! How can I help you?";
  }

  else if(message === "who are you"){
    reply = "I am Datta AI, your assistant.";
  }

  else if(message === "what are you doing"){
    reply = "I am talking with you right now.";
  }

  else if(message === "what is machine learning"){
    reply = "Machine learning is a branch of AI where computers learn patterns from data.";
  }

  else if(message === "what is power"){
    reply = "Power is the rate at which work is done.";
  }

  else{
    reply = "You said: " + message;
  }

  res.json({reply: reply});

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
