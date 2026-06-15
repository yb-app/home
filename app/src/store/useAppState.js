// ─────────────────────────────────────────────────────────────────
// useAppState — root state hook
// Single source of truth for the entire app
// Provides: state, set, actions (api-coupled)
// ─────────────────────────────────────────────────────────────────
import { useState, useCallback, useEffect } from "react";
import { INIT } from "./state";
import { api } from "../api";
import { injectThemeCSS, loadTheme, toggleTheme } from "../theme";

const SESSION_TTL = 12 * 60 * 60 * 1000;
const SESSION_KEY = "yb_session";

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    if (!s.phone) return null;
    if (Date.now() - (s.ts || 0) > SESSION_TTL) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (_) { return null; }
}

export function useAppState() {
  const [s, set_] = useState(INIT);

  // patch helper — deep merge one level
  const set = useCallback((patch) =>
    set_((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })), []);

  const setNested = useCallback((key, patch) =>
    set_((prev) => ({ ...prev, [key]: { ...prev[key], ...(typeof patch === "function" ? patch(prev[key]) : patch) } })), []);

  // ── Boot ──────────────────────────────────────────────────
  useEffect(() => {
    injectThemeCSS();
    const theme = loadTheme();
    const shipper = loadSession();
    set({ theme, shipper });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/home/sw.js", { scope: "/home/" })
    }
    const onOnline = () => {
      navigator.serviceWorker?.controller?.postMessage({ type: "RECONNECT_EVICT", viewMap: {} });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // ── Toast ─────────────────────────────────────────────────
  const showToast = useCallback((text, type = "success") => {
    set({ toast: { show: true, text, type } });
    setTimeout(() => set({ toast: { show: false, text: "", type: "" } }), 2800);
  }, []);

  // ── Theme ─────────────────────────────────────────────────
  const handleToggleTheme = useCallback(() => {
    set((prev) => {
      const next = toggleTheme(prev.theme);
      return { theme: next };
    });
  }, []);

  // ── Auth ──────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    set({ shipper: null });
  }, []);

  // ── Products ──────────────────────────────────────────────
  const loadProducts = useCallback(async (params = {}) => {
    setNested("products", { loading: true, msg: { text: "", type: "" } });
    try {
      const query = new URLSearchParams({ view: "public", ...params }).toString();
      const r = await api.get(`/api/products?${query}`);
      setNested("products", {
        items:   r.data || [],
        loading: false,
        total:   r.meta?.total || (r.data || []).length,
        source:  r.source || "",
        msg:     r.msg || { text: "", type: "" },
      });
    } catch (e) {
      setNested("products", { loading: false, msg: { text: e.message, type: "error" } });
    }
  }, []);

  // ── Orders ────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setNested("orders", { loading: true, msg: { text: "", type: "" } });
    try {
      const r = await api.get("/api/orders");
      setNested("orders", {
        items:   r.data || [],
        loading: false,
        msg:     r.msg || { text: "", type: "" },
      });
    } catch (e) {
      setNested("orders", { loading: false, msg: { text: e.message, type: "error" } });
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setNested("stats", { loading: true });
    try {
      const r = await api.get("/api/stats?type=all");
      setNested("stats", {
        ...INIT.stats,
        ...(r.data || {}),
        loading: false,
        msg: r.msg || { text: "", type: "" },
      });
    } catch (e) {
      setNested("stats", { loading: false, msg: { text: e.message, type: "error" } });
    }
  }, []);

  // ── Customer ──────────────────────────────────────────────
  const loadCustomer = useCallback(async (phone) => {
    if (!phone) return;
    setNested("customer", { loading: true, phone, msg: { text: "", type: "" } });
    try {
      const r = await api.get(`/api/customer/${phone}`);
      setNested("customer", {
        profile:  r.data?.profile  || null,
        orders:   r.data?.orders   || [],
        summary:  r.data?.summary  || INIT.customer.summary,
        loading:  false,
        msg:      r.msg || { text: "", type: "" },
      });
    } catch (e) {
      setNested("customer", { loading: false, msg: { text: e.message, type: "error" } });
    }
  }, []);

  // ── Cart ──────────────────────────────────────────────────
  const addToCart = useCallback((product, qty = 1) => {
    set((prev) => {
      const idx = prev.cart.findIndex(
        (i) => i.product.id === product.id || i.product.code === product.code
      );
      if (idx >= 0) {
        const next = [...prev.cart];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return { cart: next };
      }
      return { cart: [...prev.cart, { product, qty }] };
    });
  }, []);

  const removeFromCart = useCallback((idx) =>
    set((prev) => ({ cart: prev.cart.filter((_, j) => j !== idx) })), []);

  const changeCartQty = useCallback((idx, qty) => {
    if (qty <= 0) { removeFromCart(idx); return; }
    set((prev) => {
      const next = [...prev.cart];
      next[idx] = { ...next[idx], qty };
      return { cart: next };
    });
  }, [removeFromCart]);

  const cartCount = s.cart.reduce((sum, i) => sum + i.qty, 0);

  return {
    s, set, setNested, cartCount, showToast,
    // actions
    handleToggleTheme, handleLogout,
    loadProducts, loadOrders, loadStats, loadCustomer,
    addToCart, removeFromCart, changeCartQty,
  };
}
