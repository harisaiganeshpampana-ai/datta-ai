// ============================================
// AUTHENTICATION
// ============================================
function getToken() { return localStorage.getItem("datta_token") || ""; }
function getUser() { try { return JSON.parse(localStorage.getItem("datta_user") || "null"); } catch(e) { return null; } }

if (!getToken()) { window.location.href = "login.html"; }
window.dattaUser = getUser();

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentProject = null;
let currentChat = null;
let allChats = [];
let projects = [];
let projectPasswords = {};
let artifacts = [];

// ============================================
// LOAD/SAVE FUNCTIONS
// ============================================
function loadAllData() {
  projects = JSON.parse(localStorage.getItem('datta_projects') || '[]');
  projectPasswords = JSON.parse(localStorage.getItem('datta_project_passwords') || '{}');
  allChats = JSON.parse(localStorage.getItem('datta_standalone_chats') || '[]');
  artifacts = JSON.parse(localStorage.getItem('datta_artifacts') || '[]');
}

function saveProjects() { localStorage.setItem('datta_projects', JSON.stringify(projects)); }
function saveStandaloneChats() { localStorage.setItem('datta_standalone_chats', JSON.stringify(allChats)); }
function saveArtifacts() { localStorage.setItem('datta_artifacts', JSON.stringify(artifacts)); }

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function showToast(msg) {
  let t = document.getElementById("toastMsg");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastMsg";
    t.style.cssText = "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0f0e00;border:1px solid #00ff88;border-radius:50px;padding:8px 18px;color:#00ff88;z-index:9999;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2000);
}
window.showToast = showToast;

function scrollToBottom() {
  const chat = document.getElementById('chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}
window.scrollToBottom = scrollToBottom;

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("show"); }
window.toggleSidebar = toggleSidebar;

function showSection(section) {
  document.getElementById("section-chats").style.display = section === "chats" ? "block" : "none";
  document.getElementById("section-projects").style.display = section === "projects" ? "block" : "none";
  document.getElementById("section-artifacts").style.display = section === "artifacts" ? "block" : "none";
  document.querySelectorAll(".navItem").forEach((btn, i) => btn.classList.toggle("active", i === ["chats","projects","artifacts"].indexOf(section)));
  if (section === "chats") loadChatsList();
}
window.showSection = showSection;

function searchChats() {
  const query = document.getElementById("search").value.toLowerCase();
  document.querySelectorAll(".chatItem").forEach(item => {
    const title = item.querySelector(".chatTitle")?.textContent.toLowerCase() || "";
    item.style.display = title.includes(query) ? "flex" : "none";
  });
}
window.searchChats = searchChats;

function toggleProfileMenu() {
  const menu = document.getElementById("profileMenu");
  menu.style.display = menu.style.display === "none" ? "block" : "none";
}
window.toggleProfileMenu = toggleProfileMenu;

function logout() { localStorage.clear(); window.location.href = "login.html"; }
window.logout = logout;

// ============================================
// DISPLAY MESSAGES - USER RIGHT, AI LEFT
// ============================================
function displayUserMessage(text) {
  const chatBox = document.getElementById("chat");
  chatBox.innerHTML += `
    <div class="messageRow user">
      <div class="userBubble">${escapeHtml(text)}</div>
      <div class="avatar user">🧑</div>
    </div>
  `;
  scrollToBottom();
}

function displayAIMessage(content, isTyping = false) {
  const chatBox = document.getElementById("chat");
  if (isTyping) {
    chatBox.innerHTML += `
      <div class="messageRow ai" id="typingIndicator">
        <div class="avatar ai">🤖</div>
        <div class="aiBubble typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  } else {
    chatBox.innerHTML += `
      <div class="messageRow ai">
        <div class="avatar ai">🤖</div>
        <div class="aiBubble">${marked.parse(content)}</div>
      </div>
    `;
  }
  scrollToBottom();
}

function removeTypingIndicator() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.remove();
}

// ============================================
// STANDALONE CHAT FUNCTIONS
// ============================================
function createStandaloneChat() {
  if (currentProject) {
    showToast("Project lo new chat option ledu. Project lo type cheste automatic ga chat create avutundi.");
    return;
  }
  
  const newChat = { id: 'chat_' + Date.now(), title: 'New Chat', messages: [], created: Date.now() };
  allChats.unshift(newChat);
  saveStandaloneChats();
  currentChat = newChat;
  
  document.getElementById("chat").innerHTML = "";
  document.getElementById("welcomeScreen").style.display = "flex";
  loadChatsList();
  showToast("✨ New chat created");
}
window.createStandaloneChat = createStandaloneChat;

function openChat(chat) {
  currentChat = chat;
  const chatBox = document.getElementById("chat");
  chatBox.innerHTML = "";
  document.getElementById("welcomeScreen").style.display = "none";
  
  if (chat.messages && chat.messages.length > 0) {
    chat.messages.forEach(msg => {
      if (msg.role === 'user') {
        chatBox.innerHTML += `<div class="messageRow user"><div class="userBubble">${escapeHtml(msg.content)}</div><div class="avatar user">🧑</div></div>`;
      } else {
        chatBox.innerHTML += `<div class="messageRow ai"><div class="avatar ai">🤖</div><div class="aiBubble">${marked.parse(msg.content)}</div></div>`;
      }
    });
  }
  scrollToBottom();
}

function loadChatsList() {
  const historyContainer = document.getElementById("history");
  if (!historyContainer) return;
  historyContainer.innerHTML = '';
  
  if (currentProject) {
    const project = projects.find(p => p.id === currentProject);
    if (!project) return;
    
    if (!project.chats || project.chats.length === 0) {
      historyContainer.innerHTML = `<div class="emptySection">💬 No chats in this project<br><span style="font-size:12px;">Start typing to create a chat</span></div>`;
      return;
    }
    
    project.chats.forEach(chat => {
      const div = document.createElement("div");
      div.className = "chatItem";
      div.innerHTML = `<div class="chatTitle">${escapeHtml(chat.title || "New Chat")}</div><button class="deleteBtn" onclick="event.stopPropagation();deleteChat('${chat.id}')">🗑️</button>`;
      div.onclick = () => openChat(chat);
      historyContainer.appendChild(div);
    });
  } else {
    if (allChats.length === 0) {
      historyContainer.innerHTML = `<div class="emptySection">💬 No chats yet<br><button onclick="createStandaloneChat()" style="margin-top:10px;padding:8px 16px;background:#ffd70020;border:1px solid #ffd70040;border-radius:10px;color:#ffd700;cursor:pointer;">+ New Chat</button></div>`;
      return;
    }
    
    allChats.forEach(chat => {
      const div = document.createElement("div");
      div.className = "chatItem";
      div.innerHTML = `<div class="chatTitle">${escapeHtml(chat.title || "New Chat")}</div><button class="deleteBtn" onclick="event.stopPropagation();deleteChat('${chat.id}')">🗑️</button>`;
      div.onclick = () => openChat(chat);
      historyContainer.appendChild(div);
    });
  }
}

function deleteChat(chatId) {
  if (!confirm("Delete this chat?")) return;
  
  if (currentProject) {
    const project = projects.find(p => p.id === currentProject);
    if (project) {
      project.chats = project.chats.filter(c => c.id !== chatId);
      saveProjects();
      if (currentChat?.id === chatId) { currentChat = null; document.getElementById("chat").innerHTML = ""; document.getElementById("welcomeScreen").style.display = "flex"; }
      loadChatsList();
      showToast("🗑️ Chat deleted");
    }
  } else {
    allChats = allChats.filter(c => c.id !== chatId);
    saveStandaloneChats();
    if (currentChat?.id === chatId) { currentChat = null; document.getElementById("chat").innerHTML = ""; document.getElementById("welcomeScreen").style.display = "flex"; }
    loadChatsList();
    showToast("🗑️ Chat deleted");
  }
}
window.deleteChat = deleteChat;

// ============================================
// SEND MESSAGE - SAVES TO PROJECT
// ============================================
async function sendMessage() {
  const input = document.getElementById("message");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  
  // If in project and no chat exists, create one automatically
  if (currentProject && !currentChat) {
    const project = projects.find(p => p.id === currentProject);
    if (project) {
      const newChat = { id: 'chat_' + Date.now(), title: text.substring(0, 40), messages: [], created: Date.now() };
      project.chats = project.chats || [];
      project.chats.unshift(newChat);
      saveProjects();
      currentChat = newChat;
      loadChatsList();
    }
  }
  
  // Save user message
  if (currentChat) {
    currentChat.messages = currentChat.messages || [];
    currentChat.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    if (currentChat.title === 'New Chat') currentChat.title = text.substring(0, 40);
    
    if (currentProject) {
      const project = projects.find(p => p.id === currentProject);
      if (project) {
        const chatIndex = project.chats.findIndex(c => c.id === currentChat.id);
        if (chatIndex !== -1) project.chats[chatIndex] = currentChat;
        saveProjects();
      }
    } else {
      const chatIndex = allChats.findIndex(c => c.id === currentChat.id);
      if (chatIndex !== -1) allChats[chatIndex] = currentChat;
      saveStandaloneChats();
    }
    loadChatsList();
  }
  
  // Display user message (RIGHT SIDE)
  displayUserMessage(text);
  
  // Hide welcome screen
  document.getElementById("welcomeScreen").style.display = "none";
  
  // Show typing indicator (LEFT SIDE)
  displayAIMessage("", true);
  
  // Send to backend
  const formData = new FormData();
  formData.append('message', text);
  formData.append('token', getToken());
  formData.append('language', localStorage.getItem('datta_language') || 'English');
  
  try {
    const response = await fetch('https://datta-ai-server.onrender.com/chat', { method: 'POST', body: formData });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    
    removeTypingIndicator();
    
    const aiDiv = document.createElement("div");
    aiDiv.className = "messageRow ai";
    aiDiv.innerHTML = `<div class="avatar ai">🤖</div><div class="aiBubble"><span class="stream"></span></div>`;
    document.getElementById("chat").appendChild(aiDiv);
    const streamSpan = aiDiv.querySelector(".stream");
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullText += chunk;
      if (streamSpan) {
        streamSpan.innerHTML = marked.parse(fullText) + '<span class="cursor">▌</span>';
        scrollToBottom();
      }
    }
    
    if (streamSpan) streamSpan.innerHTML = marked.parse(fullText);
    
    // Save AI response
    if (currentChat) {
      currentChat.messages.push({ role: 'assistant', content: fullText, timestamp: Date.now() });
      
      if (currentProject) {
        const project = projects.find(p => p.id === currentProject);
        if (project) {
          const chatIndex = project.chats.findIndex(c => c.id === currentChat.id);
          if (chatIndex !== -1) project.chats[chatIndex] = currentChat;
          saveProjects();
        }
      } else {
        const chatIndex = allChats.findIndex(c => c.id === currentChat.id);
        if (chatIndex !== -1) allChats[chatIndex] = currentChat;
        saveStandaloneChats();
      }
      loadChatsList();
    }
    
  } catch (error) {
    removeTypingIndicator();
    displayAIMessage("⚠️ Connection error. Please try again.");
  }
}
window.sendMessage = sendMessage;

function fillPrompt(text) { document.getElementById("message").value = text; sendMessage(); }
window.fillPrompt = fillPrompt;

// ============================================
// VOICE INPUT
// ============================================
function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast("Speech recognition not supported"); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.onresult = (e) => { document.getElementById("message").value = e.results[0][0].transcript; sendMessage(); };
  recognition.start();
}
window.startVoiceInput = startVoiceInput;

// ============================================
// PROJECTS FUNCTIONS - NO CLOSE BUTTON
// ============================================
function showCreateProjectModal() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Create Project</div>
      <div class="modal-subtitle">Give your project a name to organize your chats</div>
      <input type="text" id="projectNameInput" class="modal-input" placeholder="Project name" autocomplete="off">
      <div class="modal-suggestions">
        <div class="suggestion-chip" onclick="document.getElementById('projectNameInput').value='Party planning'">🎉 Party planning</div>
        <div class="suggestion-chip" onclick="document.getElementById('projectNameInput').value='Homework'">📚 Homework</div>
        <div class="suggestion-chip" onclick="document.getElementById('projectNameInput').value='Investing'">📈 Investing</div>
        <div class="suggestion-chip" onclick="document.getElementById('projectNameInput').value='Writing'">✍️ Writing</div>
      </div>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="modal-btn modal-btn-create" onclick="createProjectFromModal()">Create Project</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => { const input = document.getElementById('projectNameInput'); if (input) input.focus(); }, 100);
}
window.showCreateProjectModal = showCreateProjectModal;

function closeModal() { const modal = document.querySelector('.modal-overlay'); if (modal) modal.remove(); }
window.closeModal = closeModal;

function createProjectFromModal() {
  const input = document.getElementById('projectNameInput');
  const name = input?.value.trim();
  if (!name) { showToast("Please enter a project name"); return; }
  createProjectWithName(name);
  closeModal();
}
window.createProjectFromModal = createProjectFromModal;

function createProjectWithName(name) {
  const lockProject = confirm(`Lock "${name}" with a password?`);
  let password = null;
  if (lockProject) { password = prompt("Set a password for this project:"); if (!password) return; }
  
  const newProject = { id: 'project_' + Date.now(), name: name, chats: [], locked: lockProject, created: Date.now() };
  projects.push(newProject);
  saveProjects();
  if (password) { projectPasswords[newProject.id] = password; localStorage.setItem('datta_project_passwords', JSON.stringify(projectPasswords)); }
  
  loadProjects();
  showToast(`📁 Project "${name}" created`);
  openProject(newProject.id);
}

function loadProjects() {
  const container = document.getElementById("section-projects");
  if (!container) return;
  
  if (projects.length === 0) {
    container.innerHTML = `<div class="emptySection">📁 No projects yet<button onclick="showCreateProjectModal()" style="margin-top:12px;padding:10px 20px;background:#ffd70020;border:1px solid #ffd70040;border-radius:10px;color:#ffd700;cursor:pointer;">+ Create Project</button></div>`;
    return;
  }
  
  container.innerHTML = `<button onclick="showCreateProjectModal()" style="width:100%;padding:10px;margin-bottom:12px;background:#ffd70010;border:1px solid #ffd70020;border-radius:10px;color:#ffd700;cursor:pointer;">+ New Project</button>` +
    projects.map(project => `
    <div class="projectItem ${currentProject === project.id ? 'projectActive' : ''}" onclick="openProject('${project.id}')">
      <div style="display:flex;align-items:center;gap:10px;">
        <span>${project.locked ? '🔒' : '📁'}</span>
        <div style="flex:1;"><div style="font-weight:600;">${escapeHtml(project.name)}</div><div style="font-size:10px;color:#665500;">${project.chats?.length || 0} chats</div></div>
        <div style="display:flex;gap:5px;">
          ${project.locked ? `<button onclick="event.stopPropagation();unlockProject('${project.id}')" style="background:none;border:none;color:#ffd700;cursor:pointer;">🔓</button>` : `<button onclick="event.stopPropagation();lockProject('${project.id}')" style="background:none;border:none;color:#665500;cursor:pointer;">🔒</button>`}
          <button onclick="event.stopPropagation();renameProject('${project.id}')" style="background:none;border:none;color:#665500;cursor:pointer;">✏️</button>
          <button onclick="event.stopPropagation();deleteProject('${project.id}')" style="background:none;border:none;color:#ff6666;cursor:pointer;">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}
window.loadProjects = loadProjects;

function openProject(projectId) {
  loadAllData();
  const project = projects.find(p => p.id === projectId);
  if (!project) { showToast("Project not found"); return; }
  
  if (project.locked) {
    const password = prompt(`Project "${project.name}" is locked. Enter password:`);
    if (!password || projectPasswords[projectId] !== password) { showToast("❌ Incorrect password!"); return; }
  }
  
  currentProject = projectId;
  localStorage.setItem('datta_current_project', projectId);
  currentChat = null;
  
  // Hide New Chat button when in project
  const newChatBtn = document.getElementById("newChatBtn");
  if (newChatBtn) newChatBtn.style.display = "none";
  
  document.getElementById("chat").innerHTML = "";
  document.getElementById("welcomeScreen").style.display = "flex";
  
  const welcomeTitle = document.querySelector("#welcomeScreen .welcomeTitle");
  if (welcomeTitle) welcomeTitle.innerHTML = `📁 ${escapeHtml(project.name)}`;
  const welcomeSub = document.querySelector("#welcomeScreen .welcomeSub");
  if (welcomeSub) welcomeSub.innerHTML = "Start typing to create a new chat";
  
  loadChatsList();
  loadProjects();
  showToast(`📁 Opened project: ${project.name}`);
}
window.openProject = openProject;

// Function to exit project (only called when switching sections, not a close button)
function exitProject() {
  if (currentProject) {
    currentProject = null;
    localStorage.removeItem('datta_current_project');
    
    // Show New Chat button again
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) newChatBtn.style.display = "flex";
    
    document.getElementById("chat").innerHTML = "";
    document.getElementById("welcomeScreen").style.display = "flex";
    
    const welcomeTitle = document.querySelector("#welcomeScreen .welcomeTitle");
    if (welcomeTitle) welcomeTitle.innerHTML = "How can I help you today?";
    const welcomeSub = document.querySelector("#welcomeScreen .welcomeSub");
    if (welcomeSub) welcomeSub.innerHTML = "Think Less. Do More.";
    
    loadChatsList();
    loadProjects();
    showToast("📁 Exited project");
  }
}

function lockProject(projectId) {
  const password = prompt("Set password to lock this project:");
  if (!password) return;
  const project = projects.find(p => p.id === projectId);
  if (project) {
    project.locked = true;
    projectPasswords[projectId] = password;
    saveProjects();
    localStorage.setItem('datta_project_passwords', JSON.stringify(projectPasswords));
    loadProjects();
    if (currentProject === projectId) exitProject();
    showToast(`🔒 Project "${project.name}" locked`);
  }
}
window.lockProject = lockProject;

function unlockProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const password = prompt(`Enter password to unlock "${project.name}":`);
  if (projectPasswords[projectId] !== password) { showToast("❌ Incorrect password!"); return; }
  project.locked = false;
  saveProjects();
  loadProjects();
  showToast(`🔓 Project "${project.name}" unlocked`);
}
window.unlockProject = unlockProject;

function renameProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const newName = prompt("New project name:", project.name);
  if (!newName) return;
  project.name = newName.trim();
  saveProjects();
  loadProjects();
  if (currentProject === projectId) {
    const welcomeTitle = document.querySelector("#welcomeScreen .welcomeTitle");
    if (welcomeTitle) welcomeTitle.innerHTML = `📁 ${escapeHtml(project.name)}`;
  }
  showToast(`✏️ Renamed to "${project.name}"`);
}
window.renameProject = renameProject;

function deleteProject(projectId) {
  if (!confirm("Delete this project? All chats inside will be lost!")) return;
  projects = projects.filter(p => p.id !== projectId);
  saveProjects();
  delete projectPasswords[projectId];
  localStorage.setItem('datta_project_passwords', JSON.stringify(projectPasswords));
  if (currentProject === projectId) exitProject();
  loadProjects();
  showToast("🗑️ Project deleted");
}
window.deleteProject = deleteProject;

// ============================================
// ARTIFACTS FUNCTIONS
// ============================================
function loadArtifacts() {
  artifacts = JSON.parse(localStorage.getItem('datta_artifacts') || '[]');
  const container = document.getElementById("section-artifacts");
  if (!container) return;
  if (artifacts.length === 0) {
    container.innerHTML = `<div class="emptySection">📦 No artifacts yet<br><button onclick="createNewArtifact()" style="margin-top:10px;padding:8px 16px;background:#ffd70020;border:1px solid #ffd70040;border-radius:10px;color:#ffd700;cursor:pointer;">+ Create Artifact</button></div>`;
    return;
  }
  container.innerHTML = `<button onclick="createNewArtifact()" style="width:100%;padding:10px;margin-bottom:12px;background:#ffd70010;border:1px solid #ffd70020;border-radius:10px;color:#ffd700;cursor:pointer;">+ New Artifact</button>` +
    artifacts.map(artifact => `<div class="projectItem" style="display:flex;align-items:center;gap:10px;"><span>${artifact.type === 'image' ? '🎨' : artifact.type === 'code' ? '💻' : '📄'}</span><div style="flex:1;"><div style="font-weight:600;">${escapeHtml(artifact.name)}</div><div style="font-size:10px;color:#665500;">${new Date(artifact.created).toLocaleDateString()}</div></div><button onclick="deleteArtifact('${artifact.id}')" style="background:none;border:none;color:#ff6666;cursor:pointer;">🗑️</button></div>`).join('');
}
window.loadArtifacts = loadArtifacts;

function createNewArtifact() {
  const type = prompt("Type (image/code/document):", "image");
  if (!type) return;
  const name = prompt("Artifact name:", "My Artifact");
  if (!name) return;
  artifacts.push({ id: 'artifact_' + Date.now(), name: name.trim(), type: type.toLowerCase(), created: Date.now() });
  saveArtifacts();
  loadArtifacts();
  showToast(`✨ Artifact "${name}" created`);
}
window.createNewArtifact = createNewArtifact;

function deleteArtifact(id) {
  if (!confirm("Delete this artifact?")) return;
  artifacts = artifacts.filter(a => a.id !== id);
  saveArtifacts();
  loadArtifacts();
  showToast("🗑️ Artifact deleted");
}
window.deleteArtifact = deleteArtifact;

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('load', () => {
  loadAllData();
  
  // Hide splash
  setTimeout(() => { const splash = document.getElementById("splash"); if (splash) splash.style.display = "none"; }, 2000);
  
  // Restore current project
  const savedProject = localStorage.getItem('datta_current_project');
  if (savedProject) {
    const project = projects.find(p => p.id === savedProject);
    if (project && !project.locked) openProject(savedProject);
    else loadChatsList();
  } else loadChatsList();
  
  // Update profile
  const user = getUser();
  if (user) {
    document.getElementById("profileName").textContent = user.username || user.email || "User";
    document.getElementById("profileAvatar").textContent = (user.username || "U")[0].toUpperCase();
  }
  
  // Enter key
  document.getElementById("message").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  
  loadProjects();
  loadArtifacts();
  showToast("✨ Datta AI Ready!");
});
