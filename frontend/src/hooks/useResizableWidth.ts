'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

const STORAGE_PREFIX = 'mage-resize-';

export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
) {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(defaultWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
      if (!raw) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        const clamped = Math.max(minWidth, Math.min(maxWidth, parsed));
        widthRef.current = clamped;
        setWidth(clamped);
      }
    } catch {
      // ignore
    }
  }, [storageKey, minWidth, maxWidth]);

  const persist = useCallback(
    (value: number) => {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(value));
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const startResize = useCallback(
    (direction: 1 | -1) => (event: React.MouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      const startX = event.clientX;
      const startWidth = widthRef.current;

      const onMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = (moveEvent.clientX - startX) * direction;
        const next = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        widthRef.current = next;
        setWidth(next);
      };

      const onUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        persist(widthRef.current);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [minWidth, maxWidth, persist]
  );

  return { width, startResize };
}
