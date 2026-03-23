// ============================================================
//  DATTA AI — Projects System (projects.js)
//  Drop-in replacement. Works with localStorage.
//  Matches Datta AI gold/dark theme.
// ============================================================

const ProjectsSystem = (() => {

  // ── Storage helpers ────────────────────────────────────────
  const STORE_KEY = 'datta_projects';

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch { return []; }
  }

  function saveAll(projects) {
    localStorage.setItem(STORE_KEY, JSON.stringify(projects));
  }

  function genId() {
    return 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  // ── CRUD ───────────────────────────────────────────────────
  function createProject(name, instructions = '') {
    const projects = loadAll();
    const p = {
      id: genId(),
      name: name.trim() || 'Untitled Project',
      instructions: instructions.trim(),
      chats: [],           // [{id, title, messages:[]}]
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    projects.unshift(p);
    saveAll(projects);
    return p;
  }

  function getProject(id) {
    return loadAll().find(p => p.id === id) || null;
  }

  function updateProject(id, changes) {
    const projects = loadAll();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    projects[idx] = { ...projects[idx], ...changes, updatedAt: Date.now() };
    saveAll(projects);
    return projects[idx];
  }

  function deleteProject(id) {
    const projects = loadAll().filter(p => p.id !== id);
    saveAll(projects);
  }

  function addChatToProject(projectId, chatTitle = 'New Chat') {
    const projects = loadAll();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) return null;
    const chat = { id: genId(), title: chatTitle, messages: [], createdAt: Date.now() };
    projects[idx].chats.unshift(chat);
    projects[idx].updatedAt = Date.now();
    saveAll(projects);
    return chat;
  }

  function deleteChatFromProject(projectId, chatId) {
    const projects = loadAll();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) return;
    projects[idx].chats = projects[idx].chats.filter(c => c.id !== chatId);
    projects[idx].updatedAt = Date.now();
    saveAll(projects);
  }

  function renameChatInProject(projectId, chatId, newTitle) {
    const projects = loadAll();
    const pIdx = projects.findIndex(p => p.id === projectId);
    if (pIdx === -1) return;
    const cIdx = projects[pIdx].chats.findIndex(c => c.id === chatId);
    if (cIdx === -1) return;
    projects[pIdx].chats[cIdx].title = newTitle.trim() || 'Untitled Chat';
    projects[pIdx].updatedAt = Date.now();
    saveAll(projects);
  }

  // ── UI ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('datta-proj-styles')) return;
    const style = document.createElement('style');
    style.id = 'datta-proj-styles';
    style.textContent = `
      /* ── overlay ── */
      #datta-proj-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: opacity .25s ease;
      }
      #datta-proj-overlay.open { opacity: 1; pointer-events: all; }

      /* ── modal shell ── */
      #datta-proj-modal {
        background: #111;
        border: 1px solid #c9a227;
        border-radius: 16px;
        width: min(96vw, 860px);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 0 60px rgba(201,162,39,.18);
        transform: translateY(24px) scale(.97);
        transition: transform .28s cubic-bezier(.34,1.56,.64,1);
        font-family: 'Segoe UI', sans-serif;
        color: #f0e6c8;
      }
      #datta-proj-overlay.open #datta-proj-modal {
        transform: translateY(0) scale(1);
      }

      /* ── header ── */
      .dp-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 24px;
        border-bottom: 1px solid #2a2a2a;
        background: #0d0d0d;
      }
      .dp-header h2 {
        font-size: 1.1rem; font-weight: 700; color: #c9a227;
        margin: 0; letter-spacing: .04em;
      }
      .dp-header-btns { display: flex; gap: 10px; align-items: center; }

      /* ── body: two-pane layout ── */
      .dp-body {
        display: grid;
        grid-template-columns: 230px 1fr;
        flex: 1; overflow: hidden;
      }

      /* ── left pane ── */
      .dp-left {
        border-right: 1px solid #1e1e1e;
        display: flex; flex-direction: column;
        background: #0d0d0d;
        overflow: hidden;
      }
      .dp-left-top {
        padding: 14px 14px 10px;
        border-bottom: 1px solid #1e1e1e;
      }
      .dp-proj-list {
        flex: 1; overflow-y: auto; padding: 8px 8px;
      }
      .dp-proj-list::-webkit-scrollbar { width: 4px; }
      .dp-proj-list::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

      .dp-proj-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-radius: 10px; cursor: pointer;
        margin-bottom: 4px; gap: 8px;
        transition: background .15s;
      }
      .dp-proj-item:hover { background: #1a1a1a; }
      .dp-proj-item.active { background: #1f1a08; border: 1px solid #c9a22755; }
      .dp-proj-item-name {
        font-size: .85rem; font-weight: 600; color: #e0cc98;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        flex: 1;
      }
      .dp-proj-item-del {
        background: none; border: none; cursor: pointer;
        color: #555; font-size: .85rem; padding: 2px 5px;
        border-radius: 5px; transition: color .15s, background .15s;
        flex-shrink: 0;
      }
      .dp-proj-item-del:hover { color: #e55; background: #2a1010; }

      .dp-empty-msg {
        color: #444; font-size: .8rem; text-align: center;
        padding: 28px 10px;
      }

      /* ── right pane ── */
      .dp-right {
        display: flex; flex-direction: column;
        overflow: hidden; background: #111;
      }
      .dp-right-placeholder {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        color: #333; gap: 10px;
      }
      .dp-right-placeholder span { font-size: 2.4rem; }
      .dp-right-placeholder p { font-size: .85rem; }

      /* ── project detail view ── */
      .dp-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
      .dp-detail-header {
        padding: 16px 20px 12px;
        border-bottom: 1px solid #1e1e1e;
        display: flex; align-items: center; justify-content: space-between;
      }
      .dp-detail-header input {
        background: none; border: none; outline: none;
        font-size: 1rem; font-weight: 700; color: #c9a227;
        font-family: inherit; width: 60%;
      }
      .dp-detail-header input::placeholder { color: #444; }

      .dp-instructions-wrap {
        padding: 12px 20px;
        border-bottom: 1px solid #1a1a1a;
      }
      .dp-instructions-label {
        font-size: .72rem; color: #888; letter-spacing: .06em;
        text-transform: uppercase; margin-bottom: 6px;
      }
      .dp-instructions-area {
        width: 100%; box-sizing: border-box;
        background: #0d0d0d; border: 1px solid #2a2a2a;
        border-radius: 8px; color: #c8b87a; font-family: inherit;
        font-size: .82rem; padding: 10px 12px; resize: none;
        min-height: 72px; outline: none;
        transition: border-color .2s;
      }
      .dp-instructions-area:focus { border-color: #c9a22788; }
      .dp-instructions-area::placeholder { color: #333; }

      /* ── chats inside project ── */
      .dp-chats-section {
        flex: 1; display: flex; flex-direction: column; overflow: hidden;
      }
      .dp-chats-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 20px 6px;
      }
      .dp-chats-label { font-size: .72rem; color: #888; text-transform: uppercase; letter-spacing: .06em; }
      .dp-chat-list {
        flex: 1; overflow-y: auto; padding: 0 14px 14px;
      }
      .dp-chat-list::-webkit-scrollbar { width: 4px; }
      .dp-chat-list::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }

      .dp-chat-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-radius: 9px;
        margin-bottom: 5px; gap: 8px;
        background: #161616;
        border: 1px solid transparent;
        cursor: pointer; transition: border-color .15s, background .15s;
      }
      .dp-chat-item:hover { border-color: #c9a22740; background: #1a1a1a; }
      .dp-chat-item-info { flex: 1; overflow: hidden; }
      .dp-chat-item-title {
        font-size: .83rem; font-weight: 600; color: #ddd;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dp-chat-item-date { font-size: .7rem; color: #444; margin-top: 2px; }
      .dp-chat-item-actions { display: flex; gap: 4px; }
      .dp-chat-btn {
        background: none; border: none; cursor: pointer; padding: 3px 6px;
        border-radius: 5px; font-size: .78rem; color: #555;
        transition: color .15s, background .15s;
      }
      .dp-chat-btn:hover { color: #c9a227; background: #1f1a08; }
      .dp-chat-btn.del:hover { color: #e55; background: #2a1010; }

      .dp-no-chats { color: #333; font-size: .8rem; padding: 20px; text-align: center; }

      /* ── create project form ── */
      #datta-create-proj-form {
        display: none;
        flex-direction: column; gap: 12px;
        padding: 18px 20px;
        border-bottom: 1px solid #1e1e1e;
        background: #0d0d0d;
      }
      #datta-create-proj-form.show { display: flex; }
      #datta-create-proj-form input,
      #datta-create-proj-form textarea {
        background: #141414; border: 1px solid #2a2a2a;
        border-radius: 8px; color: #f0e6c8; font-family: inherit;
        font-size: .85rem; padding: 10px 12px; outline: none;
        transition: border-color .2s;
      }
      #datta-create-proj-form input:focus,
      #datta-create-proj-form textarea:focus { border-color: #c9a22799; }
      #datta-create-proj-form input::placeholder,
      #datta-create-proj-form textarea::placeholder { color: #333; }
      #datta-create-proj-form textarea { resize: none; min-height: 64px; }
      .dp-form-btns { display: flex; gap: 8px; }

      /* ── buttons ── */
      .dp-btn {
        border: none; border-radius: 8px; cursor: pointer;
        font-family: inherit; font-size: .82rem; font-weight: 600;
        padding: 8px 16px; transition: all .18s;
      }
      .dp-btn-gold {
        background: linear-gradient(135deg,#c9a227,#e8c84a);
        color: #111;
      }
      .dp-btn-gold:hover { filter: brightness(1.12); transform: translateY(-1px); }
      .dp-btn-ghost {
        background: #1e1e1e; color: #888; border: 1px solid #2a2a2a;
      }
      .dp-btn-ghost:hover { background: #252525; color: #bbb; }
      .dp-btn-icon {
        background: none; border: none; cursor: pointer; padding: 6px 10px;
        border-radius: 7px; font-size: .9rem; color: #777;
        transition: background .15s, color .15s;
      }
      .dp-btn-icon:hover { background: #1a1a1a; color: #c9a227; }
      .dp-btn-close {
        background: none; border: none; cursor: pointer;
        color: #555; font-size: 1.2rem; padding: 2px 8px;
        border-radius: 6px; transition: color .15s;
      }
      .dp-btn-close:hover { color: #e55; }

      /* ── toast ── */
      #datta-proj-toast {
        position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(20px);
        background: #1f1a08; border: 1px solid #c9a227;
        color: #e8c84a; border-radius: 10px;
        padding: 10px 22px; font-size: .83rem; font-weight: 600;
        opacity: 0; pointer-events: none; z-index: 10000;
        transition: opacity .2s, transform .2s;
      }
      #datta-proj-toast.show {
        opacity: 1; transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function toast(msg) {
    let t = document.getElementById('datta-proj-toast');
    if (!t) { t = document.createElement('div'); t.id = 'datta-proj-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Render helpers ─────────────────────────────────────────
  let _activeProjectId = null;

  function renderProjectList(container) {
    const projects = loadAll();
    if (!projects.length) {
      container.innerHTML = '<p class="dp-empty-msg">No projects yet.<br>Create one above 👆</p>';
      return;
    }
    container.innerHTML = projects.map(p => `
      <div class="dp-proj-item ${p.id === _activeProjectId ? 'active' : ''}"
           data-pid="${p.id}" tabindex="0" role="button"
           aria-label="Open project ${p.name}">
        <span class="dp-proj-item-name" title="${p.name}">📁 ${p.name}</span>
        <button class="dp-proj-item-del" data-del="${p.id}" title="Delete project">🗑</button>
      </div>
    `).join('');

    container.querySelectorAll('.dp-proj-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.dataset.del) return;
        _activeProjectId = el.dataset.pid;
        renderAll();
      });
    });
    container.querySelectorAll('.dp-proj-item-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Delete this project and all its chats?')) return;
        deleteProject(btn.dataset.del);
        if (_activeProjectId === btn.dataset.del) _activeProjectId = null;
        renderAll();
        toast('Project deleted');
      });
    });
  }

  function renderDetail(container) {
    if (!_activeProjectId) {
      container.innerHTML = `
        <div class="dp-right-placeholder">
          <span>📁</span>
          <p>Select a project to view details</p>
        </div>`;
      return;
    }
    const p = getProject(_activeProjectId);
    if (!p) { container.innerHTML = ''; return; }

    container.innerHTML = `
      <div class="dp-detail">
        <div class="dp-detail-header">
          <input id="dp-proj-name-input" value="${p.name}" placeholder="Project name…" maxlength="60"/>
          <div style="display:flex;gap:8px">
            <button class="dp-btn dp-btn-ghost" id="dp-save-proj-btn" style="font-size:.78rem;padding:6px 14px">💾 Save</button>
          </div>
        </div>

        <div class="dp-instructions-wrap">
          <div class="dp-instructions-label">🧠 Project Instructions</div>
          <textarea id="dp-proj-instr" class="dp-instructions-area"
            placeholder="Add custom instructions for this project (e.g. always reply in Telugu, focus on coding, etc.)…"
          >${p.instructions}</textarea>
        </div>

        <div class="dp-chats-section">
          <div class="dp-chats-header">
            <span class="dp-chats-label">💬 Chats (${p.chats.length})</span>
            <button class="dp-btn dp-btn-gold" id="dp-add-chat-btn" style="font-size:.75rem;padding:6px 13px">+ New Chat</button>
          </div>
          <div class="dp-chat-list" id="dp-chat-list"></div>
        </div>
      </div>
    `;

    // save name + instructions
    container.querySelector('#dp-save-proj-btn').onclick = () => {
      const name = container.querySelector('#dp-proj-name-input').value;
      const instructions = container.querySelector('#dp-proj-instr').value;
      updateProject(_activeProjectId, { name, instructions });
      renderAll();
      toast('Project saved ✓');
    };

    // add chat
    container.querySelector('#dp-add-chat-btn').onclick = () => {
      const title = prompt('Chat name:', 'New Chat');
      if (title === null) return;
      addChatToProject(_activeProjectId, title || 'New Chat');
      renderAll();
      toast('Chat added ✓');
    };

    renderChatList(container.querySelector('#dp-chat-list'), p);
  }

  function renderChatList(container, p) {
    if (!p.chats.length) {
      container.innerHTML = '<p class="dp-no-chats">No chats yet. Create one above.</p>';
      return;
    }
    container.innerHTML = p.chats.map(c => `
      <div class="dp-chat-item" data-cid="${c.id}">
        <div class="dp-chat-item-info">
          <div class="dp-chat-item-title">💬 ${c.title}</div>
          <div class="dp-chat-item-date">${fmtDate(c.createdAt)}</div>
        </div>
        <div class="dp-chat-item-actions">
          <button class="dp-chat-btn rename-chat" data-cid="${c.id}" title="Rename">✏️</button>
          <button class="dp-chat-btn del del-chat" data-cid="${c.id}" title="Delete">🗑</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.rename-chat').forEach(btn => {
      btn.onclick = () => {
        const chat = p.chats.find(c => c.id === btn.dataset.cid);
        const newTitle = prompt('Rename chat:', chat?.title || '');
        if (!newTitle) return;
        renameChatInProject(_activeProjectId, btn.dataset.cid, newTitle);
        renderAll();
        toast('Chat renamed ✓');
      };
    });

    container.querySelectorAll('.del-chat').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('Delete this chat?')) return;
        deleteChatFromProject(_activeProjectId, btn.dataset.cid);
        renderAll();
        toast('Chat deleted');
      };
    });
  }

  // ── main render loop ───────────────────────────────────────
  function renderAll() {
    const listEl = document.getElementById('dp-proj-list-inner');
    const detailEl = document.getElementById('dp-proj-detail');
    if (listEl) renderProjectList(listEl);
    if (detailEl) renderDetail(detailEl);
  }

  // ── Build modal DOM ────────────────────────────────────────
  function buildModal() {
    if (document.getElementById('datta-proj-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'datta-proj-overlay';
    overlay.innerHTML = `
      <div id="datta-proj-modal" role="dialog" aria-modal="true" aria-label="Datta AI Projects">
        <div class="dp-header">
          <h2>👑 Projects</h2>
          <div class="dp-header-btns">
            <button class="dp-btn dp-btn-gold" id="dp-new-proj-btn">+ New Project</button>
            <button class="dp-btn-close" id="dp-close-btn" title="Close">✕</button>
          </div>
        </div>

        <!-- create project inline form -->
        <div id="datta-create-proj-form">
          <input id="dp-new-name" placeholder="Project name…" maxlength="60" autocomplete="off"/>
          <textarea id="dp-new-instr" placeholder="Instructions (optional)…" rows="2"></textarea>
          <div class="dp-form-btns">
            <button class="dp-btn dp-btn-gold" id="dp-create-confirm">Create</button>
            <button class="dp-btn dp-btn-ghost" id="dp-create-cancel">Cancel</button>
          </div>
        </div>

        <div class="dp-body">
          <div class="dp-left">
            <div class="dp-proj-list" id="dp-proj-list-inner"></div>
          </div>
          <div class="dp-right" id="dp-proj-detail"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // open / close
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('dp-close-btn').onclick = closeModal;

    // new project
    const form = document.getElementById('datta-create-proj-form');
    document.getElementById('dp-new-proj-btn').onclick = () => {
      form.classList.toggle('show');
      if (form.classList.contains('show')) document.getElementById('dp-new-name').focus();
    };
    document.getElementById('dp-create-cancel').onclick = () => form.classList.remove('show');
    document.getElementById('dp-create-confirm').onclick = () => {
      const name = document.getElementById('dp-new-name').value;
      const instr = document.getElementById('dp-new-instr').value;
      if (!name.trim()) { toast('Please enter a project name'); return; }
      const p = createProject(name, instr);
      _activeProjectId = p.id;
      form.classList.remove('show');
      document.getElementById('dp-new-name').value = '';
      document.getElementById('dp-new-instr').value = '';
      renderAll();
      toast('Project created ✓');
    };

    // keyboard: Escape to close
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });
  }

  function openModal() {
    buildModal();
    renderAll();
    requestAnimationFrame(() => {
      document.getElementById('datta-proj-overlay').classList.add('open');
    });
  }

  function closeModal() {
    const overlay = document.getElementById('datta-proj-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  // ── Public API ─────────────────────────────────────────────
  function init() {
    injectStyles();

    // Wire up ANY element with data-datta-projects or id="projects-btn"
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-datta-projects], #projects-btn, .projects-btn');
      if (trigger) openModal();
    });

    // Also wire sidebar "Project" / "New project" text if present
    document.querySelectorAll('*').forEach(el => {
      if (el.childNodes.length === 1 &&
          el.childNodes[0].nodeType === 3 &&
          /^new project$/i.test(el.textContent.trim())) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', openModal);
      }
    });
  }

  return { init, open: openModal, close: closeModal, createProject, getProject, loadAll };
})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ProjectsSystem.init);
} else {
  ProjectsSystem.init();
}
