'use client';

import { useEffect, useRef, useState } from 'react';

interface NumberTickerProps {
  value: number;
  className?: string;
  decimals?: number;
  suffix?: string;
}

export function NumberTicker({ value, className = '', decimals = 0, suffix = '' }: NumberTickerProps) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    const duration = 600;
    const started = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + diff * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted =
    decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString();

  return (
    <span className={className}>
      {formatted}
      {suffix}
    </span>
  );
}
