/* ================================================
   DATTA AI — CLEAN THEME SYSTEM
   3 themes only: dark | light | eye
   Method: body[data-theme] + CSS variables
   ================================================ */

/* ── DEFAULTS (dark) ── */
:root {
  --bg:      #0d0d0f;
  --bg2:     #111117;
  --bg3:     #1a1a22;
  --text:    #e8e8f0;
  --text2:   #9999bb;
  --text3:   #55556a;
  --border:  rgba(255,255,255,0.08);
  --card:    rgba(255,255,255,0.04);
  --input:   rgba(255,255,255,0.05);
  --accent:  #00c9a7;
  --accent2: #0077ff;
}

[data-theme="dark"] {
  --bg:      #0d0d0f;
  --bg2:     #111117;
  --bg3:     #1a1a22;
  --text:    #e8e8f0;
  --text2:   #9999bb;
  --text3:   #55556a;
  --border:  rgba(255,255,255,0.08);
  --card:    rgba(255,255,255,0.04);
  --input:   rgba(255,255,255,0.05);
  --accent:  #00c9a7;
  --accent2: #0077ff;
}

[data-theme="light"] {
  --bg:      #f8fafc;
  --bg2:     #ffffff;
  --bg3:     #f1f5f9;
  --text:    #111827;
  --text2:   #374151;
  --text3:   #6b7280;
  --border:  #e5e7eb;
  --card:    #ffffff;
  --input:   #ffffff;
  --accent:  #059669;
  --accent2: #2563eb;
}

[data-theme="eye"] {
  --bg:      #0f170a;
  --bg2:     #141f0d;
  --bg3:     #1a2a12;
  --text:    #d1fae5;
  --text2:   #86efac;
  --text3:   #4ade80;
  --border:  rgba(74,222,128,0.15);
  --card:    rgba(74,222,128,0.05);
  --input:   rgba(74,222,128,0.06);
  --accent:  #34d399;
  --accent2: #059669;
}

/* ── APPLY TO EVERYTHING ── */
body {
  background: var(--bg) !important;
  color: var(--text) !important;
}

/* Topbar */
.topbar {
  background: var(--bg2) !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.topTitle, .topLogoText, .sidebarBrand {
  color: var(--text) !important;
}
.menuBtn, .topIconBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}
.menuBtn:hover, .topIconBtn:hover {
  background: var(--bg3) !important;
  color: var(--text) !important;
}

/* Sidebar */
.sidebar {
  background: var(--bg2) !important;
  border-right: 1px solid var(--border) !important;
}
.profileName { color: var(--text) !important; }
.profileSub  { color: var(--text3) !important; }
.chatItem    { color: var(--text2) !important; }
.chatItem:hover, .chatItem.active {
  background: var(--bg3) !important;
  color: var(--text) !important;
}
.newChatBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}
.newChatBtn:hover { background: var(--bg3) !important; }

/* Main & Chat */
.main, .chat, .chatWrapper {
  background: var(--bg) !important;
}

/* Messages */
.aiBubble {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
  backdrop-filter: none !important;
}
.userBubble {
  background: var(--bg3) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
  backdrop-filter: none !important;
}

/* Input area */
.inputArea {
  background: linear-gradient(to top, var(--bg) 55%, transparent) !important;
}
.inputWrap {
  background: var(--input) !important;
  border: 1px solid var(--border) !important;
}
.inputWrap:focus-within {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent) !important;
}
#message {
  color: var(--text) !important;
  caret-color: var(--accent) !important;
  background: transparent !important;
}
#message::placeholder { color: var(--text3) !important; }

/* Buttons inside input */
.plusBtn, .micBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}
#activeModelPill {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}
.actionMainBtn.send-state {
  background: linear-gradient(135deg, var(--accent), var(--accent2)) !important;
}

/* Welcome screen */
.suggCard {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
}
.suggCard:hover {
  background: var(--bg3) !important;
  border-color: var(--accent) !important;
}
.suggText  { color: var(--text2) !important; }
.welcomeSub { color: var(--text3) !important; }

/* Settings modal */
.modalBox {
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.sTab {
  color: var(--text3) !important;
}
.sTab.active {
  color: var(--accent) !important;
  border-bottom-color: var(--accent) !important;
}
.sLabel, .sSection .sLabel {
  color: var(--text3) !important;
}
input[type="text"], input[type="email"],
input[type="password"], textarea, select,
.settingsInput, .sInput, .formInput {
  background: var(--input) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
input[type="text"]:focus, input[type="email"]:focus,
input[type="password"]:focus, textarea:focus,
.settingsInput:focus, .sInput:focus {
  border-color: var(--accent) !important;
  outline: none !important;
}

/* Notes */
#notesPanel {
  background: var(--bg2) !important;
  border-left: 1px solid var(--border) !important;
}
.notesTextarea {
  background: transparent !important;
  color: var(--text) !important;
}
.notesTextarea::placeholder { color: var(--text3) !important; }
.notesPanelTitle            { color: var(--text) !important; }
.notesPanelBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}

/* Model dropdown */
#modelDropdown {
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
}
.modelDropItem { color: var(--text) !important; }
.modelDropItem:hover, .modelDropItem.active {
  background: var(--bg3) !important;
}

/* ── TOP THEME SWITCHER ── */
.topThemeSwitch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
}
.topThemeBtn {
  padding: 5px 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text3);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.topThemeBtn:hover {
  background: var(--card);
  color: var(--text);
}
.topThemeBtn.active {
  background: var(--accent) !important;
  color: #fff !important;
  font-weight: 600;
}

/* Settings theme buttons */
.themeOptions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.themeBtn {
  padding: 8px 18px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text2);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.themeBtn:hover { background: var(--bg3); color: var(--text); }
.themeBtn.active {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #fff !important;
  font-weight: 600;
}

/* ── LIGHT THEME CRITICAL FIXES ── */
[data-theme="light"] body { background: #f8fafc !important; }
[data-theme="light"] .topbar {
  background: #ffffff !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
  border-bottom: 1px solid #e5e7eb !important;
}
[data-theme="light"] .sidebar {
  background: #ffffff !important;
  box-shadow: 2px 0 8px rgba(0,0,0,0.06) !important;
  border-right: 1px solid #e5e7eb !important;
}
[data-theme="light"] .aiBubble {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  color: #111827 !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important;
  backdrop-filter: none !important;
}
[data-theme="light"] .userBubble {
  background: #ecfdf5 !important;
  border: 1px solid #d1fae5 !important;
  color: #065f46 !important;
  backdrop-filter: none !important;
}
[data-theme="light"] .inputWrap {
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
}
[data-theme="light"] #message { color: #111827 !important; }
[data-theme="light"] #message::placeholder { color: #9ca3af !important; }
[data-theme="light"] .inputArea {
  background: linear-gradient(to top, #f8fafc 55%, transparent) !important;
}
[data-theme="light"] .suggCard {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important;
}
[data-theme="light"] .suggCard:hover {
  background: #f0fdf4 !important;
  border-color: #059669 !important;
}
[data-theme="light"] .topThemeSwitch {
  background: #f1f5f9 !important;
  border-color: #e5e7eb !important;
}
[data-theme="light"] .chatTitle { color: #374151 !important; }
[data-theme="light"] .newChatBtn {
  background: #f1f5f9 !important;
  border-color: #e5e7eb !important;
  color: #374151 !important;
}
[data-theme="light"] .menuBtn,
[data-theme="light"] .topIconBtn {
  background: #f1f5f9 !important;
  border-color: #e5e7eb !important;
  color: #374151 !important;
}
[data-theme="light"] .welcomeTitle {
  background: linear-gradient(135deg, #111827 30%, #059669) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
}
[data-theme="light"] #modelDropdown {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1) !important;
}
[data-theme="light"] .modalBox {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
