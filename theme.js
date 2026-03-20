// ── DATTA AI THEME SYSTEM ─────────────────────────────────────────────────────

const THEMES = {
  dark:     { name:'Dark',     emoji:'🌑', label:'Dark',     bg:'#080800' },
  light:    { name:'Light',    emoji:'☀️', label:'Light',    bg:'#ffffff' },
  gray:     { name:'Gray',     emoji:'🩶', label:'Gray',     bg:'#1e1e1e' },
  midnight: { name:'Midnight', emoji:'🌌', label:'Midnight', bg:'#0a0f1e' },
  sepia:    { name:'Sepia',    emoji:'📜', label:'Sepia',    bg:'#f4ede4' },
}

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.dark
  document.documentElement.setAttribute('data-theme', themeName)
  localStorage.setItem('datta_theme', themeName)
  
  // Update topbar theme button if exists
  const btn = document.getElementById('themeBtn')
  if (btn) btn.textContent = theme.emoji

  // Update settings toggle if exists
  const select = document.getElementById('themeSelect')
  if (select) select.value = themeName

  // Apply accent color
  const accent = localStorage.getItem('datta_accent') || '#ffd700'
  document.documentElement.style.setProperty('--accent', accent)
}

function getCurrentTheme() {
  return localStorage.getItem('datta_theme') || 'dark'
}

function cycleTheme() {
  const keys = Object.keys(THEMES)
  const current = getCurrentTheme()
  const idx = keys.indexOf(current)
  const next = keys[(idx + 1) % keys.length]
  applyTheme(next)
  showThemeToast(next)
}

function showThemeToast(themeName) {
  const theme = THEMES[themeName]
  let toast = document.getElementById('themeToast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'themeToast'
    toast.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:var(--card-bg);border:1px solid var(--border);border-radius:50px;padding:8px 18px;font-family:Rajdhani,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;color:var(--accent);z-index:9999;white-space:nowrap;box-shadow:0 4px 20px var(--shadow);transition:opacity 0.3s;'
    document.body.appendChild(toast)
  }
  toast.textContent = theme.emoji + ' ' + theme.label + ' mode'
  toast.style.opacity = '1'
  toast.style.display = 'block'
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.style.display='none', 300) }, 2000)
}

function showThemePicker() {
  document.getElementById('themePickerOverlay')?.remove()

  const overlay = document.createElement('div')
  overlay.id = 'themePickerOverlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);'
  
  const current = getCurrentTheme()
  
  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:24px 24px 0 0;padding:20px;width:100%;max-width:500px;animation:slideUp 0.2s ease;">
      <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--accent);margin-bottom:16px;text-align:center;">🎨 CHOOSE THEME</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">
        ${Object.entries(THEMES).map(([key, t]) => `
          <div onclick="applyTheme('${key}');document.getElementById('themePickerOverlay').remove();showThemeToast('${key}')" 
            style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;
            background:${key===current?'rgba(255,215,0,0.1)':'var(--card-bg)'};
            border:2px solid ${key===current?'var(--accent)':'var(--border)'};
            border-radius:14px;cursor:pointer;transition:all 0.2s;">
            <div style="width:32px;height:32px;border-radius:50%;background:${t.bg};border:2px solid var(--border);"></div>
            <span style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:1px;color:${key===current?'var(--accent)':'var(--text2)'};">${t.label}</span>
            <span style="font-size:16px;">${t.emoji}</span>
          </div>`).join('')}
      </div>
      <button onclick="document.getElementById('themePickerOverlay').remove()" 
        style="width:100%;padding:12px;background:none;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">
        Close
      </button>
    </div>
  `
  
  overlay.onclick = e => { if(e.target===overlay) overlay.remove() }
  document.body.appendChild(overlay)
}

// Apply theme on load
(function() {
  const saved = localStorage.getItem('datta_theme') || 'dark'
  const accent = localStorage.getItem('datta_accent') || '#ffd700'
  document.documentElement.setAttribute('data-theme', saved)
  document.documentElement.style.setProperty('--accent', accent)
})()

// Export
window.applyTheme = applyTheme
window.cycleTheme = cycleTheme
window.showThemePicker = showThemePicker
window.getCurrentTheme = getCurrentTheme
window.THEMES = THEMES
