export const API_URL = "https://mr.yinboran.workers.dev";
export const STORE   = "yb9999";

export const TAB = {
  FEEDS:     "feeds",
  CATALOGS:  "catalogs",
  DASHBOARD: "dashboard",
  ORDERS:    "orders",
  MENU:      "menu",
};

export const ORDER_STATUS = { COD: "cod", PAID: "paid" };
export const MEDIA_TYPE   = { IMAGE: "img", VIDEO: "vid" };

// ── Design tokens — CSS variable backed ──────────────────────
// All colors adapt to light/dark via yb-* CSS classes (from theme.js)
export const T = {
  // backgrounds
  bg:       "yb-bg",
  bg2:      "yb-bg2",
  surface:  "yb-surface",
  surface2: "yb-surface2",

  // text
  text:     "yb-text",
  sub:      "yb-sub",
  muted:    "yb-muted",
  accent:   "yb-accent",

  // borders + inputs
  border:   "yb-border",
  inp:      "yb-inp",
  header:   "yb-header backdrop-blur-sm border-b",

  // status (always same, not theme-dependent)
  paid:     "bg-emerald-900/50 text-emerald-400",
  cod:      "bg-amber-900/50  text-amber-400",
  low:      "bg-amber-900/50  text-amber-400",
  out:      "bg-rose-900/50   text-rose-400",
  good:     "bg-emerald-900/50 text-emerald-400",

  // action buttons — always amber
  pill:     "bg-amber-400 text-stone-900 font-bold rounded-full",
  pillBtn:  "bg-amber-500 text-stone-900 font-semibold rounded-full",
};

export const HDR_H = "calc(env(safe-area-inset-top,0px) + 50px)";
