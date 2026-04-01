/* ════════════════════════════════════════════════
   CLEAN THEME SYSTEM — 3 themes only
   dark | light | eye
   Applied via: document.body.setAttribute("data-theme", "...")
   ════════════════════════════════════════════════ */

/* ── CSS VARIABLES ── */
:root {
  --bg:       #0d0d0f;
  --bg2:      #111117;
  --bg3:      #1a1a20;
  --text:     #e8e8f0;
  --text2:    #aaaacc;
  --text3:    #666688;
  --border:   rgba(255,255,255,0.08);
  --card:     rgba(255,255,255,0.04);
  --accent:   #00c9a7;
  --accent2:  #0077ff;
  --input-bg: rgba(255,255,255,0.05);
}

[data-theme="dark"] {
  --bg:       #0d0d0f;
  --bg2:      #111117;
  --bg3:      #1a1a20;
  --text:     #e8e8f0;
  --text2:    #aaaacc;
  --text3:    #666688;
  --border:   rgba(255,255,255,0.08);
  --card:     rgba(255,255,255,0.04);
  --accent:   #00c9a7;
  --accent2:  #0077ff;
  --input-bg: rgba(255,255,255,0.05);
}

[data-theme="light"] {
  --bg:       #f8fafc;
  --bg2:      #ffffff;
  --bg3:      #f1f5f9;
  --text:     #111827;
  --text2:    #374151;
  --text3:    #6b7280;
  --border:   #e5e7eb;
  --card:     #ffffff;
  --accent:   #059669;
  --accent2:  #2563eb;
  --input-bg: #ffffff;
}

[data-theme="eye"] {
  --bg:       #1a1a0a;
  --bg2:      #222210;
  --bg3:      #2a2a14;
  --text:     #e8e0c8;
  --text2:    #b8a888;
  --text3:    #786848;
  --border:   rgba(200,180,100,0.15);
  --card:     rgba(200,180,100,0.05);
  --accent:   #c8a030;
  --accent2:  #a07820;
  --input-bg: rgba(200,180,100,0.06);
}

/* ── APPLY VARIABLES TO ALL ELEMENTS ── */

body {
  background: var(--bg) !important;
  color: var(--text) !important;
}

/* Sidebar */
.sidebar {
  background: var(--bg2) !important;
  border-right: 1px solid var(--border) !important;
}
.sidebarBrand, .profileName, .chatTitle {
  color: var(--text) !important;
}
.profileSub, .chatItem .chatIcon {
  color: var(--text3) !important;
}
.chatItem:hover, .chatItem.active {
  background: var(--card) !important;
}
.newChatBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}
.newChatBtn:hover {
  background: var(--bg3) !important;
}

/* Topbar */
.topbar {
  background: var(--bg2) !important;
  border-bottom: 1px solid var(--border) !important;
}
.topTitle, .topLogoText {
  color: var(--text) !important;
}
.topIconBtn, .menuBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}

/* Main chat area */
.main {
  background: var(--bg) !important;
}
.chat {
  background: var(--bg) !important;
}

/* Messages */
.aiBubble {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.userBubble {
  background: var(--bg3) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}

/* Light & Eye: remove glass/transparency on bubbles */
[data-theme="light"] .aiBubble,
[data-theme="eye"] .aiBubble {
  background: var(--card) !important;
  backdrop-filter: none !important;
}
[data-theme="light"] .userBubble,
[data-theme="eye"] .userBubble {
  background: var(--bg3) !important;
  backdrop-filter: none !important;
}

/* Input area */
.inputArea {
  background: linear-gradient(to top, var(--bg) 60%, transparent) !important;
}
.inputWrap {
  background: var(--input-bg) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.inputWrap:focus-within {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent) !important;
}
#message {
  color: var(--text) !important;
  background: transparent !important;
}
#message::placeholder {
  color: var(--text3) !important;
}

/* Model pill */
#activeModelPill {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}

/* Send button */
.actionMainBtn.send-state {
  background: linear-gradient(135deg, var(--accent), var(--accent2)) !important;
}

/* Plus & mic buttons */
.plusBtn, .micBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}

/* Welcome screen */
.welcomeScreen {
  background: transparent !important;
}
.welcomeSub {
  color: var(--text3) !important;
}
.suggCard {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
}
.suggCard:hover {
  background: var(--bg3) !important;
  border-color: var(--accent) !important;
}
.suggText {
  color: var(--text2) !important;
}

/* Settings modal */
.modalBox, .settingsModal .modalBox {
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.sTab {
  color: var(--text3) !important;
  border-bottom: 1px solid var(--border) !important;
}
.sTab.active {
  color: var(--accent) !important;
  border-bottom: 2px solid var(--accent) !important;
}
.sLabel {
  color: var(--text3) !important;
}
.settingsInput, .sInput {
  background: var(--input-bg) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.settingsInput:focus, .sInput:focus {
  border-color: var(--accent) !important;
}

/* Theme buttons in settings */
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
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.themeBtn:hover {
  background: var(--bg3);
  color: var(--text);
}
.themeBtn.active {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #fff !important;
  font-weight: 600;
}

/* Model dropdown */
#modelDropdown {
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
}
.modelDropItem {
  color: var(--text) !important;
}
.modelDropItem:hover, .modelDropItem.active {
  background: var(--card) !important;
}

/* Notes panel */
#notesPanel {
  background: var(--bg2) !important;
  border-left: 1px solid var(--border) !important;
}
.notesTextarea {
  background: transparent !important;
  color: var(--text) !important;
}
.notesTextarea::placeholder {
  color: var(--text3) !important;
}
.notesPanelTitle {
  color: var(--text) !important;
}
.notesPanelBtn {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text2) !important;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

/* Light theme special fixes */
[data-theme="light"] body,
[data-theme="light"] .main,
[data-theme="light"] .chat {
  background: #f8fafc !important;
}
[data-theme="light"] .topbar {
  background: #ffffff !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
}
[data-theme="light"] .sidebar {
  background: #ffffff !important;
  box-shadow: 2px 0 8px rgba(0,0,0,0.06) !important;
}
[data-theme="light"] .inputArea {
  background: linear-gradient(to top, #f8fafc 60%, transparent) !important;
}
[data-theme="light"] .inputWrap {
  background: #ffffff !important;
  box-shadow: 0 1px 6px rgba(0,0,0,0.1) !important;
}
[data-theme="light"] .aiBubble {
  background: #ffffff !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
}
[data-theme="light"] .userBubble {
  background: #e8f8f4 !important;
  border-color: #c8e8e0 !important;
  color: #0f3028 !important;
}
[data-theme="light"] .welcomeTitle {
  background: linear-gradient(135deg, #111827 30%, #059669) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}
[data-theme="light"] .suggCard {
  box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
}
[data-theme="light"] #message {
  color: #111827 !important;
}
[data-theme="light"] #message::placeholder {
  color: #9ca3af !important;
}
[data-theme="light"] .chatTitle {
  color: #374151 !important;
}
[data-theme="light"] .profileName {
  color: #111827 !important;
}

/* Eye comfort special */
[data-theme="eye"] .welcomeTitle {
  background: linear-gradient(135deg, #e8e0c8 30%, #c8a030) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}
