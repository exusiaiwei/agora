import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useStrings } from '../lib/strings';

/**
 * Quote-selection plumbing for the thread view.
 *
 * Goal: highlight any text inside a comment / reply / discussion body
 * and turn it into a Markdown `> ` blockquote inserted at the start of
 * the appropriate reply composer — same UX as github.com's "Quote
 * reply" (select + press R, or click the floating popover).
 *
 * Each "surface" (comment body, reply body, discussion body) registers
 * a callback that knows how to (a) reveal its own inline reply
 * composer and (b) insertAtStart the quoted Markdown. The popover
 * looks up the nearest `[data-quote-surface]` ancestor of the
 * selection, finds the matching surface, and invokes it.
 */

type Quoter = (quotedMarkdown: string) => void;

interface QuoteContextValue {
  registerSurface: (id: string, quoter: Quoter) => () => void;
  triggerQuoteAt: (id: string, quote: string) => boolean;
}

const QuoteCtx = createContext<QuoteContextValue | null>(null);

export function QuoteProvider({ children }: { children: ReactNode }): JSX.Element {
  const surfaces = useRef<Map<string, Quoter>>(new Map());

  const registerSurface = useCallback((id: string, quoter: Quoter) => {
    surfaces.current.set(id, quoter);
    return () => {
      // Only delete if we're still the registered quoter — guards
      // against a stale unmount cleanup wiping a re-registration.
      if (surfaces.current.get(id) === quoter) {
        surfaces.current.delete(id);
      }
    };
  }, []);

  const triggerQuoteAt = useCallback((id: string, quote: string) => {
    const fn = surfaces.current.get(id);
    if (!fn) return false;
    fn(quote);
    return true;
  }, []);

  return (
    <QuoteCtx.Provider value={{ registerSurface, triggerQuoteAt }}>
      {children}
      <QuoteSelectionPopover />
    </QuoteCtx.Provider>
  );
}

export function useQuoteSurface(
  surfaceId: string,
  quoter: Quoter,
): void {
  const ctx = useContext(QuoteCtx);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerSurface(surfaceId, quoter);
  }, [ctx, surfaceId, quoter]);
}

/** Turn arbitrary plain text into a GitHub-style blockquote block. */
export function markdownQuote(text: string): string {
  const trimmed = text.replace(/\s+$/, '');
  if (!trimmed) return '';
  return (
    trimmed
      .split('\n')
      .map((line) => (line.length === 0 ? '>' : `> ${line}`))
      .join('\n') + '\n\n'
  );
}

interface PopoverState {
  top: number;
  left: number;
  surfaceId: string;
  text: string;
}

function QuoteSelectionPopover(): JSX.Element | null {
  const strings = useStrings();
  const ctx = useContext(QuoteCtx);
  const [state, setState] = useState<PopoverState | null>(null);
  const stateRef = useRef<PopoverState | null>(null);
  stateRef.current = state;

  // Recompute popover on every selection change. Cheap.
  useEffect(() => {
    const onChange = (): void => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Find nearest ancestor that's a quote-eligible surface.
      let node: Node | null = range.commonAncestorContainer;
      let surfaceEl: Element | null = null;
      while (node) {
        if (node instanceof Element) {
          surfaceEl = node.closest('[data-quote-surface]');
          if (surfaceEl) break;
        }
        node = node.parentNode;
      }
      if (!surfaceEl) {
        setState(null);
        return;
      }
      const surfaceId = surfaceEl.getAttribute('data-quote-surface');
      if (!surfaceId) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Selection inside an empty/zero-rect node (shouldn't happen
      // with non-empty toString, but defensive).
      if (rect.width === 0 && rect.height === 0) {
        setState(null);
        return;
      }
      setState({
        top: Math.max(8, rect.top - 38),
        left: rect.left + rect.width / 2,
        surfaceId,
        text,
      });
    };

    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  // R hotkey, github.com style. Only when there's a live selection
  // and the focused element isn't an editable surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = stateRef.current;
      if (!s) return;
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const tag = tgt.tagName;
      if (
        tag === 'TEXTAREA' ||
        tag === 'INPUT' ||
        (tgt as HTMLElement).isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      runQuote();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQuote = useCallback((): void => {
    const s = stateRef.current;
    if (!s || !ctx) return;
    const md = markdownQuote(s.text);
    if (!md) return;
    const ok = ctx.triggerQuoteAt(s.surfaceId, md);
    if (!ok) return;
    window.getSelection()?.removeAllRanges();
    setState(null);
  }, [ctx]);

  if (!state) return null;

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        top: state.top,
        left: state.left,
        transform: 'translateX(-50%)',
        zIndex: 60,
      }}
      className="pointer-events-auto"
      // Don't let mousedown collapse the selection before we read it.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={runQuote}
        className="inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-md text-xs font-medium bg-btn-bg text-btn-fg hover:bg-btn-hover shadow-[var(--ag-shadow-pop)]"
      >
        <span className="codicon codicon-quote" aria-hidden="true" />
        {strings.composerQuoteSelection}
        <span className="ml-1 px-1 py-px rounded-sm text-[10px] font-semibold bg-[color-mix(in_srgb,currentColor_18%,transparent)]">
          R
        </span>
      </button>
    </div>
  );
}
