'use client';

import { ReactNode, useCallback, useRef, useState } from 'react';
import { StaffAction } from '@/types';
import { IconMore } from './StaffIcons';
import { StaffKanbanCard } from './StaffKanbanCard';
import { getGuestRequestIndex, isDuplicateRequest } from './staffTaskQuery';
import type { KanbanColumnId } from './StaffKanbanColumn';

interface StaffKanbanMobileColumnProps {
  columnId: KanbanColumnId;
  title: string;
  icon: ReactNode;
  iconBgClass: string;
  actions: StaffAction[];
  allActions: StaffAction[];
  guestMessageCounts: Record<string, number>;
  onSelect: (id: string) => void;
}

export function StaffKanbanMobileColumn({
  columnId,
  title,
  icon,
  iconBgClass,
  actions,
  allActions,
  guestMessageCounts,
  onSelect,
}: StaffKanbanMobileColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(index, Math.max(actions.length - 1, 0)));
  }, [actions.length]);

  const isEmpty = actions.length === 0;

  return (
    <section className="shrink-0">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}
        >
          {icon}
        </span>
        <h2 className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
        <button
          type="button"
          className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label={`${title} options`}
        >
          <IconMore className="h-4 w-4" />
        </button>
      </div>

      {isEmpty ? (
        <div className="mx-1 flex h-[148px] items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/60 text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/40">
          {columnId === 'done' ? 'No completed tasks yet' : 'No tasks here'}
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {actions.map((action) => {
              const indexInfo = getGuestRequestIndex(action, allActions);
              return (
                <div
                  key={action.id}
                  className="w-full shrink-0 snap-center px-1"
                >
                  <StaffKanbanCard
                    action={action}
                    variant="mobile"
                    onSelect={onSelect}
                    requestIndexLabel={
                      indexInfo ? `${indexInfo.index}/${indexInfo.total}` : undefined
                    }
                    requestIndex={indexInfo?.index}
                    requestTotal={indexInfo?.total}
                    sessionMessageCount={guestMessageCounts[action.guestId] ?? 0}
                    isDuplicate={isDuplicateRequest(action, allActions)}
                  />
                </div>
              );
            })}
          </div>

          {actions.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {actions.map((action, index) => (
                <button
                  key={action.id}
                  type="button"
                  aria-label={`Go to card ${index + 1}`}
                  onClick={() => {
                    const el = scrollRef.current;
                    if (!el) return;
                    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
                    setActiveIndex(index);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    index === activeIndex
                      ? 'w-4 bg-neutral-800 dark:bg-neutral-200'
                      : 'w-1.5 bg-neutral-300 dark:bg-neutral-600'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
