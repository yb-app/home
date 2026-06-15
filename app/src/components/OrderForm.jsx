// ─────────────────────────────────────────────────────────────────
// OrderForm — uses DynamicForm + ORDER_SCHEMA
// schema drives all fields, no manual field code
// ─────────────────────────────────────────────────────────────────
import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { T } from "../config";
import { Badge, MsgBanner } from "./ui";
import { useForm }       from "../forms/useForm";
import { DynamicForm }   from "../forms/DynamicForm";
import { ORDER_SCHEMA, schemaToRules } from "../forms/schema";
import { api }           from "../api";

export function OrderForm({ product, qty = 1, onClose, onSuccess }) {
  const [done, setDone] = useState(false);

  // Build submit handler — inject product + qty (auto, not from form)
  const submit = useCallback(async (values) => {
    return api.post("/api/orders", {
      customer_name:     values.customer_name,
      customer_phone:    values.customer_phone,
      customer_location: values.customer_location,
      payment_method:    values.payment_method || "cod",
      // auto-injected — never from user form
      order_items: [{
        code:       product.code  || product.sku || "",
        name:       product.item_name || product.shop || "",
        qty:        qty,
        unit_price: product.retail_price || product.price || 0,
      }],
      source: "web",
    });
  }, [product, qty]);

  const form = useForm(
    ORDER_SCHEMA.initial,
    schemaToRules(ORDER_SCHEMA),
    submit
  );

  async function handleConfirm() {
    const ok = await form.handleSubmit();
    if (ok) { setDone(true); onSuccess?.(); }
  }

  const priceStr = `$${parseFloat(product.retail_price || product.price || 0).toFixed(2)}`;

  // ── Success screen ─────────────────────────────────────────
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60" />
        <div className={`relative w-full ${T.surface} border-t ${T.border} rounded-t-3xl px-5 pt-4 pb-10`}
          onClick={(e) => e.stopPropagation()}>
          <div className="text-center py-6">
            <div className="text-5xl mb-3">✅</div>
            <div className={`${T.text} font-bold text-xl`}>Order placed!</div>
            <div className={`${T.sub}  text-sm mt-1`}>{product.shop || product.item_name}</div>
            <div className="text-amber-400 font-bold text-2xl mt-2">{priceStr} × {qty}</div>
          </div>
          <button onClick={onClose} className={`w-full ${T.pillBtn} py-3 text-sm`}>Close</button>
        </div>
      </div>
    );
  }

  // ── Form sheet ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className={`relative w-full ${T.surface} border-t ${T.border} rounded-t-3xl px-5 pt-4 pb-10`}
        onClick={(e) => e.stopPropagation()}>

        {/* Handle */}
        <div className={`w-10 h-1 rounded-full mx-auto mb-4 yb-surface2`} />

        {/* Product info */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`${T.text} font-bold`}>{product.shop || product.item_name}</span>
          <Badge />
        </div>
        <div className="text-amber-400 font-bold text-lg mb-4">{priceStr} × {qty}</div>

        {/* Server message */}
        <MsgBanner msg={form.msg} />

        {/* Dynamic fields — schema drives rendering */}
        <DynamicForm
          schema={ORDER_SCHEMA}
          form={form}
          footer={
            <div className="flex items-center justify-between mt-4">
              <span className={`${T.pill} text-base px-4 py-1.5`}>{priceStr}</span>
              <button
                onClick={handleConfirm}
                disabled={form.loading}
                className={`${T.pillBtn} px-6 py-2.5 text-sm disabled:opacity-50`}
              >
                {form.loading ? "Placing..." : "Confirm Order"}
              </button>
            </div>
          }
        />

        {/* Close */}
        <button onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full yb-surface2 flex items-center justify-center">
          <X className={`w-4 h-4 ${T.sub}`} />
        </button>
      </div>
    </div>
  );
}
