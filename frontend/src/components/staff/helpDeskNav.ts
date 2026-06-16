import {
  BRANCH_CHILDREN,
  CORE_DOMAIN_ORDER,
  formatFactValue,
  isBranchHidden,
  isCoreSlot,
  isFieldComplete,
  sortSlotsForDisplay,
  type PropertyFact,
  type Slot,
} from '@/components/knowledge';

export type HelpDeskSelection =
  | { type: 'home' }
  | { type: 'section'; sectionId: string }
  | { type: 'subsection'; sectionId: string; subsectionId: string }
  | { type: 'slot'; slotKey: string };

export type HelpDeskNavSubsection = {
  id: string;
  label: string;
  slotKeys: string[];
};

export type HelpDeskNavSection = {
  id: string;
  label: string;
  description: string;
  subsections: HelpDeskNavSubsection[];
  /** All slot keys in this section (for search / home stats). */
  slotKeys: string[];
};

export type HelpDeskCategoryCard = {
  sectionId: string;
  label: string;
  description: string;
  filledCount: number;
  totalCount: number;
};

const SECTION_COPY: Record<string, { label: string; description: string }> = {
  property: {
    label: 'Property',
    description: 'Check-in, Wi-Fi, location, and other essentials guests ask about first.',
  },
  amenities: {
    label: 'Amenities',
    description: 'Pool, fitness, spa, and on-site facilities.',
  },
  dining: {
    label: 'Dining',
    description: 'Restaurants, breakfast, bar, and room service.',
  },
  details: {
    label: 'Additional details',
    description: 'Parking, policies, room features, services, and transport.',
  },
  staff: {
    label: 'Staff knowledge',
    description: 'Answers your team added — things only staff know.',
  },
};

function subsectionId(sectionId: string, label: string): string {
  return `${sectionId}--${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function groupDomainSlots(domainSlots: Slot[]): HelpDeskNavSubsection[] {
  const sorted = sortSlotsForDisplay(domainSlots);
  const used = new Set<string>();
  const subsections: HelpDeskNavSubsection[] = [];

  for (const slot of sorted) {
    if (used.has(slot.key)) continue;
    if (BRANCH_CHILDREN[slot.key]) {
      const childKeys = BRANCH_CHILDREN[slot.key].filter((key) =>
        sorted.some((s) => s.key === key)
      );
      subsections.push({
        id: subsectionId('branch', slot.key),
        label: slot.label,
        slotKeys: [slot.key, ...childKeys],
      });
      used.add(slot.key);
      childKeys.forEach((key) => used.add(key));
      continue;
    }

    const parentKey = Object.entries(BRANCH_CHILDREN).find(([, children]) =>
      children.includes(slot.key)
    )?.[0];
    if (parentKey) continue;

    const sectionName = slot.markdown_section || slot.label;
    let subsection = subsections.find((s) => s.label === sectionName);
    if (!subsection) {
      subsection = {
        id: subsectionId('md', sectionName),
        label: sectionName,
        slotKeys: [],
      };
      subsections.push(subsection);
    }
    subsection.slotKeys.push(slot.key);
    used.add(slot.key);
  }

  return subsections.filter((s) => s.slotKeys.length > 0);
}

function buildSection(
  id: string,
  slots: Slot[],
  facts: Record<string, PropertyFact>
): HelpDeskNavSection | null {
  const visible = slots.filter((s) => !isBranchHidden(s.key, facts));
  if (!visible.length) return null;

  const copy = SECTION_COPY[id] ?? {
    label: id.replace(/_/g, ' '),
    description: 'Guest-facing answers from your property knowledge.',
  };

  return {
    id,
    label: copy.label,
    description: copy.description,
    subsections: groupDomainSlots(visible),
    slotKeys: visible.map((s) => s.key),
  };
}

export function buildHelpDeskNav(
  slots: Slot[],
  facts: Record<string, PropertyFact>
): HelpDeskNavSection[] {
  const structured = slots.filter((s) => s.domain !== 'staff');
  const sections: HelpDeskNavSection[] = [];

  for (const domain of CORE_DOMAIN_ORDER) {
    const domainSlots = structured.filter(
      (s) => s.domain === domain && isCoreSlot(s)
    );
    const section = buildSection(domain, domainSlots, facts);
    if (section) sections.push(section);
  }

  const detailSlots = structured.filter((s) => !isCoreSlot(s));
  const detailsSection = buildSection('details', detailSlots, facts);
  if (detailsSection) sections.push(detailsSection);

  const staffSlots = slots.filter((s) => s.domain === 'staff');
  const staffSection = buildSection('staff', staffSlots, facts);
  if (staffSection) sections.push(staffSection);

  return sections;
}

export function buildCategoryCards(
  nav: HelpDeskNavSection[],
  facts: Record<string, PropertyFact>
): HelpDeskCategoryCard[] {
  return nav.map((section) => {
    const filledCount = section.slotKeys.filter((key) => {
      const fact = facts[key];
      return fact?.value != null && fact.value !== '' && fact.status !== 'unknown';
    }).length;
    return {
      sectionId: section.id,
      label: section.label,
      description: section.description,
      filledCount,
      totalCount: section.slotKeys.length,
    };
  });
}

export function getTrendingSlots(
  slots: Slot[],
  facts: Record<string, PropertyFact>,
  limit = 6
): Slot[] {
  const ranked = slots
    .filter((slot) => {
      if (isBranchHidden(slot.key, facts)) return false;
      const fact = facts[slot.key];
      return fact?.value != null && fact.value !== '' && fact.status !== 'unknown';
    })
    .sort((a, b) => {
      const tierScore = (s: Slot) => (s.tier === 'A' ? 0 : 1);
      const completeScore = (s: Slot) => (isFieldComplete(facts[s.key]) ? 0 : 1);
      const tierDiff = tierScore(a) - tierScore(b);
      if (tierDiff !== 0) return tierDiff;
      return completeScore(a) - completeScore(b);
    });

  return ranked.slice(0, limit);
}

export function slotSearchText(
  slot: Slot,
  fact: PropertyFact | undefined,
  sectionLabel?: string
): string {
  return [
    slot.label,
    slot.key,
    slot.domain,
    slot.markdown_section,
    sectionLabel,
    formatFactValue(fact?.value),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function findSlotSection(
  nav: HelpDeskNavSection[],
  slotKey: string
): HelpDeskNavSection | undefined {
  return nav.find((section) => section.slotKeys.includes(slotKey));
}

export function findSlotSubsection(
  section: HelpDeskNavSection,
  slotKey: string
): HelpDeskNavSubsection | undefined {
  return section.subsections.find((sub) => sub.slotKeys.includes(slotKey));
}
