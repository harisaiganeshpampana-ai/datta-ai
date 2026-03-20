// ── DATTA AI PROJECTS SYSTEM ──────────────────────────────────────────────────

const PROJECTS_KEY = 'datta_projects_v2'

const SERVER = "https://datta-ai-server.onrender.com"

// ── SERVER SYNC ───────────────────────────────────────────────────────────────
async function syncProjectsFromServer() {
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('datta_token')
    if (!token) return
    const res = await fetch(SERVER + "/projects?token=" + token)
    if (!res.ok) return
    const serverProjects = await res.json()
    // Merge server projects with local
    const local = getProjects()
    const merged = serverProjects.map(sp => {
      const local_p = local.find(lp => lp.serverId === sp._id)
      return {
        id: local_p?.id || Date.now() + Math.random(),
        serverId: sp._id,
        name: sp.name,
        instructions: sp.instructions,
        color: sp.color,
        chats: sp.chats || [],
        pinnedChats: sp.pinnedChats || [],
        createdAt: sp.createdAt
      }
    })
    // Keep local-only projects too
    const serverIds = merged.map(p => p.serverId)
    const localOnly = local.filter(lp => !lp.serverId)
    saveProjects([...merged, ...localOnly])
    loadProjectsSection()
  } catch(e) { console.warn("Project sync failed:", e.message) }
}

async function saveProjectToServer(project) {
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('datta_token')
    if (!token) return null
    if (project.serverId) {
      // Update existing
      const res = await fetch(SERVER + "/projects/" + project.serverId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: project.name, instructions: project.instructions, color: project.color, chats: project.chats, pinnedChats: project.pinnedChats })
      })
      return await res.json()
    } else {
      // Create new
      const res = await fetch(SERVER + "/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: project.name, instructions: project.instructions, color: project.color })
      })
      const data = await res.json()
      if (data._id) {
        // Save serverId back to local
        const projects = getProjects()
        const p = projects.find(p => p.id == project.id)
        if (p) { p.serverId = data._id; saveProjects(projects) }
      }
      return data
    }
  } catch(e) { console.warn("Save to server failed:", e.message); return null }
}

async function deleteProjectFromServer(serverId) {
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('datta_token')
    if (!token || !serverId) return
    await fetch(SERVER + "/projects/" + serverId + "?token=" + token, { method: "DELETE" })
  } catch(e) {}
}

async function syncChatToServer(projectId, chatId, chatTitle) {
  try {
    const project = getProject(projectId)
    if (!project?.serverId) return
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('datta_token')
    if (!token) return
    await fetch(SERVER + "/projects/" + project.serverId + "/add-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId, chatTitle })
    })
  } catch(e) {}
}



function getProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]') }
  catch { return [] }
}

function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

function getProject(id) {
  return getProjects().find(p => p.id == id) || null
}

// ── CREATE PROJECT ────────────────────────────────────────────────────────────
function createProject(name, instructions) {
  const projects = getProjects()
  const project = {
    id: Date.now(),
    name: name.trim(),
    instructions: instructions || '',
    chats: [],
    pinnedChats: [],
    createdAt: new Date().toISOString(),
    color: ['#ffd700','#ff8c00','#00ff88','#00bfff','#ff69b4','#a855f7'][projects.length % 6]
  }
  projects.unshift(project)
  saveProjects(projects)
  // Sync to server
  saveProjectToServer(project)
  return project
}

// ── DELETE PROJECT ────────────────────────────────────────────────────────────
function deleteProject(id) {
  const project = getProject(id)
  if (project?.serverId) deleteProjectFromServer(project.serverId)
  const projects = getProjects().filter(p => p.id != id)
  saveProjects(projects)
  loadProjectsSection()
}

// ── RENAME PROJECT ────────────────────────────────────────────────────────────
function renameProject(id, newName) {
  const projects = getProjects()
  const p = projects.find(p => p.id == id)
  if (p) { p.name = newName; saveProjects(projects) }
  loadProjectsSection()
}

// ── UPDATE INSTRUCTIONS ───────────────────────────────────────────────────────
function updateProjectInstructions(id, instructions) {
  const projects = getProjects()
  const p = projects.find(p => p.id == id)
  if (p) { p.instructions = instructions; saveProjects(projects); saveProjectToServer(p) }
}

// ── ADD CHAT TO PROJECT ───────────────────────────────────────────────────────
function addChatToProject(projectId, chatId, chatTitle) {
  const projects = getProjects()
  const p = projects.find(p => p.id == projectId)
  if (!p) return
  if (!p.chats.find(c => c.id === chatId)) {
    p.chats.unshift({ id: chatId, title: chatTitle, addedAt: new Date().toISOString() })
    saveProjects(projects)
    syncChatToServer(projectId, chatId, chatTitle)
  }
}

// ── PIN CHAT IN PROJECT ───────────────────────────────────────────────────────
function pinChatInProject(projectId, chatId) {
  const projects = getProjects()
  const p = projects.find(p => p.id == projectId)
  if (!p) return
  if (!p.pinnedChats) p.pinnedChats = []
  if (p.pinnedChats.includes(chatId)) {
    p.pinnedChats = p.pinnedChats.filter(id => id !== chatId)
  } else {
    p.pinnedChats.unshift(chatId)
  }
  saveProjects(projects)
  openProjectPanel(projectId)
}

// ── SHOW NEW PROJECT MODAL ────────────────────────────────────────────────────
function showNewProjectModal() {
  document.getElementById('projectModal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'projectModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;'
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:20px;padding:24px;width:100%;max-width:420px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#ffd700;margin-bottom:6px;">📁 NEW PROJECT</div>
      <div style="font-size:12px;color:#443300;margin-bottom:20px;">Organize your chats with a shared AI context</div>
      
      <div style="margin-bottom:14px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;color:#443300;margin-bottom:6px;">PROJECT NAME *</div>
        <input id="projNameInput" type="text" placeholder="e.g. Work Research, Story Writing..." maxlength="50"
          style="width:100%;padding:10px 14px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.15);border-radius:10px;color:#fff8e7;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;box-sizing:border-box;"
          onkeydown="if(event.key==='Enter')submitNewProject()">
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;color:#443300;margin-bottom:6px;">AI INSTRUCTIONS <span style="color:#332200">(optional)</span></div>
        <textarea id="projInstrInput" placeholder="e.g. You are helping me with my startup. Always be concise and business-focused..." rows="3"
          style="width:100%;padding:10px 14px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.15);border-radius:10px;color:#fff8e7;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;resize:none;box-sizing:border-box;"></textarea>
        <div style="font-size:11px;color:#332200;margin-top:4px;">This context will be given to AI for every chat in this project</div>
      </div>

      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('projectModal').remove()"
          style="flex:1;padding:11px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#554400;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">
          Cancel
        </button>
        <button onclick="submitNewProject()"
          style="flex:2;padding:11px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;cursor:pointer;">
          CREATE PROJECT
        </button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.onclick = e => { if(e.target===modal) modal.remove() }
  setTimeout(() => document.getElementById('projNameInput')?.focus(), 100)
}

function submitNewProject() {
  const name = document.getElementById('projNameInput')?.value?.trim()
  const instructions = document.getElementById('projInstrInput')?.value?.trim()
  if (!name) {
    document.getElementById('projNameInput').style.borderColor = '#ff4444'
    return
  }
  const project = createProject(name, instructions)
  document.getElementById('projectModal')?.remove()
  loadProjectsSection()
  showSection('projects')
  // Show success toast
  showProjectToast('📁 Project "' + project.name + '" created!')
  openProjectPanel(project.id)
}

// ── OPEN PROJECT PANEL (sidebar) ──────────────────────────────────────────────
function openProjectPanel(id) {
  const project = getProject(id)
  if (!project) return

  // Set active project
  window.activeProjectId = id
  localStorage.setItem('datta_active_project', id)

  // Show project panel in sidebar
  document.getElementById('projectPanelOverlay')?.remove()
  const panel = document.createElement('div')
  panel.id = 'projectPanelOverlay'
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:5000;backdrop-filter:blur(4px);'

  const pinnedIds = project.pinnedChats || []
  const pinnedChats = project.chats.filter(c => pinnedIds.includes(c.id))
  const regularChats = project.chats.filter(c => !pinnedIds.includes(c.id))

  panel.innerHTML = `
    <div id="projectPanel" style="position:absolute;left:0;top:0;bottom:0;width:280px;max-width:85vw;background:#0a0900;border-right:1px solid rgba(255,215,0,0.12);display:flex;flex-direction:column;animation:slideInLeft 0.2s ease;">
      <style>@keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}</style>
      
      <!-- Header -->
      <div style="padding:16px;border-bottom:1px solid rgba(255,215,0,0.08);display:flex;align-items:center;gap:10px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${project.color};flex-shrink:0;"></div>
        <div style="flex:1;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:#fff8e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${project.name}</div>
        <button onclick="document.getElementById('projectPanelOverlay').remove();window.activeProjectId=null;" style="background:none;border:none;color:#443300;cursor:pointer;font-size:18px;padding:2px;">✕</button>
      </div>

      <!-- Instructions badge -->
      ${project.instructions ? `
        <div style="margin:10px 12px;padding:8px 12px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:10px;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#443300;margin-bottom:4px;">AI INSTRUCTIONS</div>
          <div style="font-size:11px;color:#554400;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${project.instructions}</div>
        </div>` : ''}

      <!-- Action buttons -->
      <div style="padding:8px 12px;display:flex;gap:6px;">
        <button onclick="startChatInProject(${id})" style="flex:1;padding:8px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:20px;color:#000;font-family:'Rajdhani',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;">+ NEW CHAT</button>
        <button onclick="editProjectInstructions(${id})" style="padding:8px 10px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.1);border-radius:20px;color:#665500;font-size:12px;cursor:pointer;" title="Edit instructions">⚙️</button>
        <button onclick="confirmDeleteProject(${id})" style="padding:8px 10px;background:rgba(255,60,60,0.06);border:1px solid rgba(255,60,60,0.1);border-radius:20px;color:#ff4444;font-size:12px;cursor:pointer;" title="Delete project">🗑️</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 8px 16px;">
        ${pinnedChats.length ? `
          <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#332200;padding:8px 6px 4px;">📌 PINNED</div>
          ${pinnedChats.map(c => projectChatItem(c, id, true)).join('')}
          <div style="height:1px;background:rgba(255,215,0,0.06);margin:8px 4px;"></div>` : ''}
        
        ${regularChats.length ? `
          <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#332200;padding:8px 6px 4px;">💬 CHATS</div>
          ${regularChats.map(c => projectChatItem(c, id, false)).join('')}` : 
          `<div style="text-align:center;padding:30px 16px;color:#332200;font-size:13px;">No chats yet.<br>Click "+ NEW CHAT" to start!</div>`}
      </div>

      <!-- Add existing chat -->
      <div style="padding:10px 12px;border-top:1px solid rgba(255,215,0,0.06);">
        <button onclick="showAddChatToProjectPanel(${id})" style="width:100%;padding:8px;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.08);border-radius:10px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:1px;cursor:pointer;">
          + ADD EXISTING CHAT
        </button>
      </div>
    </div>
  `
  document.body.appendChild(panel)
  panel.onclick = e => { if(e.target===panel) { panel.remove(); window.activeProjectId=null } }
}

function projectChatItem(chat, projectId, isPinned) {
  return `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:8px;cursor:pointer;transition:background 0.15s;group" 
      onmouseover="this.style.background='rgba(255,215,0,0.05)'" onmouseout="this.style.background='none'">
      <div onclick="openChat('${chat.id}');document.getElementById('projectPanelOverlay').remove()" 
        style="flex:1;font-size:12px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${isPinned ? '📌 ' : ''}${chat.title}
      </div>
      <button onclick="pinChatInProject(${projectId},'${chat.id}')" 
        style="background:none;border:none;color:${isPinned?'#ffd700':'#332200'};cursor:pointer;font-size:12px;padding:2px;flex-shrink:0;" 
        title="${isPinned?'Unpin':'Pin'}">📌</button>
    </div>`
}

// ── START CHAT IN PROJECT ─────────────────────────────────────────────────────
function startChatInProject(projectId) {
  window.activeProjectId = projectId
  localStorage.setItem('datta_active_project', projectId)
  document.getElementById('projectPanelOverlay')?.remove()
  if (typeof startNewChat === 'function') startNewChat()
  const project = getProject(projectId)
  if (project) showProjectToast('💬 Chatting in: ' + project.name)
}

// ── EDIT INSTRUCTIONS ─────────────────────────────────────────────────────────
function editProjectInstructions(id) {
  const project = getProject(id)
  if (!project) return
  document.getElementById('editInstrModal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'editInstrModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;'
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:20px;padding:24px;width:100%;max-width:420px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:#ffd700;margin-bottom:14px;">⚙️ AI INSTRUCTIONS</div>
      <textarea id="editInstrText" rows="6" style="width:100%;padding:12px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.15);border-radius:10px;color:#fff8e7;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;resize:none;box-sizing:border-box;">${project.instructions || ''}</textarea>
      <div style="font-size:11px;color:#332200;margin:8px 0 16px;">These instructions guide the AI in every chat within this project.</div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('editInstrModal').remove()" style="flex:1;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#554400;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
        <button onclick="saveProjectInstructions(${id})" style="flex:2;padding:10px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;">SAVE</button>
      </div>
    </div>`
  document.body.appendChild(modal)
  modal.onclick = e => { if(e.target===modal) modal.remove() }
}

function saveProjectInstructions(id) {
  const text = document.getElementById('editInstrText')?.value || ''
  updateProjectInstructions(id, text)
  document.getElementById('editInstrModal')?.remove()
  showProjectToast('✅ Instructions saved!')
  openProjectPanel(id)
}

// ── CONFIRM DELETE ────────────────────────────────────────────────────────────
function confirmDeleteProject(id) {
  const project = getProject(id)
  if (!project) return
  document.getElementById('delProjModal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'delProjModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;'
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,60,60,0.2);border-radius:20px;padding:24px;max-width:300px;width:90%;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px">🗑️</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:#fff8e7;margin-bottom:8px;">Delete Project?</div>
      <div style="font-size:13px;color:#665500;margin-bottom:20px;">"${project.name}" will be permanently deleted. Chats inside will remain.</div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('delProjModal').remove()" style="flex:1;padding:11px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#665500;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
        <button onclick="deleteProject(${id});document.getElementById('delProjModal').remove();document.getElementById('projectPanelOverlay')?.remove()" style="flex:1;padding:11px;background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.3);border-radius:50px;color:#ff4444;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">Delete</button>
      </div>
    </div>`
  document.body.appendChild(modal)
}

// ── ADD EXISTING CHAT TO PROJECT ──────────────────────────────────────────────
async function showAddChatToProjectPanel(projectId) {
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chats?token=" + (typeof getToken === 'function' ? getToken() : ''))
    const chats = await res.json()
    const project = getProject(projectId)
    const alreadyAdded = (project?.chats || []).map(c => c.id)
    const available = chats.filter(c => !alreadyAdded.includes(c._id))

    document.getElementById('addChatModal')?.remove()
    const modal = document.createElement('div')
    modal.id = 'addChatModal'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);'
    modal.innerHTML = `
      <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.15);border-radius:24px 24px 0 0;padding:20px;width:100%;max-width:500px;max-height:70vh;display:flex;flex-direction:column;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:#ffd700;margin-bottom:12px;text-align:center;">ADD CHAT TO PROJECT</div>
        <div style="flex:1;overflow-y:auto;">
          ${available.length === 0 ? '<div style="text-align:center;color:#443300;padding:20px;">All chats already in project!</div>' :
            available.map(c => `
              <div onclick="addChatToProject(${projectId},'${c._id}','${(c.title||'Chat').replace(/'/g,"\\'")}');document.getElementById('addChatModal').remove();openProjectPanel(${projectId})"
                style="padding:10px 12px;margin:4px 0;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.08);border-radius:10px;cursor:pointer;font-size:13px;color:#665500;transition:background 0.15s;"
                onmouseover="this.style.background='rgba(255,215,0,0.08)'" onmouseout="this.style.background='rgba(255,215,0,0.04)'">
                💬 ${c.title || 'Chat'}
              </div>`).join('')}
        </div>
        <button onclick="document.getElementById('addChatModal').remove()" style="margin-top:12px;width:100%;padding:11px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#554400;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">Close</button>
      </div>`
    document.body.appendChild(modal)
    modal.onclick = e => { if(e.target===modal) modal.remove() }
  } catch(e) {
    showProjectToast('❌ Could not load chats')
  }
}

// ── LOAD PROJECTS SECTION IN SIDEBAR ─────────────────────────────────────────
function loadProjectsSection() {
  const sec = document.getElementById('section-projects')
  if (!sec) return
  const projects = getProjects()
  if (projects.length === 0) {
    sec.innerHTML = `
      <div style="text-align:center;padding:30px 16px;">
        <div style="font-size:32px;margin-bottom:10px">📁</div>
        <div style="font-size:13px;color:#443300;line-height:1.6">No projects yet.<br>Click "New project" to organize your chats!</div>
      </div>`
    return
  }
  sec.innerHTML = projects.map(p => `
    <div onclick="openProjectPanel(${p.id})" style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin:2px 8px;border-radius:10px;cursor:pointer;transition:background 0.15s;" 
      onmouseover="this.style.background='rgba(255,215,0,0.05)'" onmouseout="this.style.background='none'">
      <div style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0;"></div>
      <div style="flex:1;font-size:13px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
      <div style="font-size:10px;color:#332200;font-family:'Rajdhani',sans-serif;">${p.chats.length} chats</div>
    </div>`).join('')
}

// ── GET ACTIVE PROJECT INSTRUCTIONS (for chat) ────────────────────────────────
function getActiveProjectInstructions() {
  const id = window.activeProjectId || localStorage.getItem('datta_active_project')
  if (!id) return null
  const project = getProject(id)
  return project?.instructions || null
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showProjectToast(msg) {
  let t = document.getElementById('projectToast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'projectToast'
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:50px;padding:8px 18px;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;color:#ffd700;z-index:99999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s;'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.style.opacity = '1'
  t.style.display = 'block'
  clearTimeout(t._t)
  t._t = setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.style.display='none',300) }, 2500)
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────
window.createProject = createProject
window.deleteProject = deleteProject
window.renameProject = renameProject
window.openProjectPanel = openProjectPanel
window.startChatInProject = startChatInProject
window.showNewProjectModal = showNewProjectModal
window.submitNewProject = submitNewProject
window.addChatToProject = addChatToProject
window.pinChatInProject = pinChatInProject
window.editProjectInstructions = editProjectInstructions
window.saveProjectInstructions = saveProjectInstructions
window.confirmDeleteProject = confirmDeleteProject
window.showAddChatToProjectPanel = showAddChatToProjectPanel
window.loadProjectsSection = loadProjectsSection
window.getActiveProjectInstructions = getActiveProjectInstructions
window.showProjectToast = showProjectToast
window.syncProjectsFromServer = syncProjectsFromServer
window.saveProjectToServer = saveProjectToServer

// Auto load and sync on page
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    syncProjectsFromServer()
    loadProjectsSection()
  }, 1000)
})
