import { useState, useRef, useCallback } from "react";

export function useScrollHeader() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  const onScroll = useCallback((e) => {
    const y = e.currentTarget.scrollTop;
    setVisible(y < lastY.current || y < 60);
    lastY.current = y;
  }, []);

  return { visible, onScroll };
}
