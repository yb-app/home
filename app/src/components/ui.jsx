import { Star, CheckCircle2, ShoppingCart } from "lucide-react";
import { T, HDR_H } from "../config";

export function Badge() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-700 ring-2 ring-amber-400 shrink-0">
      <CheckCircle2 className="w-3 h-3 text-amber-400" strokeWidth={3} />
    </span>
  );
}

export function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-stone-600"}`} />
      ))}
    </div>
  );
}

export function MsgBanner({ msg }) {
  if (!msg?.text) return null;
  const cls = msg.type === "error"
    ? "bg-rose-950/60 border-rose-800 text-rose-400"
    : "bg-emerald-950/60 border-emerald-800 text-emerald-400";
  return <div className={`rounded-xl border px-3 py-2 mb-3 text-xs ${cls}`}>{msg.text}</div>;
}

export function GlobalHeader({ title, cartCount, onCartOpen, visible }) {
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-40 ${T.header} flex items-center justify-between px-4 transition-transform duration-200`}
      style={{
        paddingTop:    "calc(0.625rem + env(safe-area-inset-top,0px))",
        paddingBottom: "0.625rem",
        transform:     visible ? "translateY(0)" : "translateY(-110%)",
      }}
    >
      <span className={`${T.text} font-bold text-lg`}>{title}</span>
      <button onClick={onCartOpen} className="relative w-9 h-9 flex items-center justify-center">
        <ShoppingCart className={`w-5 h-5 ${T.sub}`} />
        {cartCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-400 text-stone-900 text-[9px] font-bold flex items-center justify-center">
            {cartCount}
          </span>
        )}
      </button>
    </div>
  );
}

export function HeaderSpacer() {
  return <div style={{ height: HDR_H }} />;
}

export function StockBadge({ qty, min }) {
  if (qty === 0) return <span className={`${T.out}  font-bold text-sm px-2.5 py-0.5 rounded-full`}>Out</span>;
  if (qty < min) return <span className={`${T.low}  font-bold text-sm px-2.5 py-0.5 rounded-full`}>{qty} Low</span>;
  return                <span className={`${T.good} font-bold text-sm px-2.5 py-0.5 rounded-full`}>{qty} OK</span>;
}

export function Skeleton({ h = "h-8", w = "w-full", rounded = "rounded-lg", className = "" }) {
  return <div className={`${h} ${w} ${rounded} bg-stone-800 animate-pulse ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="yb-surface border yb-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton h="h-11" w="w-11" rounded="rounded-xl" />
        <div className="flex-1 space-y-2"><Skeleton h="h-4" w="w-32" /><Skeleton h="h-3" w="w-24" /></div>
      </div>
      <Skeleton h="h-3" /><Skeleton h="h-3" w="w-3/4" />
    </div>
  );
}
