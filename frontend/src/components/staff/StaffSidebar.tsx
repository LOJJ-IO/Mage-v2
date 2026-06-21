'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { StaffRole } from '@/lib/staffPermissions';
import {
  IconBook,
  IconCalendar,
  IconClipboard,
  IconLayers,
  IconMageLogo,
  IconMessage,
  IconSearch,
  IconSidebarPanel,
  IconStar,
  IconUser,
} from './StaffIcons';
import { STAFF_NAV_ITEMS, StaffNavId } from './staffNav';
import { StaffAvatar, formatStaffRoleLabel } from './staffAvatar';

interface StaffSidebarProps {
  activeNav: StaffNavId;
  guestUnreadCount?: number;
  allowedNav?: StaffNavId[];
  staffDisplayName?: string;
  staffCode?: string;
  staffRole?: StaffRole;
  onNavChange: (id: StaffNavId) => void;
  onLogout: () => void;
}

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cn = className ?? 'w-5 h-5 shrink-0';
  switch (icon) {
    case 'star':
      return <IconStar className={`${cn} text-violet-500`} />;
    case 'user':
      return <IconUser className={cn} />;
    case 'clipboard':
      return <IconClipboard className={cn} />;
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

const navButtonClass = cn(
  'h-10 gap-3 px-3',
  'group-data-[collapsible=icon]:!h-auto group-data-[collapsible=icon]:!w-full',
  'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1',
  'group-data-[collapsible=icon]:py-2.5 group-data-[collapsible=icon]:px-1',
  'group-data-[collapsible=icon]:[&>svg]:!size-5',
  'group-data-[collapsible=icon]:[&>span]:text-[10px] group-data-[collapsible=icon]:[&>span]:leading-tight',
  'group-data-[collapsible=icon]:[&>span]:text-center group-data-[collapsible=icon]:[&>span]:w-full'
);

function StaffSidebarHeader() {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;

  return (
    <SidebarHeader className="h-14 shrink-0 gap-0 border-b border-sidebar-border p-0">
      <div className="flex h-full w-full items-center">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-full w-[var(--sidebar-width-icon)] shrink-0 items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Toggle sidebar"
        >
          <IconSidebarPanel className="h-5 w-5" />
        </button>
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-3">
            <IconMageLogo />
            <span className="truncate text-sm font-semibold text-sidebar-foreground">Mage Hotel</span>
          </div>
        )}
      </div>
    </SidebarHeader>
  );
}

export function StaffSidebar({
  activeNav,
  guestUnreadCount = 0,
  allowedNav,
  staffDisplayName = 'Staff',
  staffCode = 'staff',
  staffRole = 'front_desk',
  onNavChange,
  onLogout,
}: StaffSidebarProps) {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;

  const visibleNavItems = allowedNav
    ? STAFF_NAV_ITEMS.filter((item) => allowedNav.includes(item.id))
    : STAFF_NAV_ITEMS;

  const handleNav = (id: StaffNavId) => {
    onNavChange(id);
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <StaffSidebarHeader />

      <SidebarContent>
        {state === 'expanded' && (
          <SidebarGroup className="py-2">
            <SidebarGroupContent className="px-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <SidebarInput placeholder="Search" className="pl-9" />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const isActive = item.id === activeNav;

                if (item.href) {
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild isActive={isActive} className={navButtonClass}>
                        <a href={item.href}>
                          <NavIcon icon={item.icon} />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const shortLabel =
                  item.id === 'guest-chat'
                    ? 'Chats'
                    : item.id === 'help-desk'
                      ? 'Help'
                      : item.id === 'review'
                        ? 'Reviews'
                        : item.id === 'assigned'
                          ? 'Assigned'
                          : item.id === 'knowledge'
                            ? 'Knowledge'
                            : item.label.split(' ')[0];

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      className={navButtonClass}
                      onClick={() => handleNav(item.id)}
                    >
                      <NavIcon icon={item.icon} />
                      <span>{isCollapsed ? shortLabel : item.label}</span>
                      {item.id === 'guest-chat' && guestUnreadCount > 0 && !isCollapsed && (
                        <SidebarMenuBadge className="bg-mage-blue text-white">
                          {guestUnreadCount > 99 ? '99+' : guestUnreadCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuButton>
                    {item.id === 'guest-chat' && guestUnreadCount > 0 && isCollapsed && (
                      <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-mage-blue" />
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <div
          className={cn(
            'flex rounded-lg px-1 py-1',
            isCollapsed ? 'flex-col items-center gap-1.5' : 'flex-row items-center gap-2'
          )}
        >
          <StaffAvatar
            name={staffDisplayName}
            seed={staffCode}
            size={isCollapsed ? 'sm' : 'md'}
            className={isCollapsed ? 'shrink-0' : undefined}
          />
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {staffDisplayName}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {formatStaffRoleLabel(staffRole)}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              isCollapsed && 'h-8 w-8'
            )}
            aria-label={`Log out (${staffDisplayName})`}
            title="Log out"
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
