// ─────────────────────────────────────────────────────────────────
// THEME SYSTEM
// CSS variables injected once → all components use T tokens
// Toggle: body.light-mode → light theme
// ─────────────────────────────────────────────────────────────────

export const THEME_CSS = `
  /* ── Dark (default) ─────────────────────────────────── */
  :root {
    --yb-bg:       #000000;
    --yb-bg2:      #111111;
    --yb-surface:  #1c1c1e;
    --yb-surface2: #2c2c2e;
    --yb-border:   #3a3a3c;
    --yb-text:     #ffffff;
    --yb-text2:    rgba(255,255,255,0.75);
    --yb-sub:      #8e8e93;
    --yb-muted:    #636366;
    --yb-inp:      #2c2c2e;
    --yb-inp-border:#3a3a3c;
    --yb-header:   rgba(17,17,17,0.95);
    --yb-accent:   #f59e0b;
    --yb-accent-fg:#1c1917;
  }

  /* ── Light ───────────────────────────────────────────── */
  body.light-mode {
    --yb-bg:       #f2f2f7;
    --yb-bg2:      #ffffff;
    --yb-surface:  #ffffff;
    --yb-surface2: #f2f2f7;
    --yb-border:   #d1d1d6;
    --yb-text:     #000000;
    --yb-text2:    rgba(0,0,0,0.75);
    --yb-sub:      #6e6e73;
    --yb-muted:    #8e8e93;
    --yb-inp:      #f2f2f7;
    --yb-inp-border:#d1d1d6;
    --yb-header:   rgba(242,242,247,0.95);
    --yb-accent:   #d97706;
    --yb-accent-fg:#ffffff;
  }

  /* ── Utility classes that use variables ─────────────── */
  .yb-bg       { background-color: var(--yb-bg); }
  .yb-bg2      { background-color: var(--yb-bg2); }
  .yb-surface  { background-color: var(--yb-surface); }
  .yb-surface2 { background-color: var(--yb-surface2); }
  .yb-border   { border: 1px solid var(--yb-border); }
  .yb-text     { color: var(--yb-text); }
  .yb-sub      { color: var(--yb-sub); }
  .yb-muted    { color: var(--yb-muted); }
  .yb-accent   { color: var(--yb-accent); }
  .yb-inp      { background-color: var(--yb-inp); border-color: var(--yb-inp-border); }
  .yb-header   { background-color: var(--yb-header); border-color: var(--yb-border); }
`;

// ── Theme persistence ─────────────────────────────────────────
const KEY = "yb_theme";

export function loadTheme() {
  const saved = localStorage.getItem(KEY) || "dark";
  applyTheme(saved);
  return saved;
}

export function applyTheme(mode) {
  document.body.classList.toggle("light-mode", mode === "light");
}

export function saveTheme(mode) {
  localStorage.setItem(KEY, mode);
  applyTheme(mode);
}

export function toggleTheme(current) {
  const next = current === "dark" ? "light" : "dark";
  saveTheme(next);
  return next;
}

// Inject CSS once
export function injectThemeCSS() {
  if (document.getElementById("yb-theme")) return;
  const el = document.createElement("style");
  el.id = "yb-theme";
  el.textContent = THEME_CSS;
  document.head.appendChild(el);
}
