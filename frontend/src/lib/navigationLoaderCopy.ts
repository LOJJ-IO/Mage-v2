export type NavigationCopy = {
  title: string;
  description: string;
  tagline?: string;
};

export type LoaderVariant = 'intro' | 'spinner';

export function normalizeNavigationPath(path: string): string {
  const pathname = path.split('?')[0] || '/';
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

const INTRO_ONBOARD_COPY: NavigationCopy = {
  title: 'Lojj',
  description: 'Getting your stay ready.',
  tagline: 'Pick how you would like to join — guest, staff, or manager.',
};

const NAVIGATION_COPY: Record<string, NavigationCopy> = {
  '/': {
    title: 'Loading guest app',
    description: 'Getting your stay ready.',
  },
  '/onboard': {
    title: 'Loading sign-in',
    description: 'Preparing your options.',
  },
  '/onboard/guest': {
    title: 'Loading guest access',
    description: 'Setting up your sign-in page.',
  },
  '/onboard/staff': {
    title: 'Loading staff portal',
    description: 'Setting up your workspace.',
  },
  '/onboard/admin': {
    title: 'Loading manager portal',
    description: 'Setting up your admin dashboard.',
  },
  '/staff': {
    title: 'Loading staff workspace',
    description: 'Opening your team tools.',
  },
};

const ONBOARD_PREFIX = '/onboard';

/** Routes that should show a loader on direct URL entry (refresh, typed URL, external link). */
export function isDirectEntryRoute(path: string): boolean {
  const normalized = normalizeNavigationPath(path);
  return (
    normalized === '/' ||
    normalized === ONBOARD_PREFIX ||
    normalized.startsWith(`${ONBOARD_PREFIX}/`) ||
    normalized === '/staff'
  );
}

/** Loader style for a direct visit (no prior in-app route). */
export function getDirectVisitLoaderVariant(path: string): LoaderVariant {
  const normalized = normalizeNavigationPath(path);
  if (normalized === ONBOARD_PREFIX) return 'intro';
  return 'spinner';
}

/** Use the lo-fi intro splash when landing on the onboarding hub. */
export function getNavigationLoaderVariant(
  fromPath: string,
  toPath: string
): LoaderVariant {
  const from = normalizeNavigationPath(fromPath);
  const to = normalizeNavigationPath(toPath);
  if (to === ONBOARD_PREFIX && (from === '/' || from === '/welcome' || from === '')) {
    return 'intro';
  }
  return 'spinner';
}

export function getNavigationCopy(
  path: string,
  options?: { fromPath?: string; variant?: LoaderVariant }
): NavigationCopy {
  const normalized = normalizeNavigationPath(path);
  const variant =
    options?.variant ??
    (options?.fromPath
      ? getNavigationLoaderVariant(options.fromPath, normalized)
      : 'spinner');

  if (variant === 'intro' && normalized === '/onboard') {
    return INTRO_ONBOARD_COPY;
  }

  return (
    NAVIGATION_COPY[normalized] ?? {
      title: 'Loading',
      description: 'Please wait a moment.',
    }
  );
}
