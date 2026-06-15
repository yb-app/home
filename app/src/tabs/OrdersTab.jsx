import { useState, useEffect } from "react";
import { Package, Phone, MapPin, Tag, Rocket, CheckCircle2 } from "lucide-react";
import { T, ORDER_STATUS } from "../config";
import { GlobalHeader, HeaderSpacer, SkeletonCard } from "../components/ui";
import { useScrollHeader } from "../hooks/useScrollHeader";
import { api } from "../api";

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return String(v).slice(0, 16);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function OrderCard({ order: o, onDeliver }) {
  const isPaid = o.payment?.status === "paid" || o.status === "Completed";
  const code   = (o.order_items || []).map((i) => i.code || i.name).join(", ") || o.code || "—";

  return (
    <div className={`${T.surface} ${T.border} rounded-2xl p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-900/30 flex items-center justify-center"><Package className="w-5 h-5 text-amber-600" /></div>
          <span className="yb-text font-bold text-base">{o.customer_name || o.name || "Customer"}</span>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isPaid ? T.paid : T.cod}`}>
          {isPaid ? "Paid" : "COD"}
        </span>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-amber-400 font-semibold"><Phone className="w-4 h-4 shrink-0" />{o.customer_phone || o.phone}</div>
        <div className="flex items-center gap-2 yb-text2"><MapPin className="w-4 h-4 shrink-0 text-rose-500" />{o.customer_location || o.loc}</div>
        <div className="flex items-center gap-2 yb-sub"><Tag className="w-4 h-4 shrink-0" />{code}</div>
      </div>
      <div className="border-t yb-border pt-3 flex items-center gap-3">
        <div className="shrink-0">
          <div className="yb-text font-bold text-xl">${parseFloat(o.total || o.price || 0).toFixed(2)}</div>
          <div className="yb-muted text-xs">{fmtDate(o.created_at || o.date)}</div>
        </div>
        {isPaid
          ? <div className="flex-1 bg-emerald-950/60 border border-emerald-900/40 text-emerald-400 text-xs rounded-xl px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{fmtDate(o.payment?.paid_at || o.confirm)}</span>
            </div>
          : <button onClick={() => onDeliver?.(o)} className="ml-auto bg-amber-500 text-stone-900 font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5">
              <Rocket className="w-4 h-4" /> Deliver
            </button>
        }
      </div>
    </div>
  );
}

export function OrdersTab({ cartCount, onCartOpen, onDeliver }) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("pending");
  const { visible, onScroll } = useScrollHeader();

  useEffect(() => {
    api.get("/api/orders").then((r) => { if (r.ok && r.data) setOrders(r.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const pending = orders.filter((o) => o.status !== "Completed" && o.status !== "Cancelled");
  const done    = orders.filter((o) => o.status === "Completed");
  const shown   = filter === "pending" ? pending : done;

  return (
    <div className="h-full overflow-y-auto yb-bg" style={{ WebkitOverflowScrolling: "touch" }} onScroll={onScroll}>
      <GlobalHeader title="Orders" cartCount={cartCount} onCartOpen={onCartOpen} visible={visible} />
      <HeaderSpacer />

      <div className="yb-header border-b yb-border px-4 pt-3 pb-0">
        <div className="grid grid-cols-3 text-center pb-3">
          <div><div className="text-amber-400 font-bold text-2xl">{orders.length}</div><div className="yb-sub text-xs">Total</div></div>
          <div><div className="text-emerald-400 font-bold text-2xl">{done.length}</div><div className="yb-sub text-xs">Delivered</div></div>
          <div><div className="text-amber-400 font-bold text-2xl">{pending.length}</div><div className="yb-sub text-xs">Pending</div></div>
        </div>
        <div className="flex border-b yb-border">
          {[{ v: "pending", lbl: `Pending (${pending.length})` }, { v: "done", lbl: `Done (${done.length})` }].map((t) => (
            <button key={t.v} onClick={() => setFilter(t.v)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${filter === t.v ? "border-amber-400 text-amber-400" : "border-transparent yb-muted"}`}>
              {t.lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-3 space-y-3">
        {loading
          ? <div className="text-center yb-sub text-sm py-8">Loading...</div>
          : shown.length === 0
          ? <div className="text-center yb-sub text-sm py-8">No orders</div>
          : shown.map((o) => <OrderCard key={o.id} order={o} onDeliver={onDeliver} />)
        }
      </div>
    </div>
  );
}
