// ─────────────────────────────────────────────────────────────────
// FORM SCHEMAS — single source of truth for all forms
// + Dynamic attributes builder for product metadata
// ─────────────────────────────────────────────────────────────────

// ── ORDER SCHEMA ─────────────────────────────────────────────
export const ORDER_SCHEMA = {
  endpoint: "/api/orders",
  method:   "POST",
  initial: {
    customer_name:     "",
    customer_phone:    "",
    customer_location: "",
    payment_method:    "cod",
  },
  fields: [
    { key: "customer_name",     label: "Name",     type: "text", col: 12, placeholder: "Customer name",          validate: { required: true, maxLen: 100, msg: "Name required"           } },
    { key: "customer_phone",    label: "Phone",    type: "tel",  col: 12, placeholder: "0xx xxx xxx",            validate: { required: true, phone: true,  msg: "Phone: 0xx xxx xxxx"   } },
    { key: "customer_location", label: "Location", type: "text", col: 12, placeholder: "Village, District, Province", validate: { required: true, maxLen: 200, msg: "Location required" } },
  ],
};

// ── PRODUCT SCHEMA ────────────────────────────────────────────
export const PRODUCT_SCHEMA = {
  endpoint: "/api/products",
  method:   "POST",
  initial: {
    code:            "",
    item_name:       "",
    category:        "",
    description:     "",
    retail_price:    0,
    wholesale_price: 0,
    stock_qty:       0,
    min_stock:       0,
    is_published:    true,
    is_featured:     false,
    images:          [],
    video_url:       "",
    attributes:      {},   // dynamic JSONB
    translations:    {
      km: { name: "", description: "" },
      en: { name: "", description: "" },
      zh: { name: "", description: "" },
    },
  },
  fields: [
    { key: "code",            label: "Code",            type: "text",     col: 6,  placeholder: "S53-V1",     validate: { required: true, code: true, maxLen: 50,  msg: "Code required (A-Z 0-9 -)" } },
    { key: "item_name",       label: "Name",            type: "text",     col: 6,  placeholder: "Speaker S53", validate: { required: true, maxLen: 200, msg: "Name required" }                      },
    { key: "category",        label: "Category",        type: "text",     col: 6,  placeholder: "Speaker...", validate: { required: false, maxLen: 100 }                                             },
    { key: "retail_price",    label: "Retail Price ($)", type: "number",  col: 6,  placeholder: "0.00",       validate: { required: true, min: 0, msg: "Price required" }                           },
    { key: "wholesale_price", label: "Wholesale ($)",   type: "number",   col: 6,  placeholder: "0.00",       validate: { required: false, min: 0 },               ownerOnly: true                 },
    { key: "stock_qty",       label: "Stock",           type: "number",   col: 6,  placeholder: "0",          validate: { required: false, min: 0, integer: true }                                  },
    { key: "min_stock",       label: "Min Stock",       type: "number",   col: 6,  placeholder: "5",          validate: { required: false, min: 0, integer: true }                                  },
    { key: "description",     label: "Description",     type: "textarea", col: 12, placeholder: "Details...", validate: { required: false, maxLen: 2000 }                                            },
    { key: "is_published",    label: "Published",       type: "toggle",   col: 6,  validate: { required: false }                                                                                     },
    { key: "is_featured",     label: "Featured",        type: "toggle",   col: 6,  validate: { required: false }                                                                                     },
  ],
};

// ── STOCK MOVEMENT SCHEMA ─────────────────────────────────────
export const STOCK_SCHEMA = {
  endpoint: "/api/stock/movement",
  method:   "POST",
  initial:  { code: "", type: "in", qty: 1, note: "" },
  fields: [
    { key: "code", label: "Product Code", type: "text",   col: 12, placeholder: "S53-V1", validate: { required: true } },
    { key: "type", label: "Type",         type: "select", col: 6,
      options: [{ value: "in", label: "Stock In" }, { value: "out", label: "Stock Out" }, { value: "adjust", label: "Adjust" }],
      validate: { required: true } },
    { key: "qty",  label: "Quantity",     type: "number", col: 6,  placeholder: "1",      validate: { required: true, positive: true, integer: true } },
    { key: "note", label: "Note",         type: "text",   col: 12, placeholder: "Reason...", validate: { required: false } },
  ],
};

// ── LOGIN SCHEMA ──────────────────────────────────────────────
export const LOGIN_SCHEMA = {
  endpoint: "/api/auth/login",
  method:   "POST",
  initial:  { phone: "", password: "" },
  fields: [
    { key: "phone",    label: "Phone",    type: "tel",      col: 12, placeholder: "0xx xxx xxx", validate: { required: true, phone: true } },
    { key: "password", label: "Password", type: "password", col: 12, placeholder: "Password",     validate: { required: true, minLen: 4   } },
  ],
};

// ── DYNAMIC ATTRIBUTES ────────────────────────────────────────
// Product attributes = flexible JSONB per category
// Each category has a preset of common attributes
// Owner can add custom attributes too

export const ATTRIBUTE_PRESETS = {
  speaker: [
    { key: "wattage",   label: "Wattage",     type: "text",   placeholder: "200W"     },
    { key: "bluetooth", label: "Bluetooth",   type: "toggle"                           },
    { key: "battery",   label: "Battery",     type: "text",   placeholder: "2000mAh"  },
    { key: "warranty",  label: "Warranty",    type: "text",   placeholder: "1 year"   },
  ],
  microphone: [
    { key: "range",     label: "Range",       type: "text",   placeholder: "50m"      },
    { key: "port",      label: "Port",        type: "text",   placeholder: "USB-C"    },
    { key: "battery",   label: "Battery",     type: "text",   placeholder: "1200mAh"  },
    { key: "wireless",  label: "Wireless",    type: "toggle"                           },
  ],
  fashion: [
    { key: "size",      label: "Sizes",       type: "text",   placeholder: "S,M,L,XL" },
    { key: "color",     label: "Colors",      type: "text",   placeholder: "Black,White" },
    { key: "material",  label: "Material",    type: "text",   placeholder: "Cotton 100%"},
  ],
  food: [
    { key: "weight",    label: "Weight",      type: "text",   placeholder: "250g"     },
    { key: "shelf_life",label: "Shelf Life",  type: "text",   placeholder: "3 months" },
    { key: "organic",   label: "Organic",     type: "toggle"                           },
  ],
  default: [
    { key: "brand",     label: "Brand",       type: "text",   placeholder: "Brand"    },
    { key: "model",     label: "Model",       type: "text",   placeholder: "Model"    },
    { key: "warranty",  label: "Warranty",    type: "text",   placeholder: "6 months" },
    { key: "color",     label: "Color",       type: "text",   placeholder: "Black"    },
  ],
};

// Get preset for category (case-insensitive partial match)
export function getAttributePreset(category) {
  const cat = (category || "").toLowerCase();
  for (const [key, preset] of Object.entries(ATTRIBUTE_PRESETS)) {
    if (cat.includes(key)) return preset;
  }
  return ATTRIBUTE_PRESETS.default;
}

// ── Util: build flat validation rules from schema ─────────────
export function schemaToRules(schema) {
  return schema.fields.reduce((acc, f) => {
    if (f.validate) acc[f.key] = f.validate;
    return acc;
  }, {});
}
