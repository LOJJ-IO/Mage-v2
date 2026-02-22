'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  const isChunkLoad = error?.name === 'ChunkLoadError' || /chunk|loading chunk/i.test(error?.message ?? '');

  return (
    <div className="min-h-screen bg-mage-black flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <h1 className="text-white text-2xl font-semibold mb-2">
          {isChunkLoad ? 'Something took too long to load' : 'Something went wrong'}
        </h1>
        <p className="text-white/60 text-sm mb-6">
          {isChunkLoad
            ? 'The app failed to load in time. Refreshing the page usually fixes this.'
            : 'An unexpected error occurred. Try refreshing the page.'}
        </p>
        <button
          type="button"
          onClick={() => {
            if (isChunkLoad) {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="px-6 py-3 bg-white text-mage-black font-medium rounded-full hover:bg-white/90 transition-colors"
        >
          Refresh page
        </button>
        <p className="text-white/40 text-xs mt-6">
          If the problem continues, check your connection and try again later.
        </p>
      </div>
    </div>
  );
}
