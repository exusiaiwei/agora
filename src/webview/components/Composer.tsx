import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '../lib/cn';
import { useStrings } from '../lib/strings';
import { Markdown } from './Markdown';

export interface ComposerHandle {
  focus: () => void;
  setBody: (body: string) => void;
  clear: () => void;
}

interface ComposerProps {
  /** Stable key used for draft persistence (one draft per surface). */
  draftKey: string;
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  busy?: boolean;
  /** Show a Cancel button beside Submit; only meaningful for inline reply forms. */
  cancellable?: boolean;
  /** When true, draft is wiped on successful submit. Defaults to true. */
  clearOnSubmit?: boolean;
  onSubmit: (body: string) => Promise<void> | void;
  onCancel?: () => void;
  /** Compact mode shrinks padding/min-height for inline use under comments. */
  compact?: boolean;
  className?: string;
}

const DRAFT_PREFIX = 'agora.composer.draft.';

function loadDraft(key: string): string {
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(key: string, body: string): void {
  try {
    if (body) localStorage.setItem(DRAFT_PREFIX + key, body);
    else localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // ignore storage failures
  }
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    draftKey,
    initialBody,
    placeholder,
    submitLabel,
    busy,
    cancellable,
    clearOnSubmit = true,
    onSubmit,
    onCancel,
    compact,
    className,
  },
  ref,
) {
  const strings = useStrings();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit flows pass `initialBody`. In that case we *don't* persist a
  // draft: the constructor would shadow it anyway (initialBody wins
  // over loadDraft), and silently writing edit-mode keystrokes to
  // disk that can never be read back would just leak storage and
  // lose work the user thinks is safe. New / reply composers (no
  // initialBody) keep full draft persistence as before.
  const persistDraft = initialBody === undefined;

  const [body, setBody] = useState(() => initialBody ?? loadDraft(draftKey));
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Clear any stale draft from a prior session that we're about to
  // ignore — keeps localStorage from accumulating unreachable entries.
  useEffect(() => {
    if (!persistDraft) saveDraft(draftKey, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!persistDraft) return;
    const t = setTimeout(() => saveDraft(draftKey, body), 250);
    return () => clearTimeout(t);
  }, [body, draftKey, persistDraft]);

  // Auto-resize textarea to fit content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [body, preview]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    setBody: (b: string) => setBody(b),
    clear: () => {
      setBody('');
      if (persistDraft) saveDraft(draftKey, '');
    },
  }));

  const isEmpty = body.trim().length === 0;
  const disabled = submitting || !!busy || isEmpty;

  const handleSubmit = useCallback(async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      await onSubmit(body);
      if (clearOnSubmit) {
        setBody('');
        if (persistDraft) saveDraft(draftKey, '');
      }
    } finally {
      setSubmitting(false);
    }
  }, [disabled, body, onSubmit, clearOnSubmit, draftKey, persistDraft]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
        return;
      }
      if (meta && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        wrapSelection(textareaRef.current, '**', '**', setBody);
        return;
      }
      if (meta && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        wrapSelection(textareaRef.current, '_', '_', setBody);
        return;
      }
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        insertLink(textareaRef.current, setBody);
        return;
      }
      if (e.key === 'Escape' && cancellable && onCancel) {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, cancellable, onCancel],
  );

  const toolbarButtons = useMemo(
    () => [
      { icon: 'bold', label: 'Bold', action: () => wrapSelection(textareaRef.current, '**', '**', setBody) },
      { icon: 'italic', label: 'Italic', action: () => wrapSelection(textareaRef.current, '_', '_', setBody) },
      { icon: 'code', label: 'Code', action: () => wrapSelection(textareaRef.current, '`', '`', setBody) },
      { icon: 'link', label: 'Link', action: () => insertLink(textareaRef.current, setBody) },
      { icon: 'list-unordered', label: 'List', action: () => prefixLines(textareaRef.current, '- ', setBody) },
      { icon: 'quote', label: 'Quote', action: () => prefixLines(textareaRef.current, '> ', setBody) },
    ],
    [],
  );

  return (
    <div
      className={cn(
        'flex flex-col rounded-md border border-[var(--vscode-input-border,var(--vscode-widget-border,transparent))] bg-input-bg overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.icon}
            type="button"
            title={btn.label}
            onClick={() => {
              btn.action();
              textareaRef.current?.focus();
            }}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-fg/70 hover:text-fg hover:bg-hover transition-colors duration-100"
            tabIndex={-1}
          >
            <span className={`codicon codicon-${btn.icon}`} aria-hidden="true" />
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors duration-100',
            preview ? 'bg-hover text-fg' : 'text-fg/70 hover:text-fg hover:bg-hover',
          )}
          tabIndex={-1}
        >
          <span
            className={`codicon codicon-${preview ? 'edit' : 'eye'}`}
            aria-hidden="true"
          />
          {preview ? strings.composerEdit : strings.composerPreview}
        </button>
      </div>

      {preview ? (
        <div className={cn('px-3 py-2 overflow-y-auto', compact ? 'min-h-[60px]' : 'min-h-[120px]')}>
          {body.trim() ? (
            <Markdown source={body} />
          ) : (
            <span className="text-muted text-sm italic">{strings.composerNothingToPreview}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? strings.composerPlaceholder}
          className={cn(
            'block w-full resize-none bg-transparent px-3 py-2 text-sm font-sans text-fg placeholder:text-muted',
            'border-0 outline-none focus:outline-none',
            compact ? 'min-h-[60px]' : 'min-h-[120px]',
          )}
        />
      )}

      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
        <span className="text-xs text-muted">
          {strings.composerShortcutHint}
        </span>
        <div className="flex-1" />
        {cancellable && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center h-[24px] px-2.5 rounded text-xs bg-btn-secondary-bg text-btn-secondary-fg hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
          >
            {strings.cancel}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded text-xs',
            'bg-btn-bg text-btn-fg hover:bg-btn-hover disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {submitting && (
            <span className="codicon codicon-loading animate-spin" aria-hidden="true" />
          )}
          {submitLabel ?? strings.composerSubmit}
        </button>
      </div>
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────

function wrapSelection(
  el: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string,
  setBody: (b: string) => void,
): void {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const sel = el.value.slice(start, end);
  const after = el.value.slice(end);
  const next = `${before}${prefix}${sel}${suffix}${after}`;
  setBody(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + prefix.length, end + prefix.length);
  });
}

function insertLink(el: HTMLTextAreaElement | null, setBody: (b: string) => void): void {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const sel = el.value.slice(start, end) || 'text';
  const after = el.value.slice(end);
  const next = `${before}[${sel}](url)${after}`;
  setBody(next);
  requestAnimationFrame(() => {
    el.focus();
    // Select the 'url' placeholder so the user can paste/type immediately.
    const urlStart = start + sel.length + 3;
    el.setSelectionRange(urlStart, urlStart + 3);
  });
}

function prefixLines(
  el: HTMLTextAreaElement | null,
  prefix: string,
  setBody: (b: string) => void,
): void {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const sel = el.value.slice(start, end);
  const after = el.value.slice(end);
  const lines = (sel || '').split('\n');
  const prefixed = lines.map((l) => prefix + l).join('\n');
  const next = `${before}${prefixed}${after}`;
  setBody(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start, start + prefixed.length);
  });
}
