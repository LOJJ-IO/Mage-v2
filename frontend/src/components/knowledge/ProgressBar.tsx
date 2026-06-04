'use client';

import { IconCircleCheck, IconSparkles } from '@tabler/icons-react';
import { AnimatedNumber } from './AnimatedNumber';

interface ProgressBarProps {
  tierAConfirmed: number;
  tierATotal: number;
  tierBConfirmed: number;
  tierBTotal: number;
  autoFilledCount: number;
  needsVerifyCount: number;
  hasCrawlRun: boolean;
}

export function ProgressBar({
  tierAConfirmed,
  tierATotal,
  tierBConfirmed,
  tierBTotal,
  autoFilledCount,
  needsVerifyCount,
  hasCrawlRun,
}: ProgressBarProps) {
  const tierAPct = tierATotal > 0 ? (tierAConfirmed / tierATotal) * 100 : 0;
  const tierBPct = tierBTotal > 0 ? (tierBConfirmed / tierBTotal) * 100 : 0;
  const extractedPending = autoFilledCount + needsVerifyCount;
  const showExtractedStats = hasCrawlRun || extractedPending > 0;

  return (
    <div className="progress-row">
      <div className="prog-card">
        <div className="prog-card-label">
          <IconCircleCheck size={14} stroke={2} className="prog-icon prog-icon--a" aria-hidden />
          Tier A — essential
        </div>
        <div className="prog-bar-bg">
          <div
            className="prog-bar prog-bar--a"
            style={{ width: `${tierAPct}%` }}
          />
        </div>
        <div className="prog-nums">
          <AnimatedNumber value={tierAConfirmed} duration={800} /> of{' '}
          <AnimatedNumber value={tierATotal} duration={800} /> fields confirmed
        </div>
      </div>

      <div className="prog-card">
        <div className="prog-card-label">
          <IconCircleCheck size={14} stroke={2} className="prog-icon prog-icon--b" aria-hidden />
          Tier B — helpful
        </div>
        <div className="prog-bar-bg">
          <div
            className="prog-bar prog-bar--b"
            style={{ width: `${tierBPct}%` }}
          />
        </div>
        <div className="prog-nums">
          <AnimatedNumber value={tierBConfirmed} duration={800} /> of{' '}
          <AnimatedNumber value={tierBTotal} duration={800} /> fields confirmed
        </div>
      </div>

      <div className="prog-card">
        <div className="prog-card-label">
          <IconSparkles size={14} stroke={1.75} className="prog-icon prog-icon--extract" aria-hidden />
          Extracted from crawl
        </div>
        {showExtractedStats ? (
          <>
            <div className="prog-big">
              <AnimatedNumber value={extractedPending} duration={1000} />
            </div>
            <div className="prog-detail">
              <AnimatedNumber value={autoFilledCount} duration={800} /> ready to confirm ·{' '}
              <AnimatedNumber value={needsVerifyCount} duration={800} /> need verify
            </div>
          </>
        ) : (
          <>
            <div className="prog-big prog-big--idle" aria-hidden>
              —
            </div>
            <div className="prog-detail">Start a crawl to auto-fill fields</div>
          </>
        )}
      </div>
    </div>
  );
}
