import { useState, useEffect } from "react";
import { BarChart3, Package } from "lucide-react";
import { T } from "../config";
import { Badge, StockBadge, GlobalHeader, HeaderSpacer } from "../components/ui";
import { useScrollHeader } from "../hooks/useScrollHeader";
import { api } from "../api";

const INITIAL_STATS = {
  orders:   { total: 0, pending: 0, delivering: 0, completed: 0, today: 0 },
  revenue:  { total: "0.00", paid: "0.00", unpaid: "0.00", today: "0.00" },
  products: { total: 0, low_stock: 0, out_stock: 0 },
  customers:{ total: 0 },
};

export function DashboardTab({ shipper, cartCount, onCartOpen }) {
  const [stats,    setStats]    = useState(INITIAL_STATS);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const { visible, onScroll } = useScrollHeader();

  useEffect(() => {
    Promise.all([
      api.get("/api/stats?type=all"),
      api.get("/api/products?view=staff"),
    ]).then(([statsRes, prodRes]) => {
      if (statsRes.ok) setStats({ ...INITIAL_STATS, ...statsRes.data });
      if (prodRes.ok && prodRes.data) setProducts(prodRes.data.slice(0, 10));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: "Revenue",  val: `$${stats.revenue?.total}`,  color: "text-amber-400"   },
    { label: "Orders",   val: stats.orders?.today || 0,    color: "text-emerald-400" },
    { label: "Pending",  val: stats.orders?.pending || 0,  color: "text-rose-400"    },
    { label: "Customers",val: stats.customers?.total || 0, color: "text-sky-400"     },
  ];

  return (
    <div className="h-full overflow-y-auto yb-bg" style={{ WebkitOverflowScrolling: "touch" }} onScroll={onScroll}>
      <GlobalHeader title="Dashboard" cartCount={cartCount} onCartOpen={onCartOpen} visible={visible} />
      <HeaderSpacer />

      {shipper && (
        <div className={`mx-3 mt-3 ${T.surface} ${T.border} rounded-2xl p-3 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center yb-text font-bold text-lg">
              {(shipper.name || "Y")[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="yb-text font-semibold text-sm">{shipper.name}</span><Badge />
              </div>
              <span className="text-amber-400 text-xs">{shipper.phone}</span>
            </div>
          </div>
          <button className={`yb-inp border border-amber-500/40 text-amber-400 text-xs px-3 py-1.5 rounded-xl`}>Catalog</button>
        </div>
      )}

      {loading
        ? <div className="flex justify-center py-10 yb-sub text-sm">Loading...</div>
        : (
          <>
            <div className="grid grid-cols-2 gap-2 mx-3 mt-2">
              {statCards.map((s) => (
                <div key={s.label} className={`${T.surface} ${T.border} rounded-2xl p-3`}>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="yb-sub text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className={`mx-3 mt-2 ${T.surface} ${T.border} rounded-2xl p-3`}>
              <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-amber-400" /><span className="yb-text text-sm font-medium">Revenue (7 days)</span></div>
              <div className="flex items-end gap-1.5 h-16">
                {[40, 65, 50, 80, 70, 90, 55].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-amber-400/80" style={{ height: `${h}%` }} />
                    <span className="yb-muted text-[9px]">{["M","T","W","T","F","S","S"][i]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`mx-3 mt-2 mb-4 ${T.surface} ${T.border} rounded-2xl p-3`}>
              <div className="flex items-center gap-2 mb-3"><Package className="w-4 h-4 text-amber-400" /><span className="yb-text text-sm font-medium">Stock</span></div>
              <div className="space-y-2.5">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div><span className="text-stone-200 text-sm">{p.item_name}</span><span className="yb-muted text-xs ml-2">{p.code}</span></div>
                    <StockBadge qty={p.stock_qty || 0} min={p.min_stock || 0} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      }
    </div>
  );
}
