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

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

app.post("/chat", async (req,res)=>{

try{

const message=req.body.message;

const response=await fetch(
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

const data=await response.json();

res.json({
reply:data.choices[0].message.content
});

}catch(error){

console.log(error);

res.json({
reply:"AI error occurred"
});

}

});

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
