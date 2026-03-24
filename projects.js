// ================================================================
//  DATTA AI — PROJECTS SYSTEM  v3.0
//  Matches your exact theme: #080800 bg, #ffd700 accent, Bebas Neue
//  Storage: localStorage key = 'datta_projects_v2'
//  Compatible with your existing index.html structure
// ================================================================

(function () {
  'use strict';

  var STORAGE_KEY = 'datta_projects_v2';

  /* ──────────────────────────────────────────────
     UTILITIES
  ────────────────────────────────────────────── */
  function uid() {
    return Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
    return Math.floor(d / 86400000) + 'd ago';
  }

  function toast(msg) {
    document.querySelectorAll('.toast-msg').forEach(function(t){ t.remove(); });
    var t = document.createElement('div');
    t.className = 'toast-msg';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.remove(); }, 2800);
  }

  /* ──────────────────────────────────────────────
     DATA LAYER
  ────────────────────────────────────────────── */
  function getProjects() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }

  function saveProjects(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function getProject(id) {
    return getProjects().find(function(p){ return String(p.id) === String(id); }) || null;
  }

  function createProject(name, color) {
    var list = getProjects();
    var p = {
      id: uid(),
      name: (name || '').trim() || 'Untitled Project',
      color: color || '#ffd700',
      createdAt: Date.now(),
      chats: [],
      files: [],
      artifacts: []
    };
    list.unshift(p);
    saveProjects(list);
    return p;
  }

  function renameProject(id, newName) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(id); });
    if (p) { p.name = (newName || '').trim() || p.name; saveProjects(list); }
  }

  function deleteProject(id) {
    saveProjects(getProjects().filter(function(p){ return String(p.id) !== String(id); }));
  }

  function addChat(projectId, title) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return null;
    if (!p.chats) p.chats = [];
    var chat = { id: uid(), title: title || 'New Chat', createdAt: Date.now(), messages: [] };
    p.chats.unshift(chat);
    saveProjects(list);
    return chat;
  }

  function renameChat(projectId, chatId, newTitle) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    var chat = (p.chats||[]).find(function(c){ return String(c.id) === String(chatId); });
    if (chat) { chat.title = (newTitle || '').trim() || chat.title; saveProjects(list); }
  }

  function deleteChat(projectId, chatId) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    p.chats = (p.chats||[]).filter(function(c){ return String(c.id) !== String(chatId); });
    saveProjects(list);
  }

  function addFile(projectId, name, content, type) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    if (!p.files) p.files = [];
    p.files.push({ id: uid(), name: name, content: content || '', type: type || 'text', addedAt: Date.now() });
    saveProjects(list);
  }

  function deleteFile(projectId, fileId) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    p.files = (p.files||[]).filter(function(f){ return String(f.id) !== String(fileId); });
    saveProjects(list);
  }

  function addArtifact(projectId, title, content, type) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    if (!p.artifacts) p.artifacts = [];
    p.artifacts.push({ id: uid(), title: title || 'Artifact', content: content || '', type: type || 'text', addedAt: Date.now() });
    saveProjects(list);
  }

  function deleteArtifact(projectId, artifactId) {
    var list = getProjects();
    var p = list.find(function(x){ return String(x.id) === String(projectId); });
    if (!p) return;
    p.artifacts = (p.artifacts||[]).filter(function(a){ return String(a.id) !== String(artifactId); });
    saveProjects(list);
  }

  /* ──────────────────────────────────────────────
     INPUT MODAL
  ────────────────────────────────────────────── */
  function showInputModal(title, placeholder, defaultVal, onConfirm) {
    var existing = document.getElementById('datta-inp-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'datta-inp-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML =
      '<div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:20px;' +
        'padding:24px;width:100%;max-width:380px;">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:3px;color:#ffd700;margin-bottom:14px;">' + esc(title) + '</div>' +
        '<input id="datta-mi" type="text" value="' + esc(defaultVal || '') + '" placeholder="' + esc(placeholder) + '" ' +
          'style="width:100%;padding:10px 12px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.15);' +
          'border-radius:10px;color:#fff8e7;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:14px;' +
          'font-family:\'DM Sans\',sans-serif;">' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="datta-mi-cancel" style="flex:1;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);' +
            'border-radius:50px;color:#665500;cursor:pointer;font-size:13px;">Cancel</button>' +
          '<button id="datta-mi-ok" style="flex:2;padding:10px;background:linear-gradient(135deg,#ffd700,#ff8c00);' +
            'border:none;border-radius:50px;color:#000;font-weight:700;cursor:pointer;font-size:13px;">Confirm</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var inp = document.getElementById('datta-mi');
    inp.focus(); inp.select();

    function doConfirm() {
      var val = inp.value.trim();
      if (!val) { inp.style.borderColor = '#ff4444'; return; }
      overlay.remove();
      onConfirm(val);
    }

    document.getElementById('datta-mi-ok').onclick = doConfirm;
    document.getElementById('datta-mi-cancel').onclick = function(){ overlay.remove(); };
    overlay.onclick = function(e){ if (e.target === overlay) overlay.remove(); };
    inp.onkeydown = function(e){
      if (e.key === 'Enter') doConfirm();
      if (e.key === 'Escape') overlay.remove();
    };
  }

  /* ──────────────────────────────────────────────
     CONTEXT MENU
  ────────────────────────────────────────────── */
  function showCtxMenu(x, y, items) {
    var existing = document.getElementById('datta-ctx-menu');
    if (existing) existing.remove();

    var menu = document.createElement('div');
    menu.id = 'datta-ctx-menu';
    menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:99998;' +
      'background:#0f0e00;border:1px solid rgba(255,215,0,0.15);border-radius:12px;padding:6px;' +
      'min-width:170px;box-shadow:0 8px 30px rgba(0,0,0,0.6);';

    items.forEach(function(item) {
      var btn = document.createElement('button');
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;' +
        'background:none;border:none;border-radius:8px;cursor:pointer;font-family:\'DM Sans\',sans-serif;' +
        'font-size:13px;text-align:left;transition:all .15s;color:' + (item.danger ? '#ff5555' : '#665500') + ';';
      btn.innerHTML = '<span>' + (item.icon || '') + '</span><span>' + esc(item.label) + '</span>';
      btn.onmouseenter = function(){
        btn.style.background = 'rgba(255,215,0,0.06)';
        btn.style.color = item.danger ? '#ff5555' : '#fff8e7';
      };
      btn.onmouseleave = function(){
        btn.style.background = 'none';
        btn.style.color = item.danger ? '#ff5555' : '#665500';
      };
      btn.onclick = function(){ menu.remove(); item.onClick(); };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    var r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 10) menu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight - 10) menu.style.top = (y - r.height) + 'px';

    setTimeout(function(){
      function closeMenu(){ menu.remove(); document.removeEventListener('click', closeMenu); }
      document.addEventListener('click', closeMenu);
    }, 50);
  }

  /* ──────────────────────────────────────────────
     PROJECT DETAIL PANEL
  ────────────────────────────────────────────── */
  function openProjectPanel(id) {
    var existing = document.getElementById('datta-proj-panel');
    if (existing) existing.remove();

    var proj = getProject(id);
    if (!proj) { toast('Project not found'); return; }

    var panel = document.createElement('div');
    panel.id = 'datta-proj-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:8000;background:#080800;' +
      'display:flex;flex-direction:column;font-family:\'DM Sans\',sans-serif;';
    panel.style.animation = 'none';

    panel.innerHTML =
      '<style>' +
        '#datta-proj-panel .pp-tab{padding:9px 18px;border:none;background:none;cursor:pointer;' +
          'font-family:\'Rajdhani\',sans-serif;font-size:11px;letter-spacing:2px;color:#443300;' +
          'border-bottom:2px solid transparent;transition:all .2s;}' +
        '#datta-proj-panel .pp-tab.on{color:#ffd700;border-bottom-color:#ffd700;}' +
        '#datta-proj-panel .pp-card{background:#0f0e00;border:1px solid rgba(255,215,0,0.08);' +
          'border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;' +
          'cursor:pointer;transition:border-color .2s,background .2s;margin-bottom:8px;}' +
        '#datta-proj-panel .pp-card:hover{border-color:rgba(255,215,0,0.3);background:rgba(255,215,0,0.03);}' +
        '#datta-proj-panel .pp-empty{text-align:center;padding:50px 20px;color:#332200;' +
          'font-family:\'Rajdhani\',sans-serif;font-size:13px;letter-spacing:1px;line-height:2;}' +
        '#datta-proj-panel .del-btn{background:none;border:none;cursor:pointer;color:#ff5555;' +
          'font-size:14px;padding:4px 8px;opacity:0;transition:opacity .2s;}' +
        '#datta-proj-panel .pp-card:hover .del-btn{opacity:0.7;}' +
      '</style>' +

      // Header
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;' +
        'border-bottom:1px solid rgba(255,215,0,0.08);background:#060600;flex-shrink:0;">' +
        '<button id="pp-back" style="background:none;border:none;cursor:pointer;color:#665500;' +
          'font-size:22px;line-height:1;padding:2px 10px 2px 0;">←</button>' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + esc(proj.color||'#ffd700') + ';' +
          'box-shadow:0 0 10px ' + esc(proj.color||'#ffd700') + '88;flex-shrink:0;"></div>' +
        '<div id="pp-title" style="flex:1;font-family:\'Bebas Neue\',sans-serif;font-size:22px;' +
          'letter-spacing:3px;background:linear-gradient(90deg,#fff8e7,#ffd700);' +
          '-webkit-background-clip:text;-webkit-text-fill-color:transparent;">' + esc(proj.name) + '</div>' +
        '<button id="pp-new-chat" style="padding:7px 16px;background:linear-gradient(135deg,#ffd700,#ff8c00);' +
          'border:none;border-radius:50px;color:#000;font-weight:700;font-size:11px;cursor:pointer;' +
          'font-family:\'Rajdhani\',sans-serif;letter-spacing:1.5px;white-space:nowrap;">+ NEW CHAT</button>' +
        '<button id="pp-menu-btn" style="background:none;border:none;cursor:pointer;color:#443300;' +
          'font-size:20px;padding:4px 8px;margin-left:4px;">⋯</button>' +
      '</div>' +

      // Tabs
      '<div style="display:flex;border-bottom:1px solid rgba(255,215,0,0.07);background:#060600;' +
        'padding:0 8px;flex-shrink:0;">' +
        '<button class="pp-tab on" data-tab="chats">💬 CHATS</button>' +
        '<button class="pp-tab" data-tab="files">📎 FILES</button>' +
        '<button class="pp-tab" data-tab="artifacts">🎨 ARTIFACTS</button>' +
      '</div>' +

      // Content area
      '<div id="pp-content" style="flex:1;overflow-y:auto;padding:16px;"></div>';

    // Animate in
    panel.style.transform = 'translateX(100%)';
    document.body.appendChild(panel);
    setTimeout(function(){
      panel.style.transition = 'transform 0.25s ease';
      panel.style.transform = 'translateX(0)';
    }, 10);

    // Back button
    document.getElementById('pp-back').onclick = function(){
      panel.style.transform = 'translateX(100%)';
      setTimeout(function(){ panel.remove(); }, 250);
    };

    // ⋯ menu
    document.getElementById('pp-menu-btn').onclick = function(e){
      e.stopPropagation();
      var r = e.currentTarget.getBoundingClientRect();
      showCtxMenu(r.left, r.bottom + 4, [
        { icon:'✏️', label:'Rename Project', onClick: function(){
          showInputModal('RENAME PROJECT', 'New name...', proj.name, function(name){
            renameProject(id, name);
            var titleEl = document.getElementById('pp-title');
            if (titleEl) titleEl.textContent = name;
            proj.name = name;
            renderSidebarProjects();
            toast('Project renamed ✓');
          });
        }},
        { icon:'🗑️', label:'Delete Project', danger:true, onClick: function(){
          if (confirm('Delete "' + proj.name + '"? This cannot be undone.')) {
            deleteProject(id);
            panel.remove();
            renderSidebarProjects();
            toast('Project deleted');
          }
        }}
      ]);
    };

    // New Chat button
    document.getElementById('pp-new-chat').onclick = function(){
      var chat = addChat(id, 'New Chat');
      renderTab('chats');
      toast('Chat created ✓');
      window.dispatchEvent(new CustomEvent('datta:openProjectChat', { detail:{ projectId: id, chatId: chat.id } }));
    };

    // Tab switching
    var activeTab = 'chats';
    panel.querySelectorAll('.pp-tab').forEach(function(btn){
      btn.onclick = function(){
        panel.querySelectorAll('.pp-tab').forEach(function(b){ b.classList.remove('on'); });
        btn.classList.add('on');
        activeTab = btn.dataset.tab;
        renderTab(activeTab);
      };
    });

    function renderTab(tab) {
      var content = document.getElementById('pp-content');
      if (!content) return;
      var p = getProject(id);
      if (!p) return;

      if (tab === 'chats') {
        var chats = p.chats || [];
        if (!chats.length) {
          content.innerHTML = '<div class="pp-empty">📭<br>No chats yet.<br>' +
            'Press <b style="color:#ffd700">+ NEW CHAT</b> to begin.</div>';
          return;
        }
        content.innerHTML = chats.map(function(chat){
          return '<div class="pp-card" data-chat-id="' + esc(chat.id) + '">' +
            '<span style="font-size:20px;">💬</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:14px;color:#fff8e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(chat.title) + '</div>' +
              '<div style="font-size:11px;color:#332200;margin-top:3px;font-family:\'Rajdhani\',sans-serif;letter-spacing:0.5px;">' +
                (chat.messages||[]).length + ' messages · ' + timeAgo(chat.createdAt) +
              '</div>' +
            '</div>' +
            '<button class="chat-ctx" data-chat-id="' + esc(chat.id) + '" ' +
              'style="background:none;border:none;cursor:pointer;color:#443300;font-size:16px;padding:4px 8px;">⋯</button>' +
          '</div>';
        }).join('');

        content.querySelectorAll('.pp-card').forEach(function(card){
          card.onclick = function(e){
            if (e.target.classList.contains('chat-ctx')) return;
            var chatId = card.dataset.chatId;
            panel.style.transform = 'translateX(100%)';
            setTimeout(function(){ panel.remove(); }, 250);
            window.dispatchEvent(new CustomEvent('datta:openProjectChat', {
              detail: { projectId: id, chatId: chatId }
            }));
          };
        });

        content.querySelectorAll('.chat-ctx').forEach(function(btn){
          btn.onclick = function(e){
            e.stopPropagation();
            var chatId = btn.dataset.chatId;
            var chatObj = (getProject(id)||{chats:[]}).chats.find(function(c){ return String(c.id)===String(chatId); });
            var r = btn.getBoundingClientRect();
            showCtxMenu(r.left, r.bottom + 4, [
              { icon:'✏️', label:'Rename Chat', onClick: function(){
                showInputModal('RENAME CHAT', 'New title...', chatObj ? chatObj.title : '', function(name){
                  renameChat(id, chatId, name);
                  renderTab('chats');
                  toast('Chat renamed ✓');
                });
              }},
              { icon:'🗑️', label:'Delete Chat', danger:true, onClick: function(){
                deleteChat(id, chatId);
                renderTab('chats');
                toast('Chat deleted');
              }}
            ]);
          };
        });

      } else if (tab === 'files') {
        var files = p.files || [];
        if (!files.length) {
          content.innerHTML = '<div class="pp-empty">📂<br>No files yet.<br>' +
            'Files uploaded in chats appear here.</div>';
          return;
        }
        var fileIcons = { image:'🖼️', pdf:'📄', code:'💻', text:'📝', audio:'🎵', video:'🎬' };
        content.innerHTML = files.map(function(f){
          return '<div class="pp-card" data-file-id="' + esc(f.id) + '">' +
            '<span style="font-size:20px;">' + (fileIcons[f.type] || '📎') + '</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:14px;color:#fff8e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(f.name) + '</div>' +
              '<div style="font-size:11px;color:#332200;margin-top:3px;font-family:\'Rajdhani\',sans-serif;">' + esc(f.type) + ' · ' + timeAgo(f.addedAt) + '</div>' +
            '</div>' +
            '<button class="del-btn" data-file-id="' + esc(f.id) + '">🗑️</button>' +
          '</div>';
        }).join('');
        content.querySelectorAll('.del-btn').forEach(function(btn){
          btn.onclick = function(e){
            e.stopPropagation();
            deleteFile(id, btn.dataset.fileId);
            renderTab('files');
            toast('File removed');
          };
        });

      } else if (tab === 'artifacts') {
        var arts = p.artifacts || [];
        if (!arts.length) {
          content.innerHTML = '<div class="pp-empty">🎨<br>No artifacts yet.<br>' +
            'Saved code outputs appear here.</div>';
          return;
        }
        content.innerHTML = arts.map(function(a){
          return '<div class="pp-card" data-artifact-id="' + esc(a.id) + '">' +
            '<span style="font-size:20px;">🎨</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:14px;color:#fff8e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(a.title) + '</div>' +
              '<div style="font-size:11px;color:#332200;margin-top:3px;font-family:\'Rajdhani\',sans-serif;">' + esc(a.type) + ' · ' + timeAgo(a.addedAt) + '</div>' +
            '</div>' +
            '<button class="del-btn" data-artifact-id="' + esc(a.id) + '">🗑️</button>' +
          '</div>';
        }).join('');
        content.querySelectorAll('.del-btn').forEach(function(btn){
          btn.onclick = function(e){
            e.stopPropagation();
            deleteArtifact(id, btn.dataset.artifactId);
            renderTab('artifacts');
            toast('Artifact removed');
          };
        });
      }
    }

    renderTab('chats');
  }

  window.openProjectPanel = openProjectPanel;
  window.openProjectPage = openProjectPanel; // alias for old code

  /* ──────────────────────────────────────────────
     SIDEBAR LIST RENDERER
  ────────────────────────────────────────────── */
  function renderSidebarProjects() {
    var sec = document.getElementById('section-projects');
    if (!sec) return;
    var list = getProjects();

    if (!list.length) {
      sec.innerHTML =
        '<div style="text-align:center;padding:30px 16px;">' +
          '<div style="font-size:32px;margin-bottom:10px;">📁</div>' +
          '<div style="font-size:12px;color:#443300;line-height:1.8;font-family:\'Rajdhani\',sans-serif;letter-spacing:1px;">' +
            'No projects yet.<br>Click <b style="color:#554400;">New project</b> to start!' +
          '</div>' +
        '</div>';
      return;
    }

    sec.innerHTML = list.map(function(p){
      return '<div class="datta-prow" data-pid="' + esc(p.id) + '" ' +
        'style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin:2px 8px;' +
        'border-radius:10px;cursor:pointer;transition:background .15s;">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + esc(p.color||'#ffd700') + ';' +
          'box-shadow:0 0 5px ' + esc(p.color||'#ffd700') + '66;flex-shrink:0;"></div>' +
        '<div style="flex:1;font-size:13px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.name) + '</div>' +
        '<div style="font-size:10px;color:#332200;font-family:\'Rajdhani\',sans-serif;flex-shrink:0;">' + (p.chats||[]).length + '</div>' +
        '<button class="prow-ctx" data-pid="' + esc(p.id) + '" ' +
          'style="background:none;border:none;cursor:pointer;color:#443300;font-size:14px;' +
          'padding:2px 6px;opacity:0;transition:opacity .2s;flex-shrink:0;">⋯</button>' +
      '</div>';
    }).join('');

    sec.querySelectorAll('.datta-prow').forEach(function(row){
      row.onmouseenter = function(){
        row.style.background = 'rgba(255,215,0,0.05)';
        row.querySelector('.prow-ctx').style.opacity = '1';
      };
      row.onmouseleave = function(){
        row.style.background = 'transparent';
        row.querySelector('.prow-ctx').style.opacity = '0';
      };
      row.onclick = function(e){
        if (e.target.classList.contains('prow-ctx')) return;
        openProjectPanel(row.dataset.pid);
      };
    });

    sec.querySelectorAll('.prow-ctx').forEach(function(btn){
      btn.onclick = function(e){
        e.stopPropagation();
        var pid = btn.dataset.pid;
        var p = getProject(pid);
        var r = btn.getBoundingClientRect();
        showCtxMenu(r.right, r.bottom + 4, [
          { icon:'▶️', label:'Open', onClick: function(){ openProjectPanel(pid); }},
          { icon:'✏️', label:'Rename', onClick: function(){
            showInputModal('RENAME PROJECT', 'New name...', p ? p.name : '', function(name){
              renameProject(pid, name); renderSidebarProjects(); toast('Renamed ✓');
            });
          }},
          { icon:'🗑️', label:'Delete', danger:true, onClick: function(){
            if (confirm('Delete "' + (p ? p.name : '') + '"?')) {
              deleteProject(pid); renderSidebarProjects(); toast('Deleted');
            }
          }}
        ]);
      };
    });
  }

  /* ──────────────────────────────────────────────
     NEW PROJECT MODAL
  ────────────────────────────────────────────── */
  function showNewProjectModal() {
    var existing = document.getElementById('newProjModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'newProjModal';
    overlay.className = 'proj-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;padding:16px;';

    var colors = ['#ffd700','#00ff88','#00ccff','#c084fc','#f97316','#ef4444','#3b82f6','#ec4899'];
    var colorSwatches = colors.map(function(c){
      return '<button class="np-clr" data-color="' + c + '" ' +
        'style="width:26px;height:26px;border-radius:50%;background:' + c + ';border:2px solid transparent;' +
        'cursor:pointer;transition:all .2s;flex-shrink:0;" title="' + c + '"></button>';
    }).join('');

    overlay.innerHTML =
      '<div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:20px;' +
        'padding:24px;width:100%;max-width:400px;">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:3px;color:#ffd700;margin-bottom:4px;">📁 NEW PROJECT</div>' +
        '<div style="font-size:10px;color:#443300;font-family:\'Rajdhani\',sans-serif;letter-spacing:2px;margin-bottom:16px;">ORGANIZE YOUR CHATS &amp; FILES</div>' +
        '<input id="np-name" type="text" placeholder="Project name..." ' +
          'style="width:100%;padding:10px 12px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.15);' +
          'border-radius:10px;color:#fff8e7;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:12px;' +
          'font-family:\'DM Sans\',sans-serif;">' +
        '<div style="font-size:10px;color:#443300;font-family:\'Rajdhani\',sans-serif;letter-spacing:2px;margin-bottom:8px;">PICK A COLOR</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + colorSwatches + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="np-cancel" style="flex:1;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);' +
            'border-radius:50px;color:#665500;cursor:pointer;font-size:13px;font-family:\'DM Sans\',sans-serif;">Cancel</button>' +
          '<button id="np-create" style="flex:2;padding:10px;background:linear-gradient(135deg,#ffd700,#ff8c00);' +
            'border:none;border-radius:50px;color:#000;font-weight:700;cursor:pointer;font-size:13px;' +
            'font-family:\'Rajdhani\',sans-serif;letter-spacing:1px;">CREATE PROJECT</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var selectedColor = '#ffd700';
    // Default active
    var defBtn = overlay.querySelector('[data-color="#ffd700"]');
    if (defBtn) defBtn.style.borderColor = '#fff';

    overlay.querySelectorAll('.np-clr').forEach(function(btn){
      btn.onclick = function(){
        overlay.querySelectorAll('.np-clr').forEach(function(b){ b.style.borderColor='transparent'; });
        btn.style.borderColor = '#fff';
        selectedColor = btn.dataset.color;
      };
    });

    document.getElementById('np-cancel').onclick = function(){ overlay.remove(); };
    overlay.onclick = function(e){ if (e.target === overlay) overlay.remove(); };

    document.getElementById('np-create').onclick = function(){
      var name = (document.getElementById('np-name').value || '').trim();
      if (!name) { document.getElementById('np-name').style.borderColor = '#ff4444'; return; }
      createProject(name, selectedColor);
      overlay.remove();
      if (typeof showSection === 'function') showSection('projects');
      renderSidebarProjects();
      toast('Project "' + name + '" created ✓');
    };

    var nameInp = document.getElementById('np-name');
    nameInp.focus();
    nameInp.onkeydown = function(e){
      if (e.key === 'Enter') document.getElementById('np-create').click();
      if (e.key === 'Escape') overlay.remove();
    };
  }

  window.showNewProjectModal = showNewProjectModal;

  /* ──────────────────────────────────────────────
     WIRE EXISTING BUTTONS IN YOUR index.html
  ────────────────────────────────────────────── */
  function wireButtons() {
    var navNewProject = document.getElementById('navNewProject');
    if (navNewProject && !navNewProject._dattaWired) {
      navNewProject._dattaWired = true;
      navNewProject.onclick = function(e){
        e.stopPropagation();
        showNewProjectModal();
      };
    }

    var navProjects = document.getElementById('navProjects');
    if (navProjects && !navProjects._dattaWired) {
      navProjects._dattaWired = true;
      navProjects.onclick = function(){
        if (typeof showSection === 'function') showSection('projects');
        renderSidebarProjects();
        if (window.innerWidth < 900 && typeof closeSidebar === 'function') closeSidebar();
      };
    }
  }

  /* ──────────────────────────────────────────────
     OVERRIDE OLD STUBS IN YOUR index.html
  ────────────────────────────────────────────── */
  window.loadProjects = function(){ renderSidebarProjects(); };
  window.loadProjectsSection = function(){ renderSidebarProjects(); };
  window.createNewProject = function(){ showNewProjectModal(); };
  window.doCreateProject = function(){
    // fallback - handled by modal
    document.getElementById('np-create') && document.getElementById('np-create').click();
  };

  /* ──────────────────────────────────────────────
     PUBLIC API  (window.DattaProjects)
  ────────────────────────────────────────────── */
  window.DattaProjects = {
    getProjects: getProjects,
    getProject: getProject,
    createProject: createProject,
    renameProject: renameProject,
    deleteProject: deleteProject,
    addChat: addChat,
    renameChat: renameChat,
    deleteChat: deleteChat,
    addFile: addFile,
    deleteFile: deleteFile,
    addArtifact: addArtifact,
    deleteArtifact: deleteArtifact,
    openPanel: openProjectPanel,
    renderSidebar: renderSidebarProjects,
    showModal: showNewProjectModal
  };

  /* ──────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────── */
  function init() {
    wireButtons();
    // Render if projects section is visible
    var sec = document.getElementById('section-projects');
    if (sec && sec.style.display !== 'none') renderSidebarProjects();

    // Watch DOM for late-loaded elements
    if (window.MutationObserver) {
      var obs = new MutationObserver(function(){
        var btn = document.getElementById('navNewProject');
        if (btn && !btn._dattaWired) wireButtons();
      });
      obs.observe(document.body, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
