import { ShoppingCart, X, Minus, Plus } from "lucide-react";
import { T } from "../config";

export function CartDrawer({ cart, onClose, onRemove, onQtyChange }) {
  const total = cart.reduce((sum, item) => sum + (item.product.price || item.product.retail_price || 0) * item.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 yb-bg/60" />
      <div
        className={`relative w-full ${T.surface} border-t border-stone-700 rounded-t-3xl px-4 pt-3 pb-8`}
        style={{ maxHeight: "75dvh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-700 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="yb-text font-bold text-lg">Cart ({cart.reduce((s, i) => s + i.qty, 0)})</h2>
          <button onClick={onClose}><X className="w-5 h-5 yb-sub" /></button>
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-10">
            <ShoppingCart className="w-12 h-12 text-stone-700 mx-auto mb-2" />
            <p className="yb-muted">Cart is empty</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cart.map((item, idx) => {
                const p = item.product;
                const media0 = (p.images || p.media || [])[0] || {};
                return (
                  <div key={idx} className="yb-bg border yb-border rounded-xl p-3 flex items-center gap-3">
                    <div className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 ${media0.a ? `bg-gradient-to-br ${media0.a} ${media0.b}` : "yb-inp"} flex items-center justify-center`}>
                      {media0.url_thumb
                        ? <img src={media0.url_thumb} alt={p.item_name || p.shop || ""} className="w-full h-full object-cover" />
                        : p.Icon && <p.Icon className="w-7 h-7 yb-text/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="yb-text text-sm font-medium truncate">{p.item_name || p.shop}</p>
                      <p className="text-amber-400 text-sm font-bold">
                        ${parseFloat(p.retail_price || p.price || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => onQtyChange(idx, item.qty - 1)} className="w-7 h-7 rounded-full yb-inp flex items-center justify-center">
                        <Minus className="w-3 h-3 yb-text" />
                      </button>
                      <span className="yb-text text-sm w-4 text-center">{item.qty}</span>
                      <button onClick={() => onQtyChange(idx, item.qty + 1)} className="w-7 h-7 rounded-full yb-inp flex items-center justify-center">
                        <Plus className="w-3 h-3 yb-text" />
                      </button>
                      <button onClick={() => onRemove(idx)} className="w-7 h-7 rounded-full bg-rose-900/40 flex items-center justify-center">
                        <X className="w-3 h-3 text-rose-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t yb-border mt-3 pt-3 flex items-center justify-between">
              <span className="yb-sub text-sm">Total</span>
              <span className="text-amber-400 font-bold text-lg">${total.toFixed(2)}</span>
            </div>
            <button className={`w-full ${T.pillBtn} py-3 text-sm mt-3`}>Checkout</button>
          </>
        )}
      </div>
    </div>
  );
}
