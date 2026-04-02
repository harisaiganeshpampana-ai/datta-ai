/* =====================================================
   DATTA AI — THEME SYSTEM
   3 themes: dark | light | eye
   Applied via: body[data-theme="..."]
   ===================================================== */

/* ── DARK (default) ── */
:root, [data-theme="dark"] {
  --bg:      #0d0d0f;
  --bg2:     #111117;
  --bg3:     #1a1a22;
  --text:    #e8e8f0;
  --text2:   #9898b8;
  --text3:   #55556a;
  --border:  rgba(255,255,255,0.08);
  --card:    rgba(255,255,255,0.04);
  --input:   rgba(255,255,255,0.05);
  --accent:  #00c9a7;
  --accent2: #0077ff;
}

/* ── LIGHT ── */
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

/* ── EYE COMFORT ── */
[data-theme="eye"] {
  --bg:      #1a1a0e;
  --bg2:     #222212;
  --bg3:     #2c2c18;
  --text:    #e8e0c0;
  --text2:   #b8a880;
  --text3:   #787848;
  --border:  rgba(200,180,100,0.14);
  --card:    rgba(200,180,100,0.05);
  --input:   rgba(200,180,100,0.06);
  --accent:  #c8a030;
  --accent2: #a07820;
}

/* ── BASE ── */
body { background: var(--bg); color: var(--text); }

/* ── LIGHT THEME FIXES — no glass, full contrast ── */
[data-theme="light"] .topbar { box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
[data-theme="light"] .sidebar { box-shadow: 2px 0 8px rgba(0,0,0,0.06); }
[data-theme="light"] .inputWrap { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
[data-theme="light"] .aiBubble { box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
[data-theme="light"] .welcomeTitle {
  background: linear-gradient(135deg, #111827 30%, #059669);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
[data-theme="light"] .menuBtn, [data-theme="light"] .tbBtn { color: #374151; }
[data-theme="light"] #message { color: #111827; }
[data-theme="light"] #message::placeholder { color: #9ca3af; }
[data-theme="light"] pre { background: #f8fafc; }
[data-theme="light"] .themeBtn, [data-theme="light"] .fontBtn { color: #374151; }

/* ── EYE THEME FIXES ── */
[data-theme="eye"] .welcomeTitle {
  background: linear-gradient(135deg, #e8e0c0 30%, #c8a030);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* ── SPLASH ── */
#splash {
  position: fixed; inset: 0; background: #0d0d0f;
  display: flex; align-items: center; justify-content: center;
  z-index: 99999; transition: opacity 0.7s;
}
#splash.hide { opacity: 0; pointer-events: none; }
.splashContent { text-align: center; }
.splashLogo { width: 64px; height: 64px; margin-bottom: 16px; border-radius: 16px; }
.splashName { font-size: 24px; font-weight: 700; color: #e8e8f0; letter-spacing: 4px; margin-bottom: 8px; }
.splashTagline { font-size: 14px; color: #55556a; letter-spacing: 1px; }
