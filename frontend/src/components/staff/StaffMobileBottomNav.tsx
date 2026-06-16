'use client';

import { StaffNavId } from './staffNav';
import { StaffNavIcon } from './StaffNavIcon';
import { IconList } from './StaffIcons';

const MOBILE_NAV_ITEMS: { id: StaffNavId | 'menu'; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'guest-chat', label: 'Chats' },
  { id: 'review', label: 'Reviews' },
  { id: 'menu', label: 'More' },
];

interface StaffMobileBottomNavProps {
  activeNav: StaffNavId;
  guestUnreadCount: number;
  onNavChange: (nav: StaffNavId) => void;
  onOpenMenu: () => void;
}

export function StaffMobileBottomNav({
  activeNav,
  guestUnreadCount,
  onNavChange,
  onOpenMenu,
}: StaffMobileBottomNavProps) {
  const isTaskView = activeNav === 'tasks' || activeNav === 'assigned';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Staff navigation"
    >
      <div className="flex w-full max-w-md items-center justify-around rounded-full border border-neutral-200/80 bg-white/95 px-2 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-neutral-700/80 dark:bg-neutral-900/95">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive =
            item.id === 'menu'
              ? false
              : item.id === 'tasks'
                ? isTaskView
                : activeNav === item.id;

          const badge =
            item.id === 'guest-chat' && guestUnreadCount > 0 ? guestUnreadCount : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'menu') {
                  onOpenMenu();
                } else {
                  onNavChange(item.id);
                }
              }}
              className="relative flex flex-1 flex-col items-center gap-0.5 px-1 py-1"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? 'bg-amber-300 text-neutral-900 dark:bg-amber-400'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {item.id === 'menu' ? (
                  <IconList className="h-5 w-5" />
                ) : (
                  <StaffNavIcon nav={item.id} className="h-5 w-5" />
                )}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  isActive
                    ? 'text-neutral-900 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-500'
                }`}
              >
                {item.label}
              </span>
              {badge !== null && (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
