// theme.js — Datta AI Theme Engine
(function() {
  const DEFAULT = '#ffd700';

  function hexToRgb(hex) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(x=>x+x).join('');
    const n = parseInt(hex, 16);
    return [(n>>16)&255,(n>>8)&255,n&255].join(',');
  }

  function applyColor(color) {
    if (!color || color === 'undefined') color = DEFAULT;
    const r = document.documentElement;
    r.style.setProperty('--accent', color);
    r.style.setProperty('--accent-rgb', hexToRgb(color));
    r.style.setProperty('--accent-dark', `rgba(${hexToRgb(color)},0.08)`);
    r.style.setProperty('--accent-mid',  `rgba(${hexToRgb(color)},0.20)`);
    r.style.setProperty('--accent-glow', `rgba(${hexToRgb(color)},0.35)`);
    r.style.setProperty('--accent-border',`rgba(${hexToRgb(color)},0.25)`);
  }

  function saveAndApply(color) {
    localStorage.setItem('datta_accent', color);
    applyColor(color);
    document.querySelectorAll('.presetColor').forEach(b => {
      b.classList.toggle('active', b.dataset.color === color);
    });
    document.querySelectorAll('#accentColorPicker,#accentColorPickerSettings').forEach(el => {
      if (el) el.value = color;
    });
  }

  // Apply immediately to prevent color flash
  applyColor(localStorage.getItem('datta_accent') || DEFAULT);

  window.dattaTheme = { saveAndApply, applyColor, DEFAULT };

  document.addEventListener('DOMContentLoaded', function() {
    const color = localStorage.getItem('datta_accent') || DEFAULT;
    saveAndApply(color);

    // Dark/light theme
    const theme = localStorage.getItem('datta_theme') || 'dark';
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme','light');
    }

    // Font size
    const fontSizes = { small:'13px', medium:'15px', large:'17px' };
    document.body.style.fontSize = fontSizes[localStorage.getItem('datta_font')] || '15px';
  });
})();
