'use client';

import {
  IconBell,
  IconCalendar,
  IconChevronDown,
  IconLayoutGrid,
  IconList,
  IconMageLogo,
  IconMessage,
  IconSearch,
  IconStar,
  IconUser,
} from './StaffIcons';
import { STAFF_NAV_ITEMS, StaffNavId } from './staffNav';

interface StaffSidebarProps {
  activeNav: StaffNavId;
  pendingCount: number;
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
    default:
      return null;
  }
}

export function StaffSidebar({
  activeNav,
  pendingCount,
  onNavChange,
  onLogout,
  mobileOpen,
  onMobileClose,
}: StaffSidebarProps) {
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
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <IconStar className="w-4 h-4 text-violet-500" />
          <span>Mage Assistant</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <IconBell className="w-4 h-4" />
          <span className="flex-1 text-left">Notifications</span>
          {pendingCount > 0 && (
            <span className="min-w-[20px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-semibold text-white">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <IconLayoutGrid className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        {STAFF_NAV_ITEMS.map((item) => {
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
              <span className="text-left">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-1">
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
        className={`fixed inset-y-0 left-0 z-50 w-[260px] shrink-0 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
