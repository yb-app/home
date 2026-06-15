// ─────────────────────────────────────────────────────────────────
// VALIDATION — primitives + field validator + form validator
// ─────────────────────────────────────────────────────────────────

// ── Primitive validators ──────────────────────────────────────
export const V = {
  required: (v)    => v !== null && v !== undefined && String(v).trim() !== "",
  phone:    (v)    => /^0[0-9]{8,9}$/.test(String(v).replace(/[\s\-]/g, "")),
  email:    (v)    => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
  url:      (v)    => /^https?:\/\/.+/.test(String(v)),
  number:   (v)    => !isNaN(Number(v)),
  integer:  (v)    => Number.isInteger(Number(v)),
  positive: (v)    => Number(v) > 0,
  minLen:   (v, n) => String(v).length >= n,
  maxLen:   (v, n) => String(v).length <= n,
  min:      (v, n) => Number(v) >= n,
  max:      (v, n) => Number(v) <= n,
  pattern:  (v, r) => r.test(String(v)),
  code:     (v)    => /^[A-Z0-9\-_]+$/i.test(String(v).trim()),
  nonempty: (v)    => Array.isArray(v) ? v.length > 0 : Boolean(v),
};

// ── Single field ──────────────────────────────────────────────
// returns { ok: bool, msg: string }
export function validateField(value, rules) {
  if (!rules) return { ok: true, msg: "" };

  const val = value ?? "";

  if (rules.required && !V.required(val))
    return { ok: false, msg: rules.msg || "This field is required" };

  // skip further checks if empty + not required
  if (!V.required(val)) return { ok: true, msg: "" };

  if (rules.phone   && !V.phone(val))
    return { ok: false, msg: rules.msg || "Phone: 0xxxxxxxxx (9–10 digits)" };

  if (rules.email   && !V.email(val))
    return { ok: false, msg: rules.msg || "Invalid email address" };

  if (rules.code    && !V.code(val))
    return { ok: false, msg: rules.msg || "Letters, numbers, - only" };

  if (rules.url     && !V.url(val))
    return { ok: false, msg: rules.msg || "Must start with http://" };

  if (rules.integer && !V.integer(val))
    return { ok: false, msg: rules.msg || "Must be a whole number" };

  if (rules.positive && !V.positive(val))
    return { ok: false, msg: rules.msg || "Must be greater than 0" };

  if (rules.minLen !== undefined && !V.minLen(val, rules.minLen))
    return { ok: false, msg: rules.msg || `Min ${rules.minLen} characters` };

  if (rules.maxLen !== undefined && !V.maxLen(val, rules.maxLen))
    return { ok: false, msg: rules.msg || `Max ${rules.maxLen} characters` };

  if (rules.min !== undefined && !V.min(val, rules.min))
    return { ok: false, msg: rules.msg || `Min value: ${rules.min}` };

  if (rules.max !== undefined && !V.max(val, rules.max))
    return { ok: false, msg: rules.msg || `Max value: ${rules.max}` };

  if (rules.pattern && !V.pattern(val, rules.pattern))
    return { ok: false, msg: rules.msg || "Invalid format" };

  if (rules.nonempty && !V.nonempty(val))
    return { ok: false, msg: rules.msg || "Cannot be empty" };

  if (rules.custom) {
    const result = rules.custom(val);
    if (result !== true) return { ok: false, msg: result || "Invalid" };
  }

  return { ok: true, msg: "" };
}

// ── Validate entire form ──────────────────────────────────────
// returns { valid: bool, errors: { key: msg } }
export function validateAll(values, rules) {
  const errors = {};
  let valid = true;
  Object.keys(rules).forEach((key) => {
    const r = validateField(values[key], rules[key]);
    if (!r.ok) { errors[key] = r.msg; valid = false; }
  });
  return { valid, errors };
}

// ── Predefined rule sets ──────────────────────────────────────
export const RULES = {
  order: {
    customer_name:     { required: true,  maxLen: 100, msg: "Name required"                     },
    customer_phone:    { required: true,  phone:  true, msg: "Phone: 0xx xxx xxxx"             },
    customer_location: { required: true,  maxLen: 200, msg: "Location required"                 },
  },
  product: {
    code:            { required: true,  code: true, maxLen: 50,  msg: "Code required (A-Z 0-9 -)" },
    item_name:       { required: true,  maxLen: 200,             msg: "Name required"              },
    retail_price:    { required: true,  min: 0,                  msg: "Price required"             },
    stock_qty:       { required: false, min: 0,     integer: true                                  },
    min_stock:       { required: false, min: 0,     integer: true                                  },
    category:        { required: false, maxLen: 100                                                 },
    description:     { required: false, maxLen: 2000                                                },
    wholesale_price: { required: false, min: 0                                                      },
  },
  stock: {
    qty:  { required: true, positive: true, integer: true, msg: "Quantity required (> 0)" },
    type: { required: true,                               msg: "Type required"             },
  },
  login: {
    phone:    { required: true, phone: true, msg: "Phone: 0xxxxxxxxx"  },
    password: { required: true, minLen: 4,   msg: "Min 4 characters"   },
  },
};
