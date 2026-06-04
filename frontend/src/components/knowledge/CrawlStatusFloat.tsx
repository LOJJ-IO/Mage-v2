'use client';

import { AnimatedNumber } from './AnimatedNumber';

interface CrawlStatusFloatProps {
  crawling: boolean;
  crawlComplete: boolean;
  pagesDiscovered: number;
  pagesWithFacts: number;
  factsMerged: number;
  onReviewFields: () => void;
}

export function CrawlStatusFloat({
  crawling,
  crawlComplete,
  pagesDiscovered,
  pagesWithFacts,
  factsMerged,
  onReviewFields,
}: CrawlStatusFloatProps) {
  if (!crawling && !crawlComplete) return null;

  const done = crawlComplete && !crawling;

  return (
    <div
      className={`crawl-status-float${done ? ' crawl-status-float--done' : ' crawl-status-float--running'}`}
      role="status"
      aria-live="polite"
    >
      <div className="crawl-status-float-body">
        {done ? (
          <span>
            ✓ Crawl complete —{' '}
            <AnimatedNumber value={factsMerged} duration={1100} /> facts extracted. Scroll up to
            review auto-filled fields when you&apos;re ready.
          </span>
        ) : (
          <span>
            Crawling…{' '}
            <AnimatedNumber value={pagesDiscovered} duration={700} /> pages found ·{' '}
            <AnimatedNumber value={factsMerged} duration={700} /> slots filled
            {pagesWithFacts > 0 && (
              <>
                {' '}
                · <AnimatedNumber value={pagesWithFacts} duration={700} /> with facts
              </>
            )}
          </span>
        )}
      </div>
      {done && (
        <button type="button" className="crawl-status-float-action" onClick={onReviewFields}>
          Review fields ↑
        </button>
      )}
    </div>
  );
}
