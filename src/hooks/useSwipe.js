import { useRef, useState, useCallback } from "react";

export function useSwipe({ onUp, onDown, onLeft, onRight, onTap, threshold = 60 }) {
  const startX = useRef(0), startY = useRef(0), dx = useRef(0), dy = useRef(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dx.current = 0; dy.current = 0;
  }, []);

  const onTouchMove = useCallback((e) => {
    dx.current = e.touches[0].clientX - startX.current;
    dy.current = e.touches[0].clientY - startY.current;
    Math.abs(dx.current) > Math.abs(dy.current)
      ? setOffset({ x: dx.current, y: 0 })
      : setOffset({ x: 0, y: dy.current });
  }, []);

  const onTouchEnd = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    const ax = Math.abs(dx.current), ay = Math.abs(dy.current);
    if (ax < 8 && ay < 8) { onTap?.(); return; }
    if (ax > ay) { dx.current < -threshold ? onLeft?.() : dx.current > threshold && onRight?.(); }
    else          { dy.current < -threshold ? onUp?.()   : dy.current > threshold && onDown?.(); }
    dx.current = 0; dy.current = 0;
  }, [onUp, onDown, onLeft, onRight, onTap, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd, offset };
}
