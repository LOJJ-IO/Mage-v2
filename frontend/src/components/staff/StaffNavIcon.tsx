import { StaffNavId } from './staffNav';
import {
  IconBook,
  IconCalendar,
  IconClipboard,
  IconLayers,
  IconMessage,
  IconStar,
  IconUser,
} from './StaffIcons';

interface StaffNavIconProps {
  nav: StaffNavId;
  className?: string;
}

export function StaffNavIcon({ nav, className = 'w-5 h-5' }: StaffNavIconProps) {
  switch (nav) {
    case 'review':
      return <IconStar className={className} />;
    case 'assigned':
      return <IconUser className={className} />;
    case 'tasks':
      return <IconClipboard className={className} />;
    case 'schedule':
      return <IconCalendar className={className} />;
    case 'guest-chat':
      return <IconMessage className={className} />;
    case 'knowledge':
      return <IconLayers className={className} />;
    case 'help-desk':
      return <IconBook className={className} />;
  }
}
