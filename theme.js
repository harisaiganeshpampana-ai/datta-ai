/* ═══════════════════════════════════════════
   DATTA AI — THEME COLOR SYSTEM
   Default: Gold #ffd700
   Saves to localStorage as 'datta_accent'
═══════════════════════════════════════════ */

(function() {
  const DEFAULT = '#ffd700';

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function applyAccent(color) {
    const rgb = hexToRgb(color);
    const r = document.documentElement;

    // Derive darker shade for backgrounds
    const dark = color + '22';
    const mid  = color + '44';

    r.style.setProperty('--accent',       color);
    r.style.setProperty('--accent-rgb',   rgb);
    r.style.setProperty('--accent-dark',  `rgba(${rgb},0.08)`);
    r.style.setProperty('--accent-mid',   `rgba(${rgb},0.20)`);
    r.style.setProperty('--accent-glow',  `rgba(${rgb},0.35)`);
    r.style.setProperty('--accent-border',`rgba(${rgb},0.25)`);

    // Update picker UI if open
    const picker = document.getElementById('accentColorPicker');
    if (picker) picker.value = color;

    // Update active preset button
    document.querySelectorAll('.presetColor').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });
  }

  function saveAndApply(color) {
    localStorage.setItem('datta_accent', color);
    applyAccent(color);
  }

  function loadAccent() {
    const saved = localStorage.getItem('datta_accent') || DEFAULT;
    applyAccent(saved);
  }

  // Expose globally
  window.dattaTheme = { applyAccent, saveAndApply, loadAccent, DEFAULT };

  // Auto-load on script execution
  loadAccent();
})();
