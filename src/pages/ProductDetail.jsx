import { useState } from "react";
import { ArrowLeft, Bookmark, Share2, ShoppingCart, Heart, ShoppingBag, Minus, Plus } from "lucide-react";
import { T } from "../config";
import { Badge, Stars } from "../components/ui";
import { MediaTile } from "../components/MediaTile";
import { OrderForm } from "../components/OrderForm";
import { useSwipe } from "../hooks/useSwipe";

export function ProductDetail({ product: p, onBack, onAddCart, cartCount, onCartOpen }) {
  const [mediaIdx,   setMediaIdx]   = useState(0);
  const [qty,        setQty]        = useState(1);
  const [liked,      setLiked]      = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [showOrder,  setShowOrder]  = useState(false);

  // support both mock shape (media[]) and API shape (images[])
  const media    = p.media || p.images || [];
  const n        = media.length;
  const price    = p.retail_price || p.price || 0;
  const origPx   = p.originalPrice || price;
  const discount = Math.round((1 - price / origPx) * 100);
  const stock    = p.stock_qty ?? p.stock ?? 0;

  const swipe = useSwipe({
    onLeft:  () => setMediaIdx((v) => Math.min(v + 1, n - 1)),
    onRight: () => setMediaIdx((v) => Math.max(v - 1, 0)),
    onTap:   () => {},
  });

  return (
    <div className="yb-bg h-full overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>

      {/* ── Photo strip — edge-to-edge, under dynamic island ── */}
      <div
        className="relative w-full shrink-0"
        style={{
          aspectRatio: "1/1",
          marginTop: "calc(-1 * env(safe-area-inset-top,0px))",
          paddingTop: "env(safe-area-inset-top,0px)",
        }}
        {...swipe}
      >
        <div className="absolute inset-0 flex" style={{
          width: `${n * 100}%`,
          transform: `translateX(calc(-${mediaIdx * (100 / n)}% + ${swipe.offset.x / n}px))`,
          transition: swipe.offset.x === 0 ? "transform 0.28s cubic-bezier(.22,.61,.36,1)" : "none",
          willChange: "transform",
        }}>
          {media.map((m, j) => (
            <div key={j} className="relative shrink-0 h-full" style={{ width: `${100 / n}%` }}>
              <MediaTile m={m} Icon={p.Icon} active={j === mediaIdx} cover />
            </div>
          ))}
        </div>

        {/* Back + action buttons */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-3 z-10"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top,0px))" }}>
          <button onClick={onBack} className="w-9 h-9 rounded-full yb-bg/50 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 yb-text" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setSaved((v) => !v)} className="w-9 h-9 rounded-full yb-bg/50 flex items-center justify-center">
              <Bookmark className={`w-5 h-5 ${saved ? "text-amber-400 fill-amber-400" : "yb-text"}`} />
            </button>
            <button className="w-9 h-9 rounded-full yb-bg/50 flex items-center justify-center">
              <Share2 className="w-5 h-5 yb-text" />
            </button>
            <button onClick={onCartOpen} className="w-9 h-9 rounded-full yb-bg/50 flex items-center justify-center relative">
              <ShoppingCart className="w-5 h-5 yb-text" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-stone-900 text-[9px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Dots */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {media.map((_, j) => (
            <span key={j} onClick={() => setMediaIdx(j)}
              className={`rounded-full cursor-pointer transition-all ${j === mediaIdx ? "w-5 h-1.5 bg-amber-400" : "w-1.5 h-1.5 bg-white/40"}`} />
          ))}
        </div>
        <span className="absolute bottom-3 right-3 yb-bg/60 yb-text text-xs px-2 py-0.5 rounded-full z-10">
          {mediaIdx + 1}/{n}
        </span>
      </div>

      {/* ── Content below photo ── */}

      {/* Price */}
      <div className={`${T.surface} px-4 py-3`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-amber-400 font-bold text-2xl">${parseFloat(price).toFixed(2)}</span>
          {discount > 0 && (
            <>
              <span className="yb-muted line-through text-sm">${parseFloat(origPx).toFixed(2)}</span>
              <span className="bg-rose-600 yb-text text-xs font-bold px-2 py-0.5 rounded">-{discount}%</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {p.sold   && <span className="yb-sub text-xs">{p.sold}+ sold</span>}
          <span className="yb-sub text-xs">Stock: {stock}</span>
          <span className="text-emerald-400 text-xs font-medium">✅ Fast delivery</span>
        </div>
      </div>

      {/* Shop */}
      <div className={`${T.surface} border-t yb-border px-4 py-3 flex items-center justify-between mt-px`}>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center yb-text font-bold">
            {(p.item_name || p.shop || "?")[0]}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="yb-text text-sm font-semibold">{p.shop || p.item_name}</span>
              <Badge />
            </div>
            {p.shopRating && (
              <div className="flex items-center gap-2">
                <Stars rating={p.shopRating} />
                {p.shopSales && <span className="yb-sub text-xs">{p.shopSales} sales</span>}
              </div>
            )}
          </div>
        </div>
        <button className="border border-amber-500 text-amber-400 text-xs px-3 py-1.5 rounded-xl">View Shop</button>
      </div>

      {/* Description */}
      <div className={`${T.surface} border-t yb-border px-4 py-3 mt-px`}>
        <h3 className="yb-text font-semibold text-sm mb-2">Description</h3>
        <p className="yb-text2 text-sm leading-relaxed">{p.caption || p.description}</p>
      </div>

      {/* Specs */}
      {p.specs && p.specs.length > 0 && (
        <div className={`${T.surface} border-t yb-border px-4 py-3 mt-px`}>
          <h3 className="yb-text font-semibold text-sm mb-2">Specifications</h3>
          {p.specs.map((spec) => (
            <div key={spec.k} className="flex items-start gap-3 py-1.5 border-b yb-border/60 last:border-0">
              <span className="yb-sub text-xs w-24 shrink-0 pt-0.5">{spec.k}</span>
              <span className="text-stone-200 text-sm">{spec.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Qty selector */}
      <div className={`${T.surface} border-t yb-border px-4 py-3 mt-px flex items-center justify-between`}>
        <span className="yb-text text-sm">Qty</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setQty((v) => Math.max(1, v - 1))}
            className="w-8 h-8 rounded-full yb-inp flex items-center justify-center">
            <Minus className="w-4 h-4 yb-text" />
          </button>
          <span className="yb-text font-bold text-lg w-6 text-center">{qty}</span>
          <button onClick={() => setQty((v) => Math.min(stock || 99, v + 1))}
            className="w-8 h-8 rounded-full yb-inp flex items-center justify-center">
            <Plus className="w-4 h-4 yb-text" />
          </button>
        </div>
      </div>

      {/* Reviews */}
      {p.reviews && p.reviews.length > 0 && (
        <div className={`${T.surface} border-t yb-border px-4 py-3 mt-px`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="yb-text font-semibold text-sm">Reviews ({p.reviews.length})</h3>
            {p.shopRating && (
              <div className="flex items-center gap-1">
                <Stars rating={p.shopRating} />
                <span className="text-amber-400 text-xs font-bold ml-1">{p.shopRating}</span>
              </div>
            )}
          </div>
          {p.reviews.map((rv, i) => (
            <div key={i} className="border-b yb-border pb-3 mb-3 last:border-0 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-stone-700 flex items-center justify-center yb-text text-xs font-bold">
                  {rv.user[0]}
                </div>
                <span className="yb-text text-sm">{rv.user}</span>
                <Stars rating={rv.rating} />
              </div>
              <p className="yb-text2 text-sm">{rv.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="h-24" />

      {/* Fixed bottom action bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 ${T.header} px-4 py-3 flex items-center gap-3`}
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom,0px))" }}>
        <button onClick={() => setLiked((v) => !v)} className="flex flex-col items-center gap-0.5 shrink-0">
          <Heart className={`w-6 h-6 ${liked ? "text-rose-500 fill-rose-500" : "yb-sub"}`} />
          <span className="yb-sub text-[10px]">{(p.likes || 0) + (liked ? 1 : 0)}</span>
        </button>
        <button onClick={() => onAddCart(p, qty)}
          className="flex-1 yb-inp border border-amber-500/50 text-amber-400 font-semibold text-sm py-3 rounded-xl flex items-center justify-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Cart
        </button>
        <button onClick={() => setShowOrder(true)}
          className={`flex-1 ${T.pillBtn} text-sm py-3 rounded-xl flex items-center justify-center gap-2`}>
          <ShoppingBag className="w-4 h-4" /> Order
        </button>
      </div>

      {showOrder && (
        <OrderForm
          product={p}
          qty={qty}
          onClose={() => setShowOrder(false)}
          onSuccess={() => setShowOrder(false)}
        />
      )}
    </div>
  );
}
