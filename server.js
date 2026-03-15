const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Memory = require("./models/Memory");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ---------------------------
MongoDB Connection
--------------------------- */

mongoose.connect(process.env.MONGO_URI)
.then(()=>{
    console.log("MongoDB connected");
})
.catch((err)=>{
    console.log("MongoDB error:", err);
});

/* ---------------------------
Basic AI reply
--------------------------- */

function aiReply(message){

    message = message.toLowerCase();

    if(message.includes("hello")) return "Hello! How can I help you?";
    if(message.includes("who are you")) return "I am Datta AI.";
    if(message.includes("what is ai")) return "AI means Artificial Intelligence.";

    return "I am still learning. Tell me more.";
}

/* ---------------------------
Chat route
--------------------------- */

app.post("/chat", async (req,res)=>{

    const userMessage = req.body.message;

    const reply = aiReply(userMessage);

    const memory = new Memory({
        userId: "user1",
        message: userMessage,
        response: reply
    });

    await memory.save();

    res.json({
        reply: reply
    });

});

/* ---------------------------
Memory route
--------------------------- */

app.get("/memory", async (req,res)=>{

    const history = await Memory.find().sort({timestamp:-1}).limit(20);

    res.json(history);

});

/* ---------------------------
Server start
--------------------------- */

app.get("/", (req,res)=>{
    res.send("Datta AI server running");
});

app.listen(PORT, ()=>{
    console.log("Datta AI server running");
});
