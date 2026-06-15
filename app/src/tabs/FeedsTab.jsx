import { useState, useEffect } from "react";
import { Heart, Gift, MessageCircle, Share2, MapPin } from "lucide-react";
import { T } from "../config";
import { Badge } from "../components/ui";
import { MediaTile } from "../components/MediaTile";
import { useSwipe } from "../hooks/useSwipe";
import { api } from "../api";

// Pre-cache next slide thumbs + video via Service Worker
function precacheNext(products, idx) {
  const p = products[idx];
  if (!p) return;
  const media = p.images || [];
  const thumbs = media.map((m) => m.url_thumb || m.url).filter(Boolean);
  if (p.image_url) thumbs.push(p.image_url);
  if (thumbs.length && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "PRECACHE_THUMBS", urls: thumbs });
  }
  const vid = media.find((m) => m.type === "video" || (m.url || "").endsWith(".mp4"));
  if (vid?.url && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "PRECACHE_VIDEO", url: vid.url });
  }
}

function FeedActions({ product }) {
  const [liked,  setLiked]  = useState(false);
  const [gifted, setGifted] = useState(false);
  const [likes,  setLikes]  = useState(product.likes || 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <button onClick={() => { setLiked((v) => !v); setLikes((v) => liked ? v - 1 : v + 1); }} className="flex flex-col items-center gap-1">
        <Heart className={`w-7 h-7 ${liked ? "text-rose-500 fill-rose-500" : "yb-text"}`} />
        <span className="yb-text text-xs">{likes}</span>
      </button>
      <button onClick={() => setGifted((v) => !v)} className="flex flex-col items-center gap-1">
        <Gift className={`w-7 h-7 ${gifted ? "text-amber-400" : "yb-text"}`} />
        <span className="yb-text text-xs">Gift</span>
      </button>
      <button className="flex flex-col items-center gap-1"><MessageCircle className="w-7 h-7 yb-text" /><span className="yb-text text-xs">Chat</span></button>
      <button className="flex flex-col items-center gap-1"><Share2 className="w-7 h-7 yb-text" /><span className="yb-text text-xs">Share</span></button>
    </div>
  );
}

function FeedSlide({ product: p, active, onView }) {
  // normalize: images[] from API, fallback to image_url, fallback to gradient
  const rawMedia = p.images || p.media || [];
  const media = rawMedia.length > 0
    ? rawMedia
    : p.image_url
    ? [{ url: p.image_url, url_thumb: p.image_url, type: "img" }]
    : [{ a: "from-amber-500", b: "to-orange-700", l: p.item_name || "", type: "img" }];

  const [mediaIdx, setMediaIdx] = useState(0);
  const swipe = useSwipe({
    onLeft:  () => setMediaIdx((v) => Math.min(v + 1, media.length - 1)),
    onRight: () => setMediaIdx((v) => Math.max(v - 1, 0)),
    onTap:   () => onView(p),
  });

  const price = p.retail_price || p.price || 0;

  return (
    <div className="relative w-full h-full yb-bg overflow-hidden">
      <div className="flex h-full" style={{
        width: `${media.length * 100}%`,
        transform: `translateX(calc(-${mediaIdx * (100 / media.length)}% + ${swipe.offset.x / media.length}px))`,
        transition: swipe.offset.x === 0 ? "transform 0.28s cubic-bezier(.22,.61,.36,1)" : "none",
        willChange: "transform",
      }} {...swipe}>
        {media.map((m, j) => (
          <div key={j} className="relative shrink-0 h-full" style={{ width: `${100 / media.length}%` }}>
            <MediaTile m={m} Icon={p.Icon} active={active && j === mediaIdx} />
          </div>
        ))}
      </div>
      <div className="absolute right-3 bottom-28 pointer-events-auto"><FeedActions product={p} /></div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-5 pt-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="yb-text font-semibold drop-shadow">{p.shop || p.item_name}</span>
          <Badge />
        </div>
        {p.loc && (
          <div className="flex items-center gap-1 text-white/75 text-xs mb-1">
            <MapPin className="w-3 h-3 shrink-0" />{p.loc}
          </div>
        )}
        <p className="yb-text text-sm line-clamp-2 max-w-[75%] drop-shadow">{p.caption || p.description}</p>
        <span className={`inline-block mt-2 ${T.pill} text-sm px-3 py-1`}>${parseFloat(price).toFixed(2)}</span>
      </div>
      {media.length > 1 && (
        <span className="absolute top-3 right-3 bg-black/50 yb-text text-xs px-2 py-0.5 rounded-full">
          {mediaIdx + 1}/{media.length}
        </span>
      )}
    </div>
  );
}

export function FeedsTab({ onView }) {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [idx,      setIdx]      = useState(0);

  useEffect(() => {
    api.get("/api/products?view=feed")
      .then((r) => { if (r.ok && r.data) setProducts(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const swipe = useSwipe({
    onUp: () => setIdx((v) => {
      const next = Math.min(v + 1, products.length - 1);
      precacheNext(products, next);
      return next;
    }),
    onDown: () => setIdx((v) => Math.max(v - 1, 0)),
    onTap:  () => {},
  });

  // Loading skeleton
  if (loading) {
    return (
      <div className="h-full yb-bg flex flex-col">
        <div className="flex-1 bg-stone-900 animate-pulse" />
        <div className="p-4 space-y-2">
          <div className="h-4 w-32 bg-stone-800 animate-pulse rounded" />
          <div className="h-3 w-48 bg-stone-800 animate-pulse rounded" />
          <div className="h-6 w-20 bg-stone-700 animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="h-full yb-bg flex items-center justify-center">
        <span className="yb-sub text-sm">No products yet</span>
      </div>
    );
  }

  return (
    <div className="relative h-full yb-bg overflow-hidden" {...swipe}>
      <div style={{
        height: `${products.length * 100}%`,
        transform: `translateY(calc(-${idx * (100 / products.length)}% + ${swipe.offset.y / products.length}px))`,
        transition: swipe.offset.y === 0 ? "transform 0.35s cubic-bezier(.22,.61,.36,1)" : "none",
        willChange: "transform",
      }}>
        {products.map((p, i) => (
          <div key={p.id} style={{ height: `${100 / products.length}%` }}>
            <FeedSlide product={p} active={i === idx} onView={onView} />
          </div>
        ))}
      </div>
      {/* Scroll indicator */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
        {products.map((_, i) => (
          <span key={i} className={`w-1 rounded-full transition-all ${i === idx ? "h-5 bg-amber-400" : "h-2 bg-white/25"}`} />
        ))}
      </div>
    </div>
  );
}
