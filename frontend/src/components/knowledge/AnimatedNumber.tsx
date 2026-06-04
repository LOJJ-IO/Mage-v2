'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Animation duration in ms when value changes */
  duration?: number;
  className?: string;
}

/** Count up (or down) smoothly when `value` changes. */
export function AnimatedNumber({
  value,
  duration = 900,
  className,
}: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => {
    if (safeValue === targetRef.current) return;

    const startVal = displayRef.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(startVal + (safeValue - startVal) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        targetRef.current = safeValue;
        displayRef.current = safeValue;
        setDisplay(safeValue);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeValue, duration]);

  return <span className={className}>{display}</span>;
}
