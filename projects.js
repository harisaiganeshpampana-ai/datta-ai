// ╔══════════════════════════════════════════════════════╗
// ║         DATTA AI — projects.js (COMPLETE)           ║
// ║  Full projects feature: create, chat, manage        ║
// ╚══════════════════════════════════════════════════════╝

// ── PROJECT STORAGE ────────────────────────────────────
function getProjects() {
  try { return JSON.parse(localStorage.getItem('datta_projects') || '[]'); }
  catch(e) { return []; }
}
function saveProjects(projects) {
  localStorage.setItem('datta_projects', JSON.stringify(projects));
}
function getProject(id) {
  return getProjects().find(p => p.id === id) || null;
}
function saveProject(project) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.unshift(project);
  saveProjects(projects);
}
function deleteProject(id) {
  saveProjects(getProjects().filter(p => p.id !== id));
}

// ── RENDER PROJECTS SIDEBAR ────────────────────────────
function renderProjects() {
  const container = document.getElementById('section-projects');
  if (!container) return;
  const projects = getProjects();

  if (!projects.length) {
    container.innerHTML = `
      <div style="padding:16px 12px;">
        <button onclick="openNewProjectModal()" style="width:100%;padding:10px;background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.2);border-radius:12px;color:var(--accent);font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span style="font-size:16px;">+</span> New Project
        </button>
        <div style="text-align:center;padding:30px 10px;color:#332200;font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:1px;">
          <div style="font-size:28px;margin-bottom:8px;opacity:0.4;">📁</div>
          No projects yet<br>
          <span style="font-size:10px;opacity:0.6;">Organize chats by topic</span>
        </div>
      </div>`;
    return;
  }

  const icons = ['📁','🚀','💡','🎯','🔬','📝','🎨','💼','🌐','⚡'];
  container.innerHTML = `
    <div style="padding:8px 12px 4px;">
      <button onclick="openNewProjectModal()" style="width:100%;padding:8px;background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.2);border-radius:10px;color:var(--accent);font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;">
        <span>+</span> New Project
      </button>
      ${projects.map(p => `
        <div class="projectItem" onclick="openProject('${p.id}')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:all 0.15s;margin-bottom:2px;border:1px solid transparent;" onmouseover="this.style.background='rgba(255,215,0,0.06)';this.style.borderColor='rgba(255,215,0,0.1)'" onmouseout="this.style.background='none';this.style.borderColor='transparent'">
          <span style="font-size:16px;flex-shrink:0;">${p.icon || '📁'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;color:#fff8e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
            <div style="font-size:10px;color:#332200;font-family:'Rajdhani',sans-serif;">${(p.chats||[]).length} chats</div>
          </div>
          <button onclick="event.stopPropagation();deleteProjectConfirm('${p.id}')" style="background:none;border:none;color:#332200;cursor:pointer;padding:2px 4px;border-radius:4px;font-size:12px;opacity:0;" onmouseover="this.style.opacity='1';this.style.color='#ff4444'" onmouseout="this.style.opacity='0'">✕</button>
        </div>`).join('')}
    </div>`;
}
window.renderProjects = renderProjects;

// ── NEW PROJECT MODAL ──────────────────────────────────
function openNewProjectModal() {
  document.getElementById('_projectModal')?.remove();
  const icons = ['📁','🚀','💡','🎯','🔬','📝','🎨','💼','🌐','⚡','🧠','🔥','⭐','🎮','🏆'];
  let selectedIcon = '📁';

  const modal = document.createElement('div');
  modal.id = '_projectModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:24px;width:90%;max-width:360px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--accent);margin-bottom:16px;">📁 NEW PROJECT</div>

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">PROJECT NAME</div>
      <input id="_projName" placeholder="e.g. My App, Research, Work..." style="width:100%;background:#080800;border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px 14px;color:#fff8e7;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;margin-bottom:14px;"
        onkeydown="if(event.key==='Enter') createProject()">

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">DESCRIPTION (optional)</div>
      <input id="_projDesc" placeholder="What is this project about?" style="width:100%;background:#080800;border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px 14px;color:#fff8e7;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;margin-bottom:14px;">

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">CHOOSE ICON</div>
      <div id="_iconGrid" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        ${icons.map(icon => `
          <button onclick="selectIcon('${icon}',this)" data-icon="${icon}" style="width:36px;height:36px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:8px;cursor:pointer;font-size:18px;transition:all 0.15s;${icon==='📁'?'background:rgba(255,215,0,0.15);border-color:rgba(255,215,0,0.4);':''}">${icon}</button>`).join('')}
      </div>

      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('_projectModal').remove()" style="flex:1;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:50px;color:#665500;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;">Cancel</button>
        <button onclick="createProject()" style="flex:2;padding:11px;background:linear-gradient(135deg,var(--accent),#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;">Create Project →</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  setTimeout(() => document.getElementById('_projName')?.focus(), 100);
}
window.openNewProjectModal = openNewProjectModal;

function selectIcon(icon, btn) {
  document.querySelectorAll('#_iconGrid button').forEach(b => {
    b.style.background = 'rgba(255,215,0,0.05)';
    b.style.borderColor = 'rgba(255,215,0,0.1)';
  });
  btn.style.background = 'rgba(255,215,0,0.15)';
  btn.style.borderColor = 'rgba(255,215,0,0.4)';
  window._selectedIcon = icon;
}
window.selectIcon = selectIcon;

function createProject() {
  const name = document.getElementById('_projName')?.value.trim();
  if (!name) {
    document.getElementById('_projName').style.borderColor = 'rgba(255,60,60,0.5)';
    return;
  }
  const desc = document.getElementById('_projDesc')?.value.trim() || '';
  const icon = window._selectedIcon || '📁';
  const project = {
    id: 'proj_' + Date.now(),
    name, desc, icon,
    chats: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  saveProject(project);
  document.getElementById('_projectModal')?.remove();
  renderProjects();
  // Switch to projects section
  if (typeof showSection === 'function') showSection('projects');
  // Open the project immediately
  openProject(project.id);
}
window.createProject = createProject;

// ── OPEN PROJECT ───────────────────────────────────────
function openProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;

  window._currentProjectId = projectId;

  // Show welcome screen with project context
  const ws = document.getElementById('welcomeScreen');
  const chatEl = document.getElementById('chat');

  if (ws) {
    ws.style.display = 'flex';
    ws.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;width:100%;padding:20px 16px 140px;text-align:center;">
        <div style="font-size:52px;margin-bottom:12px;animation:welcomeFloat 3s ease-in-out infinite;">${project.icon}</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:3px;color:#443300;margin-bottom:6px;">PROJECT</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;background:linear-gradient(135deg,#fff8e7,var(--accent),#ff8c00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px;">${project.name}</div>
        ${project.desc ? `<div style="font-size:13px;color:#443300;margin-bottom:20px;max-width:400px;">${project.desc}</div>` : '<div style="margin-bottom:20px;"></div>'}

        <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;justify-content:center;">
          <div style="padding:5px 14px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.12);border-radius:20px;font-family:'Rajdhani',sans-serif;font-size:11px;color:#665500;letter-spacing:1px;">
            💬 ${project.chats.length} chats
          </div>
          <div style="padding:5px 14px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.12);border-radius:20px;font-family:'Rajdhani',sans-serif;font-size:11px;color:#665500;letter-spacing:1px;">
            📅 ${new Date(project.createdAt).toLocaleDateString()}
          </div>
          <button onclick="editProject('${project.id}')" style="padding:5px 14px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.12);border-radius:20px;font-family:'Rajdhani',sans-serif;font-size:11px;color:#665500;letter-spacing:1px;cursor:pointer;">✏️ Edit</button>
        </div>

        ${project.chats.length > 0 ? `
          <div style="width:100%;max-width:500px;margin-bottom:20px;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#332200;margin-bottom:10px;text-align:left;">RECENT CHATS IN THIS PROJECT</div>
            ${project.chats.slice(0,4).map(chatId => {
              const allChats = JSON.parse(localStorage.getItem('datta_chats')||'{}');
              const chat = allChats[chatId];
              if (!chat) return '';
              return `<div onclick="openChat('${chatId}')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.07);border-radius:12px;cursor:pointer;margin-bottom:6px;transition:all 0.15s;text-align:left;" onmouseover="this.style.background='rgba(255,215,0,0.07)'" onmouseout="this.style.background='rgba(255,215,0,0.03)'">
                <span style="font-size:14px;">💬</span>
                <span style="font-size:13px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${chat.title||'Chat'}</span>
              </div>`;
            }).join('')}
          </div>` : ''}

        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#332200;letter-spacing:2px;margin-bottom:12px;">START A NEW CHAT IN THIS PROJECT</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:480px;width:100%;">
          <div class="chip" onclick="startProjectChat('What should I work on in the ${project.name} project?')" style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;transition:all 0.2s;color:#665500;" onmouseover="this.style.background='rgba(255,215,0,0.07)';this.style.borderColor='rgba(255,215,0,0.3)'" onmouseout="this.style.background='rgba(255,215,0,0.03)';this.style.borderColor='rgba(255,215,0,0.08)'">
            <div style="font-size:20px;margin-bottom:6px;">🎯</div>
            <div style="font-weight:700;font-size:13px;color:#cc9900;">Plan tasks</div>
            <div style="font-size:11px;color:#443300;margin-top:2px;">What to work on</div>
          </div>
          <div class="chip" onclick="startProjectChat('Summarize the key ideas for ${project.name}')" style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;transition:all 0.2s;color:#665500;" onmouseover="this.style.background='rgba(255,215,0,0.07)';this.style.borderColor='rgba(255,215,0,0.3)'" onmouseout="this.style.background='rgba(255,215,0,0.03)';this.style.borderColor='rgba(255,215,0,0.08)'">
            <div style="font-size:20px;margin-bottom:6px;">📝</div>
            <div style="font-weight:700;font-size:13px;color:#cc9900;">Summarize</div>
            <div style="font-size:11px;color:#443300;margin-top:2px;">Key ideas</div>
          </div>
          <div class="chip" onclick="startProjectChat('Help me brainstorm ideas for ${project.name}')" style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;transition:all 0.2s;color:#665500;" onmouseover="this.style.background='rgba(255,215,0,0.07)';this.style.borderColor='rgba(255,215,0,0.3)'" onmouseout="this.style.background='rgba(255,215,0,0.03)';this.style.borderColor='rgba(255,215,0,0.08)'">
            <div style="font-size:20px;margin-bottom:6px;">💡</div>
            <div style="font-weight:700;font-size:13px;color:#cc9900;">Brainstorm</div>
            <div style="font-size:11px;color:#443300;margin-top:2px;">New ideas</div>
          </div>
          <div class="chip" onclick="startProjectChat('What are the next steps for ${project.name}?')" style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;transition:all 0.2s;color:#665500;" onmouseover="this.style.background='rgba(255,215,0,0.07)';this.style.borderColor='rgba(255,215,0,0.3)'" onmouseout="this.style.background='rgba(255,215,0,0.03)';this.style.borderColor='rgba(255,215,0,0.08)'">
            <div style="font-size:20px;margin-bottom:6px;">🚀</div>
            <div style="font-weight:700;font-size:13px;color:#cc9900;">Next steps</div>
            <div style="font-size:11px;color:#443300;margin-top:2px;">Action plan</div>
          </div>
        </div>
      </div>`;
  }
  if (chatEl) chatEl.innerHTML = '';

  // Update input placeholder
  const input = document.getElementById('message');
  if (input) input.placeholder = `Chat in "${project.name}"...`;

  // Close sidebar on mobile
  if (window.innerWidth < 900 && typeof closeSidebar === 'function') closeSidebar();
}
window.openProject = openProject;

// ── START CHAT IN PROJECT ──────────────────────────────
function startProjectChat(prompt) {
  const input = document.getElementById('message');
  const ws = document.getElementById('welcomeScreen');
  if (ws) ws.style.display = 'none';
  if (input) {
    input.value = prompt;
    if (typeof send === 'function') send();
  }
}
window.startProjectChat = startProjectChat;

// ── EDIT PROJECT ───────────────────────────────────────
function editProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;

  document.getElementById('_projectModal')?.remove();
  const icons = ['📁','🚀','💡','🎯','🔬','📝','🎨','💼','🌐','⚡','🧠','🔥','⭐','🎮','🏆'];

  const modal = document.createElement('div');
  modal.id = '_projectModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:24px;width:90%;max-width:360px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--accent);margin-bottom:16px;">✏️ EDIT PROJECT</div>

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">PROJECT NAME</div>
      <input id="_projName" value="${project.name}" style="width:100%;background:#080800;border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px 14px;color:#fff8e7;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;margin-bottom:14px;">

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">DESCRIPTION</div>
      <input id="_projDesc" value="${project.desc||''}" placeholder="What is this project about?" style="width:100%;background:#080800;border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px 14px;color:#fff8e7;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;margin-bottom:14px;">

      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;color:#443300;letter-spacing:2px;margin-bottom:8px;">ICON</div>
      <div id="_iconGrid" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        ${icons.map(icon => `
          <button onclick="selectIcon('${icon}',this)" data-icon="${icon}" style="width:36px;height:36px;background:${icon===project.icon?'rgba(255,215,0,0.15)':'rgba(255,215,0,0.05)'};border:1px solid ${icon===project.icon?'rgba(255,215,0,0.4)':'rgba(255,215,0,0.1)'};border-radius:8px;cursor:pointer;font-size:18px;transition:all 0.15s;">${icon}</button>`).join('')}
      </div>

      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('_projectModal').remove()" style="flex:1;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:50px;color:#665500;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;">Cancel</button>
        <button onclick="updateProject('${projectId}')" style="flex:2;padding:11px;background:linear-gradient(135deg,var(--accent),#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  window._selectedIcon = project.icon;
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}
window.editProject = editProject;

function updateProject(projectId) {
  const name = document.getElementById('_projName')?.value.trim();
  if (!name) return;
  const project = getProject(projectId);
  if (!project) return;
  project.name = name;
  project.desc = document.getElementById('_projDesc')?.value.trim() || '';
  project.icon = window._selectedIcon || project.icon;
  project.updatedAt = Date.now();
  saveProject(project);
  document.getElementById('_projectModal')?.remove();
  renderProjects();
  openProject(projectId);
}
window.updateProject = updateProject;

// ── DELETE PROJECT ─────────────────────────────────────
function deleteProjectConfirm(projectId) {
  const project = getProject(projectId);
  if (!project) return;

  document.getElementById('_delModal')?.remove();
  const modal = document.createElement('div');
  modal.id = '_delModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,60,60,0.2);border-radius:24px;padding:24px;width:90%;max-width:320px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">🗑️</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:#ff4444;margin-bottom:8px;">DELETE PROJECT</div>
      <div style="font-size:13px;color:#665500;margin-bottom:6px;">Delete "<strong style="color:#fff8e7;">${project.name}</strong>"?</div>
      <div style="font-size:12px;color:#443300;margin-bottom:20px;">This won't delete the chats inside.</div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('_delModal').remove()" style="flex:1;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:50px;color:#665500;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="confirmDeleteProject('${projectId}')" style="flex:1;padding:11px;background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.3);border-radius:50px;color:#ff4444;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}
window.deleteProjectConfirm = deleteProjectConfirm;

function confirmDeleteProject(projectId) {
  deleteProject(projectId);
  document.getElementById('_delModal')?.remove();
  if (window._currentProjectId === projectId) {
    window._currentProjectId = null;
    if (typeof newChat === 'function') newChat();
  }
  renderProjects();
}
window.confirmDeleteProject = confirmDeleteProject;

// ── SAVE CHAT TO CURRENT PROJECT ───────────────────────
// Called after each chat save if a project is active
const _origSaveChat = window.saveChat;
window.addEventListener('load', function() {
  const origSave = window.saveChat;
  if (origSave) {
    window.saveChat = function() {
      origSave.apply(this, arguments);
      // If a project is active, link this chat to it
      if (window._currentProjectId && window.currentChatId) {
        const project = getProject(window._currentProjectId);
        if (project && !project.chats.includes(window.currentChatId)) {
          project.chats.unshift(window.currentChatId);
          project.updatedAt = Date.now();
          saveProject(project);
          renderProjects();
        }
      }
    };
  }
});

// ── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  renderProjects();
});
