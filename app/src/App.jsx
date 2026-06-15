import { TAB } from "./config";
import { useAppState }   from "./store/useAppState";
import { FeedsTab }      from "./tabs/FeedsTab";
import { CatalogsTab }   from "./tabs/CatalogsTab";
import { DashboardTab }  from "./tabs/DashboardTab";
import { OrdersTab }     from "./tabs/OrdersTab";
import { MenuTab }       from "./tabs/MenuTab";
import { ProductDetail } from "./pages/ProductDetail";
import { CartDrawer }    from "./components/CartDrawer";

const NAV = [
  { id: TAB.FEEDS,     label: "Feeds",     icon: "▶" },
  { id: TAB.CATALOGS,  label: "Catalogs",  icon: "⊞" },
  { id: TAB.DASHBOARD, label: "Dashboard", icon: "📊" },
  { id: TAB.ORDERS,    label: "Orders",    icon: "📦" },
  { id: TAB.MENU,      label: "Menu",      icon: "👤" },
];

export default function App() {
  const app = useAppState();
  const { s, set, cartCount } = app;

  if (s.detail) {
    return (
      <div className="yb-bg" style={{ height: "100dvh", fontFamily: "system-ui,-apple-system,sans-serif", overflow: "hidden" }}>
        <ProductDetail
          product={s.detail}
          onBack={() => set({ detail: null })}
          onAddCart={app.addToCart}
          cartCount={cartCount}
          onCartOpen={() => set({ showCart: true })}
        />
        {s.showCart && (
          <CartDrawer cart={s.cart} onClose={() => set({ showCart: false })}
            onRemove={app.removeFromCart} onQtyChange={app.changeCartQty} />
        )}
      </div>
    );
  }

  return (
    <div className="yb-bg relative" style={{ height: "100dvh", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ height: "calc(100dvh - 56px)" }}>
        {s.tab === TAB.FEEDS     && <FeedsTab     onView={(p) => set({ detail: p })} app={app} />}
        {s.tab === TAB.CATALOGS  && <CatalogsTab  onView={(p) => set({ detail: p })} app={app} cartCount={cartCount} onCartOpen={() => set({ showCart: true })} />}
        {s.tab === TAB.DASHBOARD && <DashboardTab app={app} cartCount={cartCount} onCartOpen={() => set({ showCart: true })} />}
        {s.tab === TAB.ORDERS    && <OrdersTab    app={app} cartCount={cartCount} onCartOpen={() => set({ showCart: true })} />}
        {s.tab === TAB.MENU      && <MenuTab      app={app} cartCount={cartCount} onCartOpen={() => set({ showCart: true })} />}
      </div>

      <nav className="absolute bottom-0 left-0 right-0 yb-bg2 border-t yb-border flex items-center justify-around"
        style={{ height: 56, paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        {NAV.map((t) => (
          <div key={t.id} onClick={() => set({ tab: t.id })}
            className={`flex flex-col items-center gap-0.5 cursor-pointer px-2 py-1 transition-colors ${s.tab === t.id ? "text-amber-400" : "yb-muted"}`}>
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[9px] font-medium">{t.label}</span>
          </div>
        ))}
      </nav>

      {s.showCart && (
        <CartDrawer cart={s.cart} onClose={() => set({ showCart: false })}
          onRemove={app.removeFromCart} onQtyChange={app.changeCartQty} />
      )}
    </div>
  );
}
