'use client';

import { ReactNode } from 'react';
import { useResizableWidth } from '@/hooks/useResizableWidth';

interface ResizablePanelProps {
  children: ReactNode;
  /** localStorage key suffix */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Panel is on the left (handle on right edge) or right (handle on left edge) */
  side?: 'left' | 'right';
  className?: string;
  /** Disable resize (e.g. mobile drawer) */
  resizable?: boolean;
}

export function ResizablePanel({
  children,
  storageKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 560,
  side = 'left',
  className = '',
  resizable = true,
}: ResizablePanelProps) {
  const { width, startResize } = useResizableWidth(
    storageKey,
    defaultWidth,
    minWidth,
    maxWidth
  );
  const direction = side === 'left' ? 1 : -1;

  return (
    <div
      className={`relative flex h-full min-h-0 shrink-0 flex-col ${className}`}
      style={{ width: resizable ? width : defaultWidth }}
    >
      {children}
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          title="Drag to resize"
          onMouseDown={startResize(direction)}
          className={`absolute top-0 bottom-0 z-10 w-1.5 touch-none transition-colors hover:bg-[#0078d4]/25 active:bg-[#0078d4]/40 ${
            side === 'left' ? 'right-0 translate-x-1/2 cursor-col-resize' : 'left-0 -translate-x-1/2 cursor-col-resize'
          }`}
        />
      )}
    </div>
  );
}

interface ResizableSplitProps {
  storageKey: string;
  defaultLeftWidth: number;
  minLeft?: number;
  maxLeft?: number;
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

/** Two-pane horizontal layout with draggable divider (not for Kanban columns). */
export function ResizableSplit({
  storageKey,
  defaultLeftWidth,
  minLeft = 200,
  maxLeft = 520,
  left,
  right,
  className = '',
}: ResizableSplitProps) {
  const { width, startResize } = useResizableWidth(
    storageKey,
    defaultLeftWidth,
    minLeft,
    maxLeft
  );

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${className}`}>
      <div className="relative flex h-full min-h-0 shrink-0 flex-col" style={{ width }}>
        {left}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          title="Drag to resize"
          onMouseDown={startResize(1)}
          className="absolute right-0 top-0 bottom-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize touch-none hover:bg-[#0078d4]/25 active:bg-[#0078d4]/40"
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}
