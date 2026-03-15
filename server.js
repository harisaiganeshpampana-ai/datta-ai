import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fetch from "node-fetch";
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

/* Health check */

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});

/* Chat endpoint */

app.post("/chat", async (req,res)=>{

try{

const message = req.body.message;

const response = await fetch(
"https://openrouter.ai/api/v1/chat/completions",
{
method:"POST",
headers:{
"Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"deepseek/deepseek-chat",
messages:[
{role:"user",content:message}
]
})
}
);

const data = await response.json();

const reply =
data?.choices?.[0]?.message?.content ||
"AI could not generate a response.";

res.json({ reply });

}catch(error){

console.log("AI error:",error);

res.json({
reply:"Server waking up or AI busy. Please try again."
});

}

});

/* Start server */

app.listen(PORT, ()=>{
console.log("Server running on port " + PORT);
});
