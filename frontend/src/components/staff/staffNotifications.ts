import { StaffAction } from '@/types';

/** Guest explicitly connected to front desk live chat (not routine Mage-logged tasks). */
export function isDirectGuestChatAction(action: StaffAction): boolean {
  if (action.allowStaffJumpIn === false) return false;
  if (action.actionType === 'CONTACT_FRONT_DESK') return true;
  if (action.escalationType === 'contact') return true;
  return false;
}

export function countDirectGuestChatPending(actions: StaffAction[]): number {
  return actions.filter((action) => action.status === 'pending' && isDirectGuestChatAction(action))
    .length;
}
