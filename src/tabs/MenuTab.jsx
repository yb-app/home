import { ChevronRight, Sun, Moon, Bell, MapPin, ShoppingBag, Settings } from "lucide-react";
import { T } from "../config";
import { Badge, GlobalHeader, HeaderSpacer } from "../components/ui";
import { useScrollHeader } from "../hooks/useScrollHeader";

export function MenuTab({ shipper, cartCount, onCartOpen, onLogout, theme, onToggleTheme }) {
  const { visible, onScroll } = useScrollHeader();
  const isDark = theme === "dark";

  const rows = [
    { Icon: ShoppingBag, label: "Order History",    sub: "All past orders",        action: null },
    { Icon: ShoppingBag, label: "My Shop",          sub: "Manage products",        action: null },
    { Icon: MapPin,      label: "Delivery Address", sub: "Location settings",      action: null },
    { Icon: Bell,        label: "Notifications",    sub: "Telegram / Facebook",    action: null },
    { Icon: Settings,    label: "Settings",         sub: "Language / Theme",       action: null },
  ];

  return (
    <div className={`h-full overflow-y-auto ${T.bg}`} style={{ WebkitOverflowScrolling: "touch" }} onScroll={onScroll}>
      <GlobalHeader title="Menu" cartCount={cartCount} onCartOpen={onCartOpen} visible={visible} />
      <HeaderSpacer />

      {/* Profile card */}
      {shipper && (
        <div className={`mx-3 mt-3 ${T.surface} border ${T.border} rounded-2xl p-4 flex items-center gap-3`}>
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-white font-bold text-2xl shrink-0">
            {(shipper.name || "Y")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`${T.text} font-semibold text-base truncate`}>{shipper.name}</span>
              <Badge />
            </div>
            <span className="text-amber-400 text-sm">{shipper.phone}</span>
            <div className={`${T.sub} text-xs`}>{shipper.role || "staff"}</div>
          </div>
        </div>
      )}

      {/* ── Light / Dark toggle ─────────────────────────────── */}
      <div className={`mx-3 mt-3 ${T.surface} border ${T.border} rounded-2xl overflow-hidden`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isDark ? "yb-surface2" : "bg-amber-100"}`}>
              {isDark
                ? <Moon className="w-4 h-4 text-stone-300" />
                : <Sun  className="w-4 h-4 text-amber-500" />
              }
            </div>
            <div>
              <div className={`${T.text} text-sm font-medium`}>{isDark ? "Dark Mode" : "Light Mode"}</div>
              <div className={`${T.sub} text-xs`}>{isDark ? "Switch to light" : "Switch to dark"}</div>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={onToggleTheme}
            className={`relative w-12 h-7 rounded-full transition-colors duration-300 focus:outline-none ${isDark ? "bg-amber-500" : "bg-stone-300"}`}
            role="switch"
            aria-checked={isDark}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${isDark ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      </div>

      {/* Menu rows */}
      <div className="px-3 mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className={`${T.surface} border ${T.border} rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${T.surface2}`}>
              <r.Icon className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className={`${T.text} text-sm font-medium`}>{r.label}</div>
              <div className={`${T.sub} text-xs mt-0.5`}>{r.sub}</div>
            </div>
            <ChevronRight className={`w-4 h-4 ${T.muted}`} />
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={onLogout}
          className={`w-full text-rose-400 text-sm font-medium py-3 rounded-xl ${T.surface} border ${T.border}`}
        >
          Logout
        </button>
      </div>

      {/* App version */}
      <div className={`text-center ${T.muted} text-xs py-6`}>YB Platform v3.1</div>
    </div>
  );
}
