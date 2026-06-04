'use client';

import { IconPlayerPlay, IconPlus, IconWorld } from '@tabler/icons-react';
import { AnimatedNumber } from './AnimatedNumber';
import type { BookingSuggest } from './onboardingTypes';

export type UrlField = { id: string; value: string };

export const CRAWL_EXAMPLE_CHIPS = [
  {
    label: 'marriott.com/hotels/your-hotel',
    url: 'https://www.marriott.com/hotels/your-hotel',
  },
  {
    label: 'booking.com/hotel/your-property',
    url: 'https://www.booking.com/hotel/your-property',
  },
  {
    label: 'tripadvisor.com/Hotel_Review-...',
    url: 'https://www.tripadvisor.com/Hotel_Review-',
  },
] as const;

type CrawlJobSummary = {
  status: string;
  pages_discovered?: number;
  facts_merged?: number;
  seed_urls?: string[];
};

interface OnboardingCrawlPanelProps {
  crawlUrlFields: UrlField[];
  propertyId: string;
  crawling: boolean;
  crawlJob: CrawlJobSummary | null;
  bookingHint: BookingSuggest | null;
  onUpdateUrlField: (id: string, value: string) => void;
  onApplySuggestedPropertyId: () => void;
  onAddUrlField: () => void;
  onRemoveUrlField: (id: string) => void;
  onPropertyIdChange: (value: string) => void;
  onAutoPropertyId: () => void;
  onStartCrawl: () => void;
  onExampleChip: (url: string) => void;
}

function crawlStatusLabel(
  crawling: boolean,
  crawlJob: CrawlJobSummary | null
): { text: string; done: boolean; running: boolean } {
  if (crawling || crawlJob?.status === 'running' || crawlJob?.status === 'pending') {
    return { text: 'Running…', done: false, running: true };
  }
  if (crawlJob?.status === 'completed') {
    const pages = crawlJob.pages_discovered ?? 0;
    const facts = crawlJob.facts_merged ?? 0;
    return {
      text: `Completed · ${pages} pages · ${facts} facts`,
      done: true,
      running: false,
    };
  }
  if (crawlJob?.status === 'failed') {
    return { text: 'Failed — check URLs and try again', done: false, running: false };
  }
  return { text: 'Not started', done: false, running: false };
}

export function OnboardingCrawlPanel({
  crawlUrlFields,
  propertyId,
  crawling,
  crawlJob,
  bookingHint,
  onUpdateUrlField,
  onApplySuggestedPropertyId,
  onAddUrlField,
  onRemoveUrlField,
  onPropertyIdChange,
  onAutoPropertyId,
  onStartCrawl,
  onExampleChip,
}: OnboardingCrawlPanelProps) {
  const status = crawlStatusLabel(crawling, crawlJob);
  const showTip = !status.running && status.text === 'Not started';

  const primaryField = crawlUrlFields[0];
  const secondaryField = crawlUrlFields[1];
  const extraFields = crawlUrlFields.slice(2);

  return (
    <div className="crawl-panel">
      <div className="crawl-panel-hdr">
        <div className="crawl-panel-title">Crawl hotel sources</div>
        <p className="crawl-panel-hint">
          We extract facts from your hotel website and listing pages automatically
        </p>
      </div>

      <div className="crawl-panel-body">
        <div className="crawl-examples">
          <span className="crawl-ex-label">Try:</span>
          {CRAWL_EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="crawl-ex-chip"
              onClick={() => onExampleChip(chip.url)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {primaryField && (
          <div className="crawl-url-row">
            <IconWorld size={16} stroke={1.5} className="crawl-url-icon" aria-hidden />
            <input
              type="url"
              value={primaryField.value}
              onChange={(e) => onUpdateUrlField(primaryField.id, e.target.value)}
              onBlur={onApplySuggestedPropertyId}
              placeholder="https://www.example-hotel.com"
              className="crawl-url-inp"
            />
            <span className="crawl-url-tag crawl-url-tag--primary">Hotel website</span>
          </div>
        )}

        {secondaryField ? (
          <div className="crawl-url-row">
            <IconWorld size={16} stroke={1.5} className="crawl-url-icon" aria-hidden />
            <input
              type="url"
              value={secondaryField.value}
              onChange={(e) => onUpdateUrlField(secondaryField.id, e.target.value)}
              placeholder="https://www.booking.com/hotel/… (optional)"
              className="crawl-url-inp"
            />
            <span className="crawl-url-tag crawl-url-tag--optional">Optional listing</span>
          </div>
        ) : null}

        {extraFields.map((field) => (
          <div key={field.id} className="crawl-url-row crawl-url-row--extra">
            <IconWorld size={16} stroke={1.5} className="crawl-url-icon" aria-hidden />
            <input
              type="url"
              value={field.value}
              onChange={(e) => onUpdateUrlField(field.id, e.target.value)}
              placeholder="https://… (optional)"
              className="crawl-url-inp"
            />
            <button
              type="button"
              className="crawl-remove-url"
              onClick={() => onRemoveUrlField(field.id)}
            >
              Remove
            </button>
          </div>
        ))}

        <button type="button" className="crawl-add-url" onClick={onAddUrlField}>
          <IconPlus size={14} stroke={2} aria-hidden />
          Add another URL
        </button>

        {bookingHint?.hotel_url && (
          <p className="crawl-booking-hint">
            Likely Booking.com listing:{' '}
            <span className="font-mono break-all">{bookingHint.hotel_url}</span>
            {bookingHint.search_url && (
              <>
                {' '}
                ·{' '}
                <a href={bookingHint.search_url} target="_blank" rel="noreferrer">
                  open on Booking.com
                </a>
              </>
            )}
          </p>
        )}

        <div className="crawl-panel-footer">
          <div className="crawl-prop-id-row">
            <span className="crawl-prop-id-label">Property ID</span>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => onPropertyIdChange(e.target.value)}
              placeholder="auto-from-domain"
              className="crawl-prop-id-inp"
            />
            <button type="button" className="crawl-auto-link" onClick={onAutoPropertyId}>
              Auto from URL
            </button>
          </div>
          <button
            type="button"
            className="crawl-start-btn"
            onClick={onStartCrawl}
            disabled={crawling}
          >
            <IconPlayerPlay size={14} stroke={2} fill="currentColor" aria-hidden />
            {crawling ? 'Crawling…' : 'Start crawl'}
          </button>
        </div>
      </div>

      <div className="crawl-status-bar">
        <span className="crawl-status-left">
          <span
            className={`crawl-status-dot${status.done ? ' crawl-status-dot--done' : ''}${status.running ? ' crawl-status-dot--running' : ''}`}
            aria-hidden
          />
          {status.running ? (
            status.text
          ) : crawlJob?.status === 'completed' ? (
            <>
              Completed ·{' '}
              <AnimatedNumber value={crawlJob.pages_discovered ?? 0} duration={700} /> pages ·{' '}
              <AnimatedNumber value={crawlJob.facts_merged ?? 0} duration={700} /> facts
            </>
          ) : (
            status.text
          )}
        </span>
        {showTip && (
          <span className="crawl-status-tip">
            Tip: add Booking.com or TripAdvisor URLs for better coverage
          </span>
        )}
      </div>
    </div>
  );
}
