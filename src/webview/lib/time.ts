const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

let currentLocale: string =
  (typeof navigator !== 'undefined' && navigator.language) || 'en';
let cachedRtf: Intl.RelativeTimeFormat | null = null;

/**
 * Set the locale used by relativeTime/absoluteTime. Called from App when the
 * extension host's `context` event arrives so we mirror vscode.env.language
 * rather than the browser/Electron default.
 */
export function setLocale(locale: string): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  cachedRtf = null;
}

function getRtf(): Intl.RelativeTimeFormat {
  if (!cachedRtf) {
    cachedRtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' });
  }
  return cachedRtf;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = getRtf();
  for (const [unit, secs] of UNITS) {
    if (abs >= secs || unit === 'second') {
      const value = Math.round(diffSec / secs);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(diffSec, 'second');
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(currentLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
