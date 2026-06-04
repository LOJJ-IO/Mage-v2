'use client';

import { AnimatedNumber } from './AnimatedNumber';

interface ProgressBarProps {
  tierAConfirmed: number;
  tierATotal: number;
  tierBConfirmed: number;
  tierBTotal: number;
  autoFilledCount: number;
  needsVerifyCount: number;
}

export function ProgressBar({
  tierAConfirmed,
  tierATotal,
  tierBConfirmed,
  tierBTotal,
  autoFilledCount,
  needsVerifyCount,
}: ProgressBarProps) {
  const tierAPct = tierATotal > 0 ? (tierAConfirmed / tierATotal) * 100 : 0;
  const tierBPct = tierBTotal > 0 ? (tierBConfirmed / tierBTotal) * 100 : 0;
  const extractedPending = autoFilledCount + needsVerifyCount;

  return (
    <div className="progress-row">
      <div className="prog-block">
        <div className="prog-label">Tier A — essential</div>
        <div className="prog-bar-bg">
          <div
            className="prog-bar"
            style={{ width: `${tierAPct}%`, background: '#1D9E75' }}
          />
        </div>
        <div className="prog-count">
          <AnimatedNumber value={tierAConfirmed} duration={800} /> of{' '}
          <AnimatedNumber value={tierATotal} duration={800} /> fields confirmed
        </div>
      </div>
      <div className="prog-block">
        <div className="prog-label">Tier B — helpful</div>
        <div className="prog-bar-bg">
          <div
            className="prog-bar"
            style={{ width: `${tierBPct}%`, background: '#BA7517' }}
          />
        </div>
        <div className="prog-count">
          <AnimatedNumber value={tierBConfirmed} duration={800} /> of{' '}
          <AnimatedNumber value={tierBTotal} duration={800} /> fields confirmed
        </div>
      </div>
      <div className="prog-block" style={{ flex: '0 0 auto', minWidth: '160px' }}>
        <div className="prog-label">Extracted from crawl</div>
        <div style={{ fontSize: '22px', fontWeight: 500, color: '#1D9E75' }}>
          <AnimatedNumber value={extractedPending} duration={1000} />
        </div>
        <div className="prog-count">
          <AnimatedNumber value={autoFilledCount} duration={800} /> ready to confirm ·{' '}
          <AnimatedNumber value={needsVerifyCount} duration={800} /> need verify
        </div>
      </div>
    </div>
  );
}
