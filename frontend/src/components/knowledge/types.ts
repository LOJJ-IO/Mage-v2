export type WidgetType =
  | 'toggle'
  | 'time'
  | 'time_range'
  | 'text'
  | 'phone'
  | 'currency'
  | 'textarea'
  | 'multiple_choice'
  | 'text_with_chips'
  | 'toggle_then_choice';

export type FieldState = 'confirmed' | 'verify' | 'empty';

export type PropertyFact = {
  value?: unknown;
  status: string;
  source_url?: string;
  confidence?: number;
  extraction_method?: string;
};

export type Slot = {
  key: string;
  domain: string;
  tier: string;
  label: string;
  value_type?: string;
  widget?: string;
  question?: string;
  options?: string[];
  placeholder?: string;
  suggestions?: string[];
};

export type KnowledgeGap = {
  id: string;
  question: string;
  count: number;
};

export const BRANCH_CHILDREN: Record<string, string[]> = {
  'parking.self.available': ['parking.self.location', 'parking.self.rate'],
  'parking.valet.available': ['parking.valet.rate'],
  'amenities.pool.available': ['amenities.pool.hours', 'amenities.pool.location'],
  'amenities.fitness.available': ['amenities.fitness.hours', 'amenities.fitness.location'],
  'amenities.spa.available': ['amenities.spa.hours'],
  'dining.restaurant.available': ['dining.restaurant.hours'],
  'dining.breakfast.available': ['dining.breakfast.hours', 'dining.breakfast.type'],
  'dining.bar.available': ['dining.bar.hours'],
  'dining.room_service.available': ['dining.room_service.hours'],
};

export const CHECK_IN_PRESETS = ['2:00 PM', '3:00 PM', '4:00 PM'];
export const CHECK_OUT_PRESETS = ['10:00 AM', '11:00 AM', '12:00 PM'];
export const POOL_PRESETS = ['6AM–9PM', '7AM–10PM', '24hrs'];
export const RESTAURANT_PRESETS = ['7AM–10PM', '6AM–11PM', '7AM–11PM'];
export const FITNESS_PRESETS = ['6AM–10PM', '24hrs', '5AM–11PM'];
export const SPA_PRESETS = ['9AM–8PM', '10AM–9PM', 'By appointment only'];

export function getFieldState(fact: PropertyFact | undefined): FieldState {
  if (!fact || fact.status === 'unknown') return 'empty';
  if (fact.status === 'verified') return 'confirmed';
  const highConfidenceMethods = ['json_ld', 'google_places', 'policy_box'];
  const confidence = fact.confidence ?? 0;
  if (
    highConfidenceMethods.includes(fact.extraction_method ?? '') &&
    confidence >= 0.9
  ) {
    return 'confirmed';
  }
  if (fact.value != null && fact.value !== '') return 'verify';
  return 'empty';
}

export function getWidgetType(slotKey: string, slot?: Slot): WidgetType {
  if (slot?.widget) {
    return slot.widget as WidgetType;
  }
  if (slotKey.endsWith('.available') || slotKey.endsWith('.allowed')) return 'toggle';
  if (slotKey.includes('parking.self.available') || slotKey.includes('valet.available')) {
    return 'toggle';
  }
  if (slotKey.endsWith('.time')) return 'time';
  if (slotKey.endsWith('.hours')) return 'time_range';
  if (slotKey.includes('phone')) return 'phone';
  if (
    slotKey.includes('.fee.') ||
    slotKey.includes('.rate.') ||
    slotKey.includes('.price.')
  ) {
    return 'currency';
  }
  if (slotKey.includes('policy') || slotKey.includes('instructions')) return 'textarea';
  return 'text';
}

export function getParentKey(slotKey: string): string | null {
  for (const [parent, children] of Object.entries(BRANCH_CHILDREN)) {
    if (children.includes(slotKey)) return parent;
  }
  return null;
}

export function isBranchHidden(
  slotKey: string,
  facts: Record<string, PropertyFact>
): boolean {
  const parentKey = getParentKey(slotKey);
  if (!parentKey) return false;
  const parentFact = facts[parentKey];
  if (!parentFact || parentFact.status === 'not_applicable') return true;
  if (parentFact.value === false) return true;
  if (parentFact.value === 'false' || parentFact.value === 'no') return true;
  return false;
}

export function isFieldComplete(fact: PropertyFact | undefined): boolean {
  if (!fact) return false;
  return fact.status === 'verified' || fact.status === 'not_applicable';
}

export function formatFactValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function getTimeRangePresets(slotKey: string): string[] {
  if (slotKey.includes('spa')) return SPA_PRESETS;
  if (slotKey.includes('pool')) return POOL_PRESETS;
  if (slotKey.includes('restaurant') || slotKey.includes('breakfast') || slotKey.includes('bar')) {
    return RESTAURANT_PRESETS;
  }
  if (slotKey.includes('fitness') || slotKey.includes('gym')) return FITNESS_PRESETS;
  return POOL_PRESETS;
}

export function getTimePresets(slotKey: string): string[] {
  if (slotKey.includes('check_out') || slotKey.includes('checkout')) {
    return CHECK_OUT_PRESETS;
  }
  return CHECK_IN_PRESETS;
}
