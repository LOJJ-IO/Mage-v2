import { useCallback, useRef, useState, TouchEvent } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  preventScroll?: boolean;
}

interface SwipeState {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | 'up' | 'down' | null;
}

export function useSwipeGesture(config: SwipeConfig) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    preventScroll = false,
  } = config;

  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    isSwiping: false,
    direction: null,
  });

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastDeltaRef = useRef<{
    deltaX: number;
    deltaY: number;
    direction: 'left' | 'right' | 'up' | 'down' | null;
  }>({ deltaX: 0, deltaY: 0, direction: null });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    lastDeltaRef.current = { deltaX: 0, deltaY: 0, direction: null };
    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      isSwiping: true,
      direction: null,
    });
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    let direction: 'left' | 'right' | 'up' | 'down' | null = null;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    lastDeltaRef.current = { deltaX, deltaY, direction };

    if (preventScroll) {
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
      } else if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
        e.preventDefault();
      }
    }

    setSwipeState((prev) => ({
      ...prev,
      deltaX,
      deltaY,
      direction,
    }));
  }, [preventScroll]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;

    const { deltaX, deltaY, direction } = lastDeltaRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > threshold && absX > absY) {
      if (direction === 'left' && onSwipeLeft) {
        onSwipeLeft();
      } else if (direction === 'right' && onSwipeRight) {
        onSwipeRight();
      }
    } else if (absY > threshold && absY > absX) {
      if (direction === 'up' && onSwipeUp) {
        onSwipeUp();
      } else if (direction === 'down' && onSwipeDown) {
        onSwipeDown();
      }
    }

    touchStartRef.current = null;
    lastDeltaRef.current = { deltaX: 0, deltaY: 0, direction: null };
    setSwipeState({
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
      isSwiping: false,
      direction: null,
    });
  }, [threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  return {
    handlers,
    swipeState,
    isSwiping: swipeState.isSwiping,
    direction: swipeState.direction,
    deltaX: swipeState.deltaX,
    deltaY: swipeState.deltaY,
  };
}

// Hook for long press (hold) detection
interface LongPressConfig {
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  onCancel?: () => void;
  delay?: number;
}

export function useLongPress(config: LongPressConfig) {
  const {
    onLongPressStart,
    onLongPressEnd,
    onCancel,
    delay = 200,
  } = config;

  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsPressed(true);
      onLongPressStart?.();
    }, delay);
  }, [delay, onLongPressStart]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isLongPressRef.current) {
      onLongPressEnd?.();
    } else {
      onCancel?.();
    }

    isLongPressRef.current = false;
    setIsPressed(false);
  }, [onLongPressEnd, onCancel]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isLongPressRef.current = false;
    setIsPressed(false);
    onCancel?.();
  }, [onCancel]);

  const handlers = {
    onTouchStart: start,
    onTouchEnd: stop,
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: cancel,
  };

  return {
    handlers,
    isPressed,
  };
}
