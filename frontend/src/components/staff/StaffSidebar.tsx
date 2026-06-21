'use client';

import { useMageStore } from '@/store/mageStore';
import { ResizablePanel } from './ResizablePanel';
import { useMediaQuery } from '@/hooks/useResizableWidth';
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconList,
  IconMageLogo,
  IconHeadset,
  IconLayers,
  IconMessage,
  IconSearch,
  IconStar,
  IconUser,
} from './StaffIcons';
import { STAFF_NAV_ITEMS, StaffNavId } from './staffNav';

interface StaffSidebarProps {
  activeNav: StaffNavId;
  guestUnreadCount?: number;
  allowedNav?: StaffNavId[];
  onNavChange: (id: StaffNavId) => void;
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cn = className ?? 'w-4 h-4 shrink-0';
  switch (icon) {
    case 'star':
      return <IconStar className={`${cn} text-violet-500`} />;
    case 'user':
      return <IconUser className={cn} />;
    case 'list':
      return <IconList className={cn} />;
    case 'calendar':
      return <IconCalendar className={cn} />;
    case 'message':
      return <IconMessage className={cn} />;
    case 'book':
      return <IconBook className={cn} />;
    case 'layers':
      return <IconLayers className={cn} />;
    default:
      return null;
  }
}

export function StaffSidebar({
  activeNav,
  guestUnreadCount = 0,
  allowedNav,
  onNavChange,
  onLogout,
  mobileOpen,
  onMobileClose,
}: StaffSidebarProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const theme = useMageStore((s) => s.theme);
  const setTheme = useMageStore((s) => s.setTheme);
  const isDark = theme === 'dark';
  const visibleNavItems = allowedNav
    ? STAFF_NAV_ITEMS.filter((item) => allowedNav.includes(item.id))
    : STAFF_NAV_ITEMS;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800">
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <IconMageLogo />
          <span className="flex-1 text-left">Mage Hotel</span>
          <IconChevronDown className="w-4 h-4 text-neutral-400" />
        </button>
      </div>

      <div className="px-3 py-3">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="search"
            placeholder="Search"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 py-2 pl-9 pr-12 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
            /
          </kbd>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {visibleNavItems.map((item) => {
          const isActive = activeNav === item.id;
          const className = `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? 'bg-neutral-100 dark:bg-neutral-800 font-semibold text-neutral-900 dark:text-white'
              : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900'
          }`;

          if (item.href) {
            return (
              <a
                key={item.id}
                href={item.href}
                className={className}
                onClick={onMobileClose}
              >
                <NavIcon icon={item.icon} />
                <span>{item.label}</span>
              </a>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavChange(item.id);
                onMobileClose?.();
              }}
              className={className}
            >
              <NavIcon icon={item.icon} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'guest-chat' && guestUnreadCount > 0 && (
                <span className="inline-flex min-w-[20px] items-center gap-1 rounded-full bg-mage-blue px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <IconHeadset className="w-3 h-3" />
                  {guestUnreadCount > 99 ? '99+' : guestUnreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {isDark ? 'Dark mode' : 'Light mode'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="relative h-6 w-10 shrink-0 rounded-full bg-neutral-200 transition-colors dark:bg-neutral-700"
          >
            <span
              className={`absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm transition-transform duration-200 dark:bg-neutral-200 dark:text-neutral-900 ${
                isDark ? 'translate-x-4' : 'translate-x-0'
              }`}
            >
              {isDark ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 3a9 9 0 109 9c-.53 0-1.04-.08-1.54-.22A6.5 6.5 0 0112 3.5V3z" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white"
        >
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 shrink-0 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <ResizablePanel
          storageKey="staff-sidebar"
          defaultWidth={260}
          minWidth={200}
          maxWidth={380}
          resizable={isDesktop}
          className="h-full w-[260px] lg:w-auto"
        >
          {sidebarContent}
        </ResizablePanel>
      </aside>
    </>
  );
}
