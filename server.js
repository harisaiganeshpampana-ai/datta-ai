const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});

app.post("/chat", async (req,res)=>{

const message = req.body.message;

try{

const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
"HTTP-Referer":"https://datta-ai.vercel.app",
"X-Title":"Datta AI"
},
body:JSON.stringify({
model:"model: "mistralai/mistral-7b-instruct",
messages:[
{role:"user",content:message}
]
})
});

const data = await response.json();

if (!data.choices) {
  console.log("AI ERROR RESPONSE:", data);
  return res.json({
    reply: "AI provider returned an error"
  });
}

res.json({
  reply: data.choices[0].message.content
});

}catch(err){

console.log(err);

res.json({
reply:"AI server error"
});

}

});

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("Server running");
});
