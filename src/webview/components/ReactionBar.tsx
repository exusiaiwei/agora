import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactionContent, ReactionGroup } from '@shared/types';
import { rpc } from '../lib/vscode';
import { cn } from '../lib/cn';
import { useStrings } from '../lib/strings';

/**
 * Maps the eight reactions GitHub's GraphQL API accepts on a
 * Discussion / DiscussionComment to the unicode glyphs they
 * correspond to in the GitHub UI.
 */
const REACTION_EMOJI: Record<ReactionContent, string> = {
  THUMBS_UP: '👍',
  THUMBS_DOWN: '👎',
  LAUGH: '😄',
  HOORAY: '🎉',
  CONFUSED: '😕',
  HEART: '❤️',
  ROCKET: '🚀',
  EYES: '👀',
};

const REACTION_LABEL: Record<ReactionContent, string> = {
  THUMBS_UP: '+1',
  THUMBS_DOWN: '-1',
  LAUGH: 'laugh',
  HOORAY: 'hooray',
  CONFUSED: 'confused',
  HEART: 'heart',
  ROCKET: 'rocket',
  EYES: 'eyes',
};

const ALL_REACTIONS: ReactionContent[] = [
  'THUMBS_UP',
  'THUMBS_DOWN',
  'LAUGH',
  'HOORAY',
  'CONFUSED',
  'HEART',
  'ROCKET',
  'EYES',
];

interface ReactionBarProps {
  subjectId: string;
  groups: ReactionGroup[];
  canReact: boolean;
  onChange: () => void;
}

export function ReactionBar({
  subjectId,
  groups,
  canReact,
  onChange,
}: ReactionBarProps): JSX.Element | null {
  const strings = useStrings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<Set<ReactionContent>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const visibleGroups = groups.filter((g) => g.count > 0);

  // Close picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const toggle = useCallback(
    async (content: ReactionContent, currentlyReacted: boolean) => {
      // Block concurrent toggles of the same emoji to avoid the
      // "click-spam → server out of sync with viewerHasReacted" race.
      if (pending.has(content)) return;
      setPending((p) => new Set(p).add(content));
      try {
        if (currentlyReacted) {
          await rpc({ kind: 'removeReaction', subjectId, content });
        } else {
          await rpc({ kind: 'addReaction', subjectId, content });
        }
        onChange();
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(content);
          return next;
        });
      }
    },
    [pending, subjectId, onChange],
  );

  // No existing reactions and can't add any: render nothing.
  if (visibleGroups.length === 0 && !canReact) return null;

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center gap-1 flex-wrap">
      {visibleGroups.map((g) => {
        const reacted = g.viewerHasReacted;
        const busy = pending.has(g.content);
        return (
          <button
            key={g.content}
            type="button"
            disabled={!canReact || busy}
            onClick={() => void toggle(g.content, reacted)}
            title={REACTION_LABEL[g.content]}
            className={cn(
              'inline-flex items-center gap-1 h-[24px] px-1.5 rounded-full border text-xs tabular-nums transition-colors duration-100',
              reacted
                ? 'border-accent/50 bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_15%,transparent)] text-fg'
                : 'border-[var(--vscode-widget-border,var(--vscode-panel-border))] text-fg/80 hover:bg-hover',
              !canReact && 'cursor-default opacity-80',
              busy && 'opacity-60',
            )}
          >
            <span aria-hidden="true" className="leading-none">{REACTION_EMOJI[g.content]}</span>
            <span>{g.count}</span>
          </button>
        );
      })}

      {canReact && (
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title={strings.addReaction}
          aria-label={strings.addReaction}
          aria-expanded={pickerOpen}
          className={cn(
            'inline-flex items-center justify-center h-[24px] w-[28px] rounded-full border text-xs transition-colors duration-100',
            pickerOpen
              ? 'border-accent/50 bg-hover text-fg'
              : 'border-[var(--vscode-widget-border,var(--vscode-panel-border))] text-fg/60 hover:text-fg hover:bg-hover',
          )}
        >
          <span className="codicon codicon-smiley" aria-hidden="true" />
        </button>
      )}

      {pickerOpen && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 left-0 top-full mt-1.5 flex gap-0.5 p-1 rounded-md',
            'bg-[var(--vscode-menu-background,var(--vscode-editor-background))]',
            'border border-[var(--vscode-menu-border,var(--vscode-widget-border,var(--vscode-panel-border)))]',
            'shadow-[var(--ag-shadow-pop)]',
          )}
        >
          {ALL_REACTIONS.map((content) => {
            const existing = groups.find((g) => g.content === content);
            const reacted = existing?.viewerHasReacted ?? false;
            const busy = pending.has(content);
            return (
              <button
                key={content}
                type="button"
                role="menuitem"
                disabled={busy}
                title={REACTION_LABEL[content]}
                onClick={() => {
                  void toggle(content, reacted);
                  setPickerOpen(false);
                }}
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded text-base transition-colors duration-100',
                  reacted
                    ? 'bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_20%,transparent)]'
                    : 'hover:bg-hover',
                  busy && 'opacity-60',
                )}
              >
                <span aria-hidden="true">{REACTION_EMOJI[content]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
