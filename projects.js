// ============================================================
//  DATTA AI — PROJECT SYSTEM  (projects.js)
//  Drop-in replacement. Works with your existing index.html.
//  Storage: localStorage  (key = "datta_projects")
// ============================================================

(function () {
  "use strict";

  /* ──────────────────────────────────────────────
     1.  DATA LAYER
  ────────────────────────────────────────────── */

  const STORAGE_KEY = "datta_projects";
  const ACTIVE_PROJECT_KEY = "datta_active_project";
  const ACTIVE_CHAT_KEY = "datta_active_chat";

  function loadProjects() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveProjects(projects) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  function generateId() {
    return "proj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  function generateChatId() {
    return "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  /* ──────────────────────────────────────────────
     2.  PROJECT CRUD
  ────────────────────────────────────────────── */

  function createProject(name) {
    const projects = loadProjects();
    const project = {
      id: generateId(),
      name: name.trim() || "Untitled Project",
      emoji: "📁",
      createdAt: Date.now(),
      chats: [],
      files: [],
      artifacts: [],
    };
    projects.unshift(project);
    saveProjects(projects);
    return project;
  }

  function renameProject(id, newName) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === id);
    if (p) {
      p.name = newName.trim() || p.name;
      saveProjects(projects);
    }
  }

  function deleteProject(id) {
    let projects = loadProjects();
    projects = projects.filter((p) => p.id !== id);
    saveProjects(projects);
    if (localStorage.getItem(ACTIVE_PROJECT_KEY) === id) {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
      localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  }

  function getProject(id) {
    return loadProjects().find((p) => p.id === id) || null;
  }

  /* ──────────────────────────────────────────────
     3.  CHAT CRUD (inside a project)
  ────────────────────────────────────────────── */

  function addChatToProject(projectId, chatTitle) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return null;
    const chat = {
      id: generateChatId(),
      title: chatTitle || "New Chat",
      createdAt: Date.now(),
      messages: [],
    };
    p.chats.unshift(chat);
    saveProjects(projects);
    return chat;
  }

  function renameChatInProject(projectId, chatId, newTitle) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    const chat = p.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.title = newTitle.trim() || chat.title;
      saveProjects(projects);
    }
  }

  function deleteChatFromProject(projectId, chatId) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    p.chats = p.chats.filter((c) => c.id !== chatId);
    saveProjects(projects);
  }

  function addMessageToChat(projectId, chatId, role, content) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    const chat = p.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.messages.push({ role, content, ts: Date.now() });
      // Auto-title from first user message
      if (chat.messages.filter((m) => m.role === "user").length === 1) {
        chat.title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
      }
      saveProjects(projects);
    }
  }

  /* ──────────────────────────────────────────────
     4.  FILE / ARTIFACT STORAGE
  ────────────────────────────────────────────── */

  function addFileToProject(projectId, fileName, fileContent, fileType) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    p.files.push({
      id: generateId(),
      name: fileName,
      content: fileContent,
      type: fileType || "text",
      addedAt: Date.now(),
    });
    saveProjects(projects);
  }

  function addArtifactToProject(projectId, title, content, type) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    p.artifacts.push({
      id: generateId(),
      title: title || "Untitled Artifact",
      content,
      type: type || "text",
      addedAt: Date.now(),
    });
    saveProjects(projects);
  }

  function deleteFileFromProject(projectId, fileId) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    p.files = p.files.filter((f) => f.id !== fileId);
    saveProjects(projects);
  }

  function deleteArtifactFromProject(projectId, artifactId) {
    const projects = loadProjects();
    const p = projects.find((p) => p.id === projectId);
    if (!p) return;
    p.artifacts = p.artifacts.filter((a) => a.id !== artifactId);
    saveProjects(projects);
  }

  /* ──────────────────────────────────────────────
     5.  UI RENDERING
  ────────────────────────────────────────────── */

  function getProjectsContainer() {
    // Try your existing sidebar section
    return (
      document.getElementById("projects-list") ||
      document.querySelector(".projects-list") ||
      document.querySelector('[data-section="projects"]')
    );
  }

  function getRecentsContainer() {
    return (
      document.getElementById("recents-list") ||
      document.querySelector(".recents-list") ||
      document.querySelector('[data-section="recents"]')
    );
  }

  /* ── Modal helper ── */
  function showModal({ title, placeholder, value = "", onConfirm }) {
    // Remove existing
    document.getElementById("datta-proj-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "datta-proj-modal";
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);
      display:flex;align-items:center;justify-content:center;
      animation:fadeIn .15s ease;
    `;

    overlay.innerHTML = `
      <div style="
        background:var(--bg-secondary,#1e1e2e);
        border:1px solid var(--border-color,#333);
        border-radius:14px;padding:28px 24px;width:340px;max-width:90vw;
        box-shadow:0 20px 60px rgba(0,0,0,.5);
      ">
        <h3 style="margin:0 0 16px;font-size:16px;color:var(--text-primary,#fff);font-family:inherit">${title}</h3>
        <input id="datta-modal-input" type="text" value="${value}"
          placeholder="${placeholder}"
          style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color,#444);
            background:var(--bg-primary,#111);color:var(--text-primary,#fff);
            font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;
            transition:border .2s;"
          onfocus="this.style.borderColor='var(--accent-color,#c9a227)'"
          onblur="this.style.borderColor='var(--border-color,#444)'"
        />
        <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
          <button id="datta-modal-cancel" style="
            padding:8px 18px;border-radius:8px;border:1px solid var(--border-color,#444);
            background:transparent;color:var(--text-secondary,#aaa);cursor:pointer;font-size:13px;font-family:inherit;
          ">Cancel</button>
          <button id="datta-modal-confirm" style="
            padding:8px 18px;border-radius:8px;border:none;
            background:var(--accent-color,#c9a227);color:#000;cursor:pointer;font-weight:600;font-size:13px;font-family:inherit;
          ">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById("datta-modal-input");
    input.focus();
    input.select();

    const confirm = () => {
      const val = input.value.trim();
      if (val) { onConfirm(val); overlay.remove(); }
      else input.style.borderColor = "red";
    };

    document.getElementById("datta-modal-confirm").onclick = confirm;
    document.getElementById("datta-modal-cancel").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") overlay.remove();
    });
  }

  /* ── Context menu helper ── */
  function showContextMenu(x, y, items) {
    document.getElementById("datta-ctx-menu")?.remove();
    const menu = document.createElement("div");
    menu.id = "datta-ctx-menu";
    menu.style.cssText = `
      position:fixed;left:${x}px;top:${y}px;z-index:99999;
      background:var(--bg-secondary,#1e1e2e);
      border:1px solid var(--border-color,#333);
      border-radius:10px;padding:6px;min-width:160px;
      box-shadow:0 8px 30px rgba(0,0,0,.4);
      animation:fadeIn .1s ease;
    `;
    items.forEach(({ label, icon, danger, onClick }) => {
      const btn = document.createElement("button");
      btn.style.cssText = `
        display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;
        background:none;border:none;border-radius:6px;cursor:pointer;
        color:${danger ? "#ff5f5f" : "var(--text-primary,#fff)"};
        font-size:13px;font-family:inherit;text-align:left;
        transition:background .15s;
      `;
      btn.onmouseenter = () => (btn.style.background = "var(--bg-hover,rgba(255,255,255,.08))");
      btn.onmouseleave = () => (btn.style.background = "none");
      btn.innerHTML = `<span>${icon}</span><span>${label}</span>`;
      btn.onclick = () => { menu.remove(); onClick(); };
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", () => menu.remove(), { once: true });
    }, 10);
    // Keep menu inside viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";
  }

  /* ── Project detail panel ── */
  function openProjectPanel(projectId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    document.getElementById("datta-project-panel")?.remove();

    const project = getProject(projectId);
    if (!project) return;

    const panel = document.createElement("div");
    panel.id = "datta-project-panel";
    panel.style.cssText = `
      position:fixed;inset:0;z-index:8888;
      background:var(--bg-primary,#111);
      display:flex;flex-direction:column;
      animation:slideIn .2s ease;
      font-family:inherit;
    `;

    panel.innerHTML = `
      <style>
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        #datta-project-panel *{box-sizing:border-box}
        .proj-tab-btn{padding:8px 16px;border:none;background:none;cursor:pointer;
          color:var(--text-secondary,#aaa);font-size:13px;font-family:inherit;
          border-bottom:2px solid transparent;transition:all .2s;}
        .proj-tab-btn.active{color:var(--accent-color,#c9a227);
          border-bottom-color:var(--accent-color,#c9a227);}
        .proj-item-card{background:var(--bg-secondary,#1e1e2e);
          border:1px solid var(--border-color,#333);border-radius:10px;
          padding:12px 14px;display:flex;align-items:center;gap:10px;
          cursor:pointer;transition:border-color .2s,background .2s;}
        .proj-item-card:hover{border-color:var(--accent-color,#c9a227);
          background:var(--bg-hover,rgba(255,255,255,.05));}
        .proj-empty{text-align:center;padding:40px 20px;
          color:var(--text-secondary,#666);font-size:13px;}
      </style>

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;
        border-bottom:1px solid var(--border-color,#333);">
        <button id="proj-panel-back" style="background:none;border:none;cursor:pointer;
          color:var(--text-secondary,#aaa);font-size:20px;padding:4px;">←</button>
        <span style="font-size:22px">${project.emoji}</span>
        <h2 id="proj-panel-title" style="margin:0;font-size:17px;
          color:var(--text-primary,#fff);flex:1">${escHtml(project.name)}</h2>
        <button id="proj-panel-new-chat" style="
          padding:7px 14px;border-radius:8px;border:none;
          background:var(--accent-color,#c9a227);color:#000;
          font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;">
          + New Chat
        </button>
        <button id="proj-panel-menu-btn" style="background:none;border:none;cursor:pointer;
          color:var(--text-secondary,#aaa);font-size:20px;padding:4px 8px;">⋯</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border-color,#333);padding:0 20px;">
        <button class="proj-tab-btn active" data-tab="chats">💬 Chats</button>
        <button class="proj-tab-btn" data-tab="files">📎 Files</button>
        <button class="proj-tab-btn" data-tab="artifacts">🎨 Artifacts</button>
      </div>

      <!-- Tab content -->
      <div id="proj-tab-content" style="flex:1;overflow-y:auto;padding:20px;"></div>
    `;

    document.body.appendChild(panel);

    // Back button
    panel.querySelector("#proj-panel-back").onclick = () => panel.remove();

    // Menu button (rename/delete project)
    panel.querySelector("#proj-panel-menu-btn").onclick = (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      showContextMenu(rect.left, rect.bottom + 4, [
        {
          label: "Rename Project", icon: "✏️",
          onClick: () => showModal({
            title: "Rename Project",
            placeholder: "Project name…",
            value: project.name,
            onConfirm: (name) => {
              renameProject(projectId, name);
              panel.querySelector("#proj-panel-title").textContent = name;
              renderProjectsList();
            },
          }),
        },
        {
          label: "Delete Project", icon: "🗑️", danger: true,
          onClick: () => {
            if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
              deleteProject(projectId);
              panel.remove();
              renderProjectsList();
            }
          },
        },
      ]);
    };

    // New Chat button
    panel.querySelector("#proj-panel-new-chat").onclick = () => {
      const chat = addChatToProject(projectId, "New Chat");
      renderTab("chats");
      // Optionally: open chat in main area
      openChatInMainArea(projectId, chat.id);
    };

    // Tabs
    let activeTab = "chats";
    panel.querySelectorAll(".proj-tab-btn").forEach((btn) => {
      btn.onclick = () => {
        panel.querySelectorAll(".proj-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeTab = btn.dataset.tab;
        renderTab(activeTab);
      };
    });

    function renderTab(tab) {
      const content = panel.querySelector("#proj-tab-content");
      const proj = getProject(projectId);
      if (!proj) return;

      if (tab === "chats") {
        if (!proj.chats.length) {
          content.innerHTML = `<div class="proj-empty">No chats yet.<br>Click <b>+ New Chat</b> to start one.</div>`;
          return;
        }
        content.innerHTML = proj.chats.map((chat) => `
          <div class="proj-item-card" data-chat-id="${chat.id}" style="margin-bottom:10px">
            <span style="font-size:18px">💬</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:var(--text-primary,#fff);
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escHtml(chat.title)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary,#666);margin-top:2px">
                ${chat.messages.length} message${chat.messages.length !== 1 ? "s" : ""} · ${timeAgo(chat.createdAt)}
              </div>
            </div>
            <button class="chat-ctx-btn" data-chat-id="${chat.id}"
              style="background:none;border:none;cursor:pointer;
              color:var(--text-secondary,#aaa);font-size:16px;padding:4px 8px;opacity:.6">⋯</button>
          </div>
        `).join("");

        // Open chat on card click
        content.querySelectorAll(".proj-item-card").forEach((card) => {
          card.onclick = (e) => {
            if (e.target.classList.contains("chat-ctx-btn")) return;
            openChatInMainArea(projectId, card.dataset.chatId);
          };
        });

        // Chat context menu
        content.querySelectorAll(".chat-ctx-btn").forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const rect = btn.getBoundingClientRect();
            const chatId = btn.dataset.chatId;
            const chat = getProject(projectId)?.chats.find((c) => c.id === chatId);
            showContextMenu(rect.left, rect.bottom + 4, [
              {
                label: "Rename Chat", icon: "✏️",
                onClick: () => showModal({
                  title: "Rename Chat",
                  placeholder: "Chat title…",
                  value: chat?.title || "",
                  onConfirm: (name) => {
                    renameChatInProject(projectId, chatId, name);
                    renderTab("chats");
                  },
                }),
              },
              {
                label: "Delete Chat", icon: "🗑️", danger: true,
                onClick: () => {
                  deleteChatFromProject(projectId, chatId);
                  renderTab("chats");
                },
              },
            ]);
          };
        });

      } else if (tab === "files") {
        if (!proj.files.length) {
          content.innerHTML = `<div class="proj-empty">No files yet.<br>Files added in chats will appear here.</div>`;
          return;
        }
        content.innerHTML = proj.files.map((f) => `
          <div class="proj-item-card" style="margin-bottom:10px" data-file-id="${f.id}">
            <span style="font-size:18px">${fileIcon(f.type)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:var(--text-primary,#fff);
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escHtml(f.name)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary,#666);margin-top:2px">
                ${f.type} · ${timeAgo(f.addedAt)}
              </div>
            </div>
            <button class="file-del-btn" data-file-id="${f.id}"
              style="background:none;border:none;cursor:pointer;
              color:#ff5f5f;font-size:14px;padding:4px 8px;opacity:.7">🗑️</button>
          </div>
        `).join("");

        content.querySelectorAll(".file-del-btn").forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            deleteFileFromProject(projectId, btn.dataset.fileId);
            renderTab("files");
          };
        });

      } else if (tab === "artifacts") {
        if (!proj.artifacts.length) {
          content.innerHTML = `<div class="proj-empty">No artifacts yet.<br>Saved code or outputs will appear here.</div>`;
          return;
        }
        content.innerHTML = proj.artifacts.map((a) => `
          <div class="proj-item-card" style="margin-bottom:10px" data-artifact-id="${a.id}">
            <span style="font-size:18px">🎨</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:var(--text-primary,#fff);
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escHtml(a.title)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary,#666);margin-top:2px">
                ${a.type} · ${timeAgo(a.addedAt)}
              </div>
            </div>
            <button class="artifact-del-btn" data-artifact-id="${a.id}"
              style="background:none;border:none;cursor:pointer;
              color:#ff5f5f;font-size:14px;padding:4px 8px;opacity:.7">🗑️</button>
          </div>
        `).join("");

        content.querySelectorAll(".artifact-del-btn").forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            deleteArtifactFromProject(projectId, btn.dataset.artifactId);
            renderTab("artifacts");
          };
        });
      }
    }

    renderTab("chats");
  }

  /* ── Open a chat (hook into your existing chat system) ── */
  function openChatInMainArea(projectId, chatId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    localStorage.setItem(ACTIVE_CHAT_KEY, chatId);

    // Close the project panel
    document.getElementById("datta-project-panel")?.remove();

    // Try to call your existing newChat / loadChat functions if they exist
    if (typeof window.loadProjectChat === "function") {
      window.loadProjectChat(projectId, chatId);
    } else if (typeof window.newChat === "function") {
      window.newChat();
    }

    // Dispatch event so other scripts can react
    window.dispatchEvent(new CustomEvent("datta:openChat", {
      detail: { projectId, chatId }
    }));
  }

  /* ──────────────────────────────────────────────
     6.  SIDEBAR RENDERING
  ────────────────────────────────────────────── */

  function renderProjectsList() {
    const projects = loadProjects();

    // ── Find or create the projects section in your sidebar ──
    let container = getProjectsContainer();

    if (!container) {
      // Auto-inject below the "New project" button
      const newProjBtn =
        document.getElementById("new-project-btn") ||
        document.querySelector('[onclick*="project"]') ||
        document.querySelector(".new-project-btn");

      if (newProjBtn) {
        container = document.createElement("div");
        container.id = "projects-list";
        container.style.cssText = "margin-top:6px;";
        newProjBtn.parentNode.insertBefore(container, newProjBtn.nextSibling);
      }
    }

    if (!container) return; // sidebar not ready yet

    if (!projects.length) {
      container.innerHTML = `
        <div style="padding:8px 14px;font-size:12px;color:var(--text-secondary,#666)">
          No projects yet
        </div>`;
      return;
    }

    container.innerHTML = projects.map((p) => `
      <div class="datta-proj-item" data-id="${p.id}"
        style="display:flex;align-items:center;gap:8px;
          padding:8px 14px;border-radius:8px;cursor:pointer;
          transition:background .15s;position:relative;"
        onmouseenter="this.style.background='var(--bg-hover,rgba(255,255,255,.06))'"
        onmouseleave="this.style.background='transparent'">
        <span style="font-size:16px">${p.emoji}</span>
        <span style="flex:1;font-size:13px;color:var(--text-primary,#eee);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(p.name)}
        </span>
        <button class="proj-ctx" data-id="${p.id}"
          style="background:none;border:none;cursor:pointer;
          color:var(--text-secondary,#888);font-size:14px;
          opacity:0;transition:opacity .15s;padding:2px 6px;"
          onmouseenter="this.style.opacity='1'"
          onmouseleave="this.style.opacity='0'">⋯</button>
      </div>
    `).join("");

    // Show ⋯ on row hover
    container.querySelectorAll(".datta-proj-item").forEach((row) => {
      row.onmouseenter = () => {
        row.style.background = "var(--bg-hover,rgba(255,255,255,.06))";
        row.querySelector(".proj-ctx").style.opacity = "1";
      };
      row.onmouseleave = () => {
        row.style.background = "transparent";
        row.querySelector(".proj-ctx").style.opacity = "0";
      };
      // Open project panel on click
      row.onclick = (e) => {
        if (e.target.classList.contains("proj-ctx")) return;
        openProjectPanel(row.dataset.id);
      };
    });

    // Context menu buttons
    container.querySelectorAll(".proj-ctx").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const rect = btn.getBoundingClientRect();
        const id = btn.dataset.id;
        const proj = getProject(id);
        showContextMenu(rect.right, rect.bottom + 4, [
          {
            label: "Rename", icon: "✏️",
            onClick: () => showModal({
              title: "Rename Project",
              placeholder: "Project name…",
              value: proj?.name || "",
              onConfirm: (name) => { renameProject(id, name); renderProjectsList(); },
            }),
          },
          {
            label: "Delete", icon: "🗑️", danger: true,
            onClick: () => {
              if (confirm(`Delete "${proj?.name}"? This cannot be undone.`)) {
                deleteProject(id);
                renderProjectsList();
              }
            },
          },
        ]);
      };
    });
  }

  /* ──────────────────────────────────────────────
     7.  "NEW PROJECT" BUTTON WIRING
  ────────────────────────────────────────────── */

  function wireNewProjectButton() {
    // Try to find your existing button by common selectors
    const btn =
      document.getElementById("new-project-btn") ||
      document.querySelector(".new-project-btn") ||
      [...document.querySelectorAll("button, div[role=button]")]
        .find((el) => el.textContent.trim().toLowerCase().includes("new project"));

    if (btn) {
      // Replace existing handler
      btn.replaceWith(btn.cloneNode(true)); // Remove old listeners
      const freshBtn = document.getElementById("new-project-btn") ||
        document.querySelector(".new-project-btn") ||
        [...document.querySelectorAll("button")]
          .find((el) => el.textContent.trim().toLowerCase().includes("new project"));
      if (freshBtn) {
        freshBtn.onclick = () => {
          showModal({
            title: "New Project",
            placeholder: "Give your project a name…",
            onConfirm: (name) => {
              createProject(name);
              renderProjectsList();
            },
          });
        };
      }
    }
  }

  /* ──────────────────────────────────────────────
     8.  HELPERS
  ────────────────────────────────────────────── */

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }

  function fileIcon(type) {
    const map = { image: "🖼️", pdf: "📄", code: "💻", text: "📝", audio: "🎵", video: "🎬" };
    return map[type] || "📎";
  }

  /* ──────────────────────────────────────────────
     9.  GLOBAL CSS ANIMATIONS
  ────────────────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById("datta-proj-styles")) return;
    const style = document.createElement("style");
    style.id = "datta-proj-styles";
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────
     10.  PUBLIC API  (window.DattaProjects)
  ────────────────────────────────────────────── */

  window.DattaProjects = {
    // Data
    createProject,
    renameProject,
    deleteProject,
    getProject,
    loadProjects,
    // Chats
    addChatToProject,
    renameChatInProject,
    deleteChatFromProject,
    addMessageToChat,
    // Files & Artifacts
    addFileToProject,
    addArtifactToProject,
    deleteFileFromProject,
    deleteArtifactFromProject,
    // UI
    renderProjectsList,
    openProjectPanel,
  };

  /* ──────────────────────────────────────────────
     11.  INIT
  ────────────────────────────────────────────── */

  function init() {
    injectStyles();
    wireNewProjectButton();
    renderProjectsList();

    // Re-render if sidebar loads late (SPA navigation)
    const observer = new MutationObserver(() => {
      if (!document.getElementById("projects-list")) {
        wireNewProjectButton();
        renderProjectsList();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
