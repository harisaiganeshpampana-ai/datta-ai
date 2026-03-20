// ── DATTA AI PROJECT PAGE ─────────────────────────────────────────────────────

function openProjectPage(projectId) {
  const project = getProject(projectId)
  if (!project) return

  // Remove existing
  document.getElementById('projectPage')?.remove()

  const page = document.createElement('div')
  page.id = 'projectPage'
  page.style.cssText = 'position:fixed;inset:0;background:var(--bg,#080800);z-index:8000;display:flex;flex-direction:column;animation:fadeIn 0.2s ease;overflow-y:auto;'

  const chats = project.chats || []
  const pinned = project.pinnedChats || []
  const pinnedChats = chats.filter(c => pinned.includes(c.id))
  const recentChats = chats.filter(c => !pinned.includes(c.id)).slice(0, 20)

  page.innerHTML = `
    <style>
      @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      .projPageHeader { display:flex; align-items:center; gap:12px; padding:16px; border-bottom:1px solid rgba(255,215,0,0.08); }
      .projPageTitle { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:3px; color:#fff8e7; flex:1; }
      .projKnowledgeCard { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px; cursor:pointer; transition:all 0.2s; }
      .projKnowledgeCard:hover { background:rgba(255,215,0,0.06); border-color:rgba(255,215,0,0.2); }
      .projKnowledgeLabel { font-size:13px; color:#fff8e7; font-weight:600; margin-bottom:4px; }
      .projKnowledgeAdd { font-size:13px; color:var(--accent,#ffd700); }
      .projChatItem { display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:12px; cursor:pointer; transition:background 0.15s; }
      .projChatItem:hover { background:rgba(255,255,255,0.05); }
      .projChatTitle { font-size:14px; color:#fff8e7; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .projChatTime { font-size:11px; color:rgba(255,255,255,0.3); flex-shrink:0; }
    </style>

    <!-- HEADER -->
    <div class="projPageHeader">
      <button onclick="document.getElementById('projectPage').remove()" style="background:none;border:none;color:#665500;cursor:pointer;padding:4px;font-size:20px;">←</button>
      <div class="projPageTitle">${project.name}</div>
      <span style="font-size:11px;padding:4px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;color:rgba(255,255,255,0.5);">🔒 Private</span>
      <button onclick="showProjectMenu(${projectId})" style="background:none;border:none;color:#665500;cursor:pointer;padding:4px;font-size:20px;">⋯</button>
    </div>

    <!-- BODY -->
    <div style="padding:16px;max-width:700px;width:100%;margin:0 auto;box-sizing:border-box;">

      <!-- Knowledge + Instructions cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
        <div class="projKnowledgeCard" onclick="editProjectInstructions(${projectId})">
          <div class="projKnowledgeLabel">📚 Project knowledge</div>
          <div class="projKnowledgeAdd">${project.knowledge ? 'View knowledge' : '+ Add knowledge'}</div>
        </div>
        <div class="projKnowledgeCard" onclick="editProjectInstructions(${projectId})">
          <div class="projKnowledgeLabel">⚙️ Custom instructions</div>
          <div class="projKnowledgeAdd">${project.instructions ? 'Edit instructions' : '+ Add instructions'}</div>
        </div>
      </div>

      ${project.instructions ? `
      <div style="background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.1);border-radius:12px;padding:12px 16px;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:2px;color:#443300;font-family:'Rajdhani',sans-serif;margin-bottom:6px;">AI INSTRUCTIONS</div>
        <div style="font-size:13px;color:#665500;line-height:1.6;">${project.instructions}</div>
      </div>` : ''}

      <!-- Pinned chats -->
      ${pinnedChats.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;letter-spacing:2px;color:rgba(255,255,255,0.3);font-family:'Rajdhani',sans-serif;margin-bottom:8px;padding:0 4px;">📌 PINNED</div>
        ${pinnedChats.map(c => `
          <div class="projChatItem" onclick="openChatFromProject('${c.id}')">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--accent,#ffd700);flex-shrink:0;"></div>
            <div class="projChatTitle">${c.title || 'Chat'}</div>
            <div class="projChatTime">${formatProjectTime(c.addedAt)}</div>
          </div>`).join('')}
      </div>` : ''}

      <!-- Recent chats -->
      <div>
        <div style="font-size:12px;letter-spacing:2px;color:rgba(255,255,255,0.3);font-family:'Rajdhani',sans-serif;margin-bottom:8px;padding:0 4px;">💬 RECENT CHATS</div>
        ${recentChats.length === 0 ? `
          <div style="text-align:center;padding:40px 16px;color:rgba(255,255,255,0.2);font-size:14px;">
            No chats yet. Start one below!
          </div>` :
          recentChats.map(c => `
            <div class="projChatItem" onclick="openChatFromProject('${c.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div class="projChatTitle">${c.title || 'Chat'}</div>
              <div class="projChatTime">${formatProjectTime(c.addedAt)}</div>
            </div>`).join('')}
      </div>
    </div>

    <!-- NEW CHAT BUTTON -->
    <div style="position:sticky;bottom:0;padding:16px;background:linear-gradient(to top,var(--bg,#080800) 60%,transparent);margin-top:auto;">
      <button onclick="startChatInProject(${projectId});document.getElementById('projectPage').remove()" style="
        width:100%;max-width:700px;display:block;margin:0 auto;
        padding:16px;background:linear-gradient(135deg,#ffd700,#ff8c00);
        border:none;border-radius:50px;color:#000;
        font-family:'Rajdhani',sans-serif;font-size:16px;
        font-weight:700;letter-spacing:2px;cursor:pointer;
        box-shadow:0 4px 20px rgba(255,215,0,0.3);
      ">+ NEW CHAT</button>
    </div>
  `

  document.body.appendChild(page)
}

function formatProjectTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - d) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return diff + 'm ago'
    if (diff < 1440) return Math.floor(diff/60) + 'h ago'
    return Math.floor(diff/1440) + 'd ago'
  } catch(e) { return '' }
}

function openChatFromProject(chatId) {
  document.getElementById('projectPage')?.remove()
  if (typeof openChat === 'function') openChat(chatId)
}

function showProjectMenu(id) {
  const project = getProject(id)
  if (!project) return
  document.getElementById('projMenuOverlay')?.remove()
  const overlay = document.createElement('div')
  overlay.id = 'projMenuOverlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:flex-end;justify-content:center;'
  overlay.innerHTML = `
    <div style="background:var(--bg2,#0f0e00);border:1px solid rgba(255,215,0,0.12);border-radius:24px 24px 0 0;padding:20px;width:100%;max-width:500px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;color:#443300;margin-bottom:12px;text-align:center;">${project.name}</div>
      <button onclick="editProjectInstructions(${id});document.getElementById('projMenuOverlay').remove()" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid rgba(255,215,0,0.06);color:#665500;font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;"><span>⚙️</span> Edit instructions</button>
      <button onclick="renameProjectPrompt(${id})" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid rgba(255,215,0,0.06);color:#665500;font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;"><span>✏️</span> Rename project</button>
      <button onclick="confirmDeleteProject(${id});document.getElementById('projMenuOverlay').remove()" style="width:100%;padding:14px;background:none;border:none;color:#ff4444;font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;"><span>🗑️</span> Delete project</button>
      <button onclick="document.getElementById('projMenuOverlay').remove()" style="width:100%;padding:12px;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#665500;font-size:13px;cursor:pointer;margin-top:10px;">Cancel</button>
    </div>`
  overlay.onclick = e => { if(e.target===overlay) overlay.remove() }
  document.body.appendChild(overlay)
}

function renameProjectPrompt(id) {
  document.getElementById('projMenuOverlay')?.remove()
  const project = getProject(id)
  if (!project) return
  const newName = prompt('Rename project:', project.name)
  if (newName && newName.trim() && newName !== project.name) {
    renameProject(id, newName.trim())
    document.getElementById('projectPage')?.remove()
    openProjectPage(id)
  }
}

window.openProjectPage = openProjectPage
window.openChatFromProject = openChatFromProject
window.showProjectMenu = showProjectMenu
window.renameProjectPrompt = renameProjectPrompt
