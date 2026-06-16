'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface PhraseItem {
  text: string;
  count: number;
}

export function PhraseWordCloud({
  phrases,
  title = 'Top guest questions',
  description = 'Most repeated phrases from chat',
}: {
  phrases: PhraseItem[];
  title?: string;
  description?: string;
}) {
  const max = phrases[0]?.count ?? 1;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="font-heading text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {phrases.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Phrases appear here once guests start chatting.
          </p>
        ) : (
          <div className="flex min-h-[200px] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-gradient-to-br from-slate-50 to-emerald-50/40 p-6">
            {phrases.map((phrase) => {
              const scale = 0.65 + (phrase.count / max) * 0.85;
              const size = Math.round(13 + scale * 14);
              const opacity = 0.55 + (phrase.count / max) * 0.45;
              return (
                <span
                  key={phrase.text}
                  title={`${phrase.count} mentions`}
                  className="font-medium leading-snug text-emerald-900 transition-transform hover:scale-105"
                  style={{ fontSize: `${size}px`, opacity }}
                >
                  {phrase.text}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
