app.post("/chat", (req,res)=>{

const msg = req.body.message.toLowerCase().trim();

let reply="";

if(msg === "hi" || msg === "hello"){
reply="Hello! How can I help you?";
}

else if(msg === "who are you"){
reply="I am Datta AI, your assistant.";
}

else if(msg === "what are you doing"){
reply="I am talking with you right now.";
}

else{
reply="You said: " + msg;
}

res.json({reply:reply});

});
