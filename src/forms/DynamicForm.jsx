import { useState } from "react";
import { Plus, X } from "lucide-react";
import { T } from "../config";
import { getAttributePreset } from "./schema";

// ── Single input renderer (dumb) ──────────────────────────────
function FieldInput({ f, value, error, hint, onChange, onBlur }) {
  const base = `w-full yb-text text-sm rounded-xl outline-none border transition-colors ${
    error ? "yb-inp border-rose-500"
          : hint  ? "yb-inp border-amber-500/60"
                  : "yb-inp yb-border focus:border-amber-500"
  }`;

  if (f.type === "textarea") {
    return <textarea value={value} placeholder={f.placeholder || ""} rows={3}
      onChange={(e) => onChange(f.key, e.target.value)}
      onBlur={(e)   => onBlur(f.key,   e.target.value)}
      className={`${base} px-4 py-3 resize-none`} />;
  }

  if (f.type === "toggle") {
    const isOn = Boolean(value);
    return (
      <button type="button" role="switch" aria-checked={isOn}
        onClick={() => onChange(f.key, !isOn)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${isOn ? "bg-amber-500" : "bg-stone-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${isOn ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    );
  }

  if (f.type === "select" && f.options) {
    return (
      <select value={value} onChange={(e) => onChange(f.key, e.target.value)}
        onBlur={(e) => onBlur(f.key, e.target.value)}
        className={`${base} px-4 py-3`}>
        <option value="">-- select --</option>
        {f.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  // text | tel | number | email | password
  return <input type={f.type || "text"} value={value ?? ""}
    placeholder={f.placeholder || ""}
    onChange={(e) => onChange(f.key, e.target.value)}
    onBlur={(e)   => onBlur(f.key,   e.target.value)}
    className={`${base} px-4 py-3`} />;
}

// ── Field wrapper (label + input + hint/error) ────────────────
function FormField({ f, value, error, hint, onChange, onBlur }) {
  return (
    <div className="mb-3 w-full">
      <div className={`flex items-center ${f.type === "toggle" ? "justify-between" : "justify-start"} mb-1`}>
        <label className="yb-sub text-xs">
          {f.label}
          {f.validate?.required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
        {f.type === "toggle" && (
          <FieldInput f={f} value={value} error={error} hint={hint} onChange={onChange} onBlur={onBlur} />
        )}
      </div>
      {f.type !== "toggle" && (
        <FieldInput f={f} value={value} error={error} hint={hint} onChange={onChange} onBlur={onBlur} />
      )}
      {error      && <p className="text-rose-400    text-xs mt-1">{error}</p>}
      {!error && hint && <p className="text-amber-400/70 text-xs mt-1">{hint}</p>}
    </div>
  );
}

// ── Dynamic Attributes Block ───────────────────────────────────
// Renders product.attributes JSONB with preset + custom fields
export function AttributesBlock({ category, value = {}, onChange }) {
  const [custom, setCustom] = useState("");
  const preset = getAttributePreset(category);

  function setAttr(key, val) {
    onChange("attributes", { ...value, [key]: val });
  }

  function addCustom() {
    const k = custom.trim().toLowerCase().replace(/\s+/g, "_");
    if (!k || k in value) return;
    setAttr(k, "");
    setCustom("");
  }

  function removeAttr(key) {
    const next = { ...value };
    delete next[key];
    onChange("attributes", next);
  }

  return (
    <div className="mb-3">
      <div className="yb-sub text-xs mb-2">Attributes (dynamic)</div>

      {/* Preset fields */}
      {preset.map((attr) => (
        <div key={attr.key} className="flex items-center gap-2 mb-2">
          <span className="yb-sub text-xs w-24 shrink-0">{attr.label}</span>
          {attr.type === "toggle" ? (
            <button type="button" onClick={() => setAttr(attr.key, !value[attr.key])}
              className={`relative w-10 h-5 rounded-full transition-colors ${value[attr.key] ? "bg-amber-500" : "bg-stone-600"}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value[attr.key] ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          ) : (
            <input value={value[attr.key] || ""} placeholder={attr.placeholder || ""}
              onChange={(e) => setAttr(attr.key, e.target.value)}
              className="flex-1 yb-inp yb-text yb-border text-xs rounded-lg px-3 py-1.5 outline-none border focus:border-amber-500" />
          )}
        </div>
      ))}

      {/* Custom attributes (user-defined) */}
      {Object.entries(value)
        .filter(([k]) => !preset.find((p) => p.key === k))
        .map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 mb-2">
            <span className="yb-sub text-xs w-24 shrink-0 truncate">{k}</span>
            <input value={v} onChange={(e) => setAttr(k, e.target.value)}
              className="flex-1 yb-inp yb-text yb-border text-xs rounded-lg px-3 py-1.5 outline-none border focus:border-amber-500" />
            <button onClick={() => removeAttr(k)} className="w-5 h-5 flex items-center justify-center text-rose-400">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))
      }

      {/* Add custom */}
      <div className="flex items-center gap-2 mt-1">
        <input value={custom} onChange={(e) => setCustom(e.target.value)}
          placeholder="Add attribute..."
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          className="flex-1 yb-inp yb-text yb-border text-xs rounded-lg px-3 py-1.5 outline-none border focus:border-amber-500" />
        <button onClick={addCustom}
          className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center">
          <Plus className="w-3.5 h-3.5 text-stone-900" />
        </button>
      </div>
    </div>
  );
}

// ── DynamicForm ───────────────────────────────────────────────
export function DynamicForm({ schema, form, role = "public", footer, showAttributes = false, className = "" }) {
  const visible = schema.fields.filter((f) => !f.ownerOnly || role === "owner");

  // Group col-6 pairs
  const rows = [];
  let i = 0;
  while (i < visible.length) {
    const f = visible[i];
    if (f.col === 6 && visible[i + 1]?.col === 6) {
      rows.push([f, visible[i + 1]]);
      i += 2;
    } else {
      rows.push([f]);
      i += 1;
    }
  }

  return (
    <div className={className}>
      {rows.map((pair, idx) => (
        <div key={idx} className={pair.length === 2 ? "flex gap-3" : ""}>
          {pair.map((f) => (
            <div key={f.key} className={pair.length === 2 ? "flex-1 min-w-0" : ""}>
              <FormField
                f={f}
                value={form.values[f.key]}
                error={form.errors[f.key]}
                hint={form.hints[f.key]}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Dynamic attributes block (product form only) */}
      {showAttributes && role === "owner" && (
        <AttributesBlock
          category={form.values.category || ""}
          value={form.values.attributes || {}}
          onChange={form.handleChange}
        />
      )}

      {footer}
    </div>
  );
}
