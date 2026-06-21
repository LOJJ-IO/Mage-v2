'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IntroSplashLoader } from '@/components/IntroSplashLoader';
import { ScreenTransitionLoader } from '@/components/ScreenTransitionLoader';
import {
  getDirectVisitLoaderVariant,
  getNavigationCopy,
  getNavigationLoaderVariant,
  isDirectEntryRoute,
  normalizeNavigationPath,
  type LoaderVariant,
  type NavigationCopy,
} from '@/lib/navigationLoaderCopy';

type PendingNavigation = NavigationCopy & {
  targetPath: string;
  startedAt: number;
  variant: LoaderVariant;
};

type NavigationLoaderContextValue = {
  navigate: (href: string, copy?: Partial<NavigationCopy>) => void;
  replace: (href: string, copy?: Partial<NavigationCopy>) => void;
  beginLoading: (targetPath: string, copy?: Partial<NavigationCopy>) => void;
  markNavigationReady: (path?: string) => void;
  isNavigating: boolean;
};

const NavigationLoaderContext = createContext<NavigationLoaderContextValue | null>(
  null
);

const MIN_DISPLAY_MS = 400;
const MIN_INTRO_DISPLAY_MS = 900;
const READY_TIMEOUT_MS = 12000;

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useAppNavigation() {
  const context = useContext(NavigationLoaderContext);
  if (!context) {
    throw new Error('useAppNavigation must be used within NavigationLoaderProvider');
  }
  return context;
}

export function useAppNavigationOptional() {
  return useContext(NavigationLoaderContext);
}

export function NavigationLoaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const pendingRef = useRef<PendingNavigation | null>(null);
  const readyPathRef = useRef<string | null>(null);
  const dismissingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const previousPathnameRef = useRef(pathname);
  const popstateRef = useRef(false);
  const isInitialPathnameEffect = useRef(true);

  const setPendingState = useCallback((next: PendingNavigation | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const startPending = useCallback(
    (
      targetPath: string,
      copy?: Partial<NavigationCopy>,
      options?: { fromPath?: string; variant?: LoaderVariant }
    ) => {
      const normalized = normalizeNavigationPath(targetPath);
      const fromPath = options?.fromPath ?? previousPathnameRef.current;
      const variant =
        options?.variant ?? getNavigationLoaderVariant(fromPath, normalized);
      const defaults = getNavigationCopy(normalized, { fromPath, variant });

      dismissingRef.current = false;
      readyPathRef.current = null;
      setPendingState({
        targetPath: normalized,
        title: copy?.title ?? defaults.title,
        description: copy?.description ?? defaults.description,
        tagline: copy?.tagline ?? defaults.tagline,
        variant,
        startedAt: Date.now(),
      });
    },
    [setPendingState]
  );

  const navigate = useCallback(
    (href: string, copy?: Partial<NavigationCopy>) => {
      startPending(href, copy);
      router.push(href);
    },
    [router, startPending]
  );

  const replace = useCallback(
    (href: string, copy?: Partial<NavigationCopy>) => {
      startPending(href, copy);
      router.replace(href);
    },
    [router, startPending]
  );

  const beginLoading = useCallback(
    (targetPath: string, copy?: Partial<NavigationCopy>) => {
      startPending(targetPath, copy);
    },
    [startPending]
  );

  const dismiss = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || dismissingRef.current) return;
    if (readyPathRef.current !== current.targetPath) return;
    if (normalizeNavigationPath(pathname) !== current.targetPath) return;

    dismissingRef.current = true;

    const minDisplay =
      current.variant === 'intro' ? MIN_INTRO_DISPLAY_MS : MIN_DISPLAY_MS;
    const elapsed = Date.now() - current.startedAt;
    if (elapsed < minDisplay) {
      await wait(minDisplay - elapsed);
    }

    await waitForPaint();

    setPendingState(null);
    readyPathRef.current = null;
    dismissingRef.current = false;
  }, [pathname, setPendingState]);

  const markNavigationReady = useCallback(
    (path?: string) => {
      readyPathRef.current = normalizeNavigationPath(path ?? pathname);
      void dismiss();
    },
    [pathname, dismiss]
  );

  useEffect(() => {
    const onPopState = () => {
      popstateRef.current = true;
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const previous = previousPathnameRef.current;

    if (isInitialPathnameEffect.current) {
      isInitialPathnameEffect.current = false;

      const normalized = normalizeNavigationPath(pathname);
      if (isDirectEntryRoute(normalized) && !pendingRef.current) {
        startPending(normalized, undefined, {
          fromPath: '',
          variant: getDirectVisitLoaderVariant(normalized),
        });
      }

      pathnameRef.current = pathname;
      previousPathnameRef.current = pathname;
      return;
    }

    if (previous !== pathname) {
      const wasPopstate = popstateRef.current;
      popstateRef.current = false;

      if (!pendingRef.current && wasPopstate) {
        startPending(pathname, undefined, { fromPath: previous });
      }

      previousPathnameRef.current = pathname;
      pathnameRef.current = pathname;
    }
  }, [pathname, startPending]);

  useEffect(() => {
    if (!pendingRef.current) return;
    if (readyPathRef.current === pendingRef.current.targetPath) {
      void dismiss();
    }
  }, [pathname, dismiss]);

  useEffect(() => {
    if (!pending) return;

    const timeout = window.setTimeout(() => {
      if (pendingRef.current?.targetPath !== pending.targetPath) return;
      readyPathRef.current = pending.targetPath;
      void dismiss();
    }, READY_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [pending, dismiss]);

  return (
    <NavigationLoaderContext.Provider
      value={{
        navigate,
        replace,
        beginLoading,
        markNavigationReady,
        isNavigating: !!pending,
      }}
    >
      {children}
      {pending &&
        (pending.variant === 'intro' ? (
          <IntroSplashLoader
            className="fixed inset-0 z-[100]"
            title={pending.title}
            description={pending.description}
            tagline={pending.tagline}
          />
        ) : (
          <ScreenTransitionLoader
            className="fixed inset-0 z-[100]"
            title={pending.title}
            description={pending.description}
          />
        ))}
    </NavigationLoaderContext.Provider>
  );
}
