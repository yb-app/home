// ─────────────────────────────────────────────────────────────────
// TYPED STATE — every field defined, never undefined
// Used as initialState in useAppState hook
// ─────────────────────────────────────────────────────────────────

export const INIT = {
  // ── Auth ────────────────────────────────────────────────────
  shipper: null,  // { phone, name, role, ts }
  theme:  "dark", // "dark" | "light"

  // ── Navigation ──────────────────────────────────────────────
  tab:    "feeds",
  detail: null,   // product for full-screen view

  // ── Cart ────────────────────────────────────────────────────
  cart:      [],  // [{ product, qty }]
  showCart:  false,

  // ── Products ────────────────────────────────────────────────
  products: {
    items:    [],
    loading:  false,
    total:    0,
    page:     1,
    pageSize: 20,
    search:   "",
    category: "all",
    source:   "",      // "kv" | "db" | ""
    msg:      { text: "", type: "" },
  },

  // ── Orders ──────────────────────────────────────────────────
  orders: {
    items:    [],
    loading:  false,
    filter:   "pending",   // "pending" | "done"
    msg:      { text: "", type: "" },
  },

  // ── Stats ───────────────────────────────────────────────────
  stats: {
    loading: true,
    orders: {
      total:      0,
      pending:    0,
      delivering: 0,
      completed:  0,
      cancelled:  0,
      today:      0,
    },
    revenue: {
      total:  "0.00",
      paid:   "0.00",
      unpaid: "0.00",
      today:  "0.00",
    },
    products: {
      total:     0,
      published: 0,
      low_stock: 0,
      out_stock: 0,
    },
    customers: {
      total:     0,
      new_today: 0,
    },
    msg: { text: "", type: "" },
  },

  // ── Customer profile ────────────────────────────────────────
  customer: {
    profile:  null,
    orders:   [],
    summary:  {
      order_count:  0,
      total_spent:  0,
      unpaid_count: 0,
      first_order:  null,
      last_order:   null,
    },
    loading:  false,
    phone:    "",
    msg:      { text: "", type: "" },
  },

  // ── Toast / notifications ────────────────────────────────────
  toast: { show: false, text: "", type: "" },
};
