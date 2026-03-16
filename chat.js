// Initialization
const chatBox = document.getElementById("chat");
const messageInput = document.getElementById("message");

// Simple Send Function
async function send() {
    const text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = "";
    
    // Hide welcome screen
    const welcome = document.getElementById("welcomeScreen");
    if(welcome) welcome.style.display = "none";

    // Append User Message
    chatBox.innerHTML += `
        <div class="messageRow userRow">
            <div class="userBubble">${text}</div>
            <div class="avatar">🧑</div>
        </div>`;

    // Append AI placeholder
    let aiDiv = document.createElement("div");
    aiDiv.className = "messageRow";
    aiDiv.innerHTML = `<div class="avatar">🤖</div><div class="aiBubble">...</div>`;
    chatBox.appendChild(aiDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, sessionId: localStorage.getItem("sessionId") || Date.now() })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let streamText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamText += decoder.decode(value);
            // Only update the bubble, not the whole structure
            aiDiv.innerHTML = `
                <div class="avatar">🤖</div>
                <div class="aiContent">
                    <div class="aiBubble">${marked.parse(streamText)}</div>
                    <div class="aiActions">
                        <button class="actionBtn" onclick="copyText(this)">Copy</button>
                        <button class="actionBtn" onclick="speakText(this)">Listen</button>
                    </div>
                </div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    } catch (err) {
        console.error(err);
    }
}

// Ensure Enter key works
messageInput.addEventListener("keypress", (e) => {
    if (e.key === 'Enter') send();
});
