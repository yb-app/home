import { useRef, useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { MEDIA_TYPE } from "../config";

function GradientTile({ m, Icon }) {
  const imageUrl = m.url_thumb || m.url || "";
  return (
    <div className={`absolute inset-0 flex items-center justify-center ${m.a ? `bg-gradient-to-br ${m.a} ${m.b}` : "yb-surface2"}`}>
      {imageUrl
        ? <img src={imageUrl} alt={m.l || m.name || ""} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        : Icon && <Icon className="w-20 h-20 text-white/20" strokeWidth={1.5} />
      }
      {!imageUrl && m.l && <span className="absolute bottom-4 left-4 text-white/80 text-base font-medium">{m.l}</span>}
    </div>
  );
}

function VideoTile({ m, active, cover = true }) {
  const ref   = useRef(null);
  const [muted, setMuted] = useState(true);
  const src   = m.url || m.url_full || "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) el.play().catch(() => {});
    else        el.pause();
  }, [active]);

  if (!active) return <div className="absolute inset-0 yb-bg" />;

  return (
    <div className="absolute inset-0 yb-bg overflow-hidden">
      {!cover && (
        <video src={src} className="absolute inset-0 w-full h-full object-cover scale-150 blur-2xl brightness-40" muted loop autoPlay playsInline />
      )}
      <video ref={ref} src={src} muted={muted} loop playsInline
        poster={m.url_thumb || ""}
        className={`absolute inset-0 w-full h-full ${cover ? "object-cover" : "object-contain"}`}
      />
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((v) => !v); }}
        className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center z-10"
      >
        {muted ? <VolumeX className="w-4 h-4 yb-text" /> : <Volume2 className="w-4 h-4 yb-text" />}
      </button>
    </div>
  );
}

export function MediaTile({ m, Icon, active, cover = true }) {
  if (!m) return null;
  const isVideo = m.type === MEDIA_TYPE.VIDEO || m.t === MEDIA_TYPE.VIDEO || (m.url || "").endsWith(".mp4");
  if (isVideo) return <VideoTile m={m} active={active} cover={cover} />;
  return <GradientTile m={m} Icon={Icon} />;
}
