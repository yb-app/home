import { useState, useEffect, useRef } from "react";
import { T } from "../config";
import { GlobalHeader, HeaderSpacer } from "../components/ui";
import { MediaTile } from "../components/MediaTile";
import { useScrollHeader } from "../hooks/useScrollHeader";
import { api } from "../api";

function CatalogTile({ product: p, onView }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const media = (p.images || p.media || [])[0] || {};
  const price = p.retail_price || p.price || 0;
  const origPx = p.originalPrice || price;
  const discount = origPx > price ? Math.round((1 - price / origPx) * 100) : 0;

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} onClick={() => onView(p)} className="relative cursor-pointer" style={{ aspectRatio: "3/4" }}>
      <MediaTile m={media} Icon={p.Icon} active={visible} cover />
      <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-10 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
        <p className="yb-text text-xs font-medium truncate">{p.item_name || p.shop}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={`${T.pill} text-xs px-1.5 py-0.5`}>${parseFloat(price).toFixed(2)}</span>
          {discount > 0 && <span className="bg-rose-600 yb-text text-[10px] font-bold px-1 py-0.5 rounded">-{discount}%</span>}
        </div>
        {p.sold && <span className="yb-sub text-[10px]">{p.sold}+ sold</span>}
      </div>
    </div>
  );
}

export function CatalogsTab({ onView, cartCount, onCartOpen }) {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const { visible, onScroll } = useScrollHeader();

  useEffect(() => {
    api.get("/api/products").then((r) => { if (r.ok && r.data) setProducts(r.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) => !search || (p.item_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto yb-bg" style={{ WebkitOverflowScrolling: "touch" }} onScroll={onScroll}>
      <GlobalHeader title={`Catalogs (${filtered.length})`} cartCount={cartCount} onCartOpen={onCartOpen} visible={visible} />
      <HeaderSpacer />
      <div className="px-3 py-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..."
          className="w-full yb-surface2 yb-text text-sm rounded-xl px-4 py-2.5 outline-none border yb-border focus:border-amber-500" />
      </div>
      {loading
        ? <div className="flex justify-center py-20 yb-sub text-sm">Loading...</div>
        : <div className="grid grid-cols-2 gap-px yb-bg">{filtered.map((p) => <CatalogTile key={p.id} product={p} onView={onView} />)}</div>
      }
    </div>
  );
}
