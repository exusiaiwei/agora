import type { DiscussionSummary } from '@shared/types';
import { Avatar } from './primitives';
import { relativeTime, absoluteTime } from '../lib/time';
import { cn } from '../lib/cn';

interface DiscussionListProps {
  discussions: DiscussionSummary[];
  onOpen: (d: DiscussionSummary) => void;
}

export function DiscussionList({ discussions, onOpen }: DiscussionListProps): JSX.Element {
  return (
    <ul className="flex flex-col">
      {discussions.map((d, i) => (
        <li key={d.id}>
          {i > 0 && <div className="h-px bg-[var(--vscode-widget-border,var(--vscode-panel-border))] mx-4" />}
          <DiscussionRow discussion={d} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function DiscussionRow({
  discussion: d,
  onOpen,
}: {
  discussion: DiscussionSummary;
  onOpen: (d: DiscussionSummary) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(d)}
      className={cn(
        'group w-full text-left px-4 py-3 flex gap-3 items-start',
        'transition-colors duration-100 hover:bg-hover focus:bg-hover',
      )}
    >
      <div className="pt-0.5">
        <StatusIcon discussion={d} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-md text-fg truncate">{d.title}</span>
          <span className="text-xs text-muted tabular-nums">#{d.number}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true">{d.category.emoji || '•'}</span>
            {d.category.name}
          </span>
          <span className="opacity-40">·</span>
          <span title={absoluteTime(d.updatedAt)}>{relativeTime(d.updatedAt)}</span>
          {d.author && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1">
                <Avatar src={d.author.avatarUrl} alt={d.author.login} size={14} />
                {d.author.login}
              </span>
            </>
          )}
          {d.labels.length > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 flex-wrap">
                {d.labels.slice(0, 3).map((l) => (
                  <LabelChip key={l.id} name={l.name} color={l.color} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-muted">
        {d.upvoteCount > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <span className="codicon codicon-triangle-up" aria-hidden="true" />
            {d.upvoteCount}
          </span>
        )}
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="codicon codicon-comment" aria-hidden="true" />
          {d.commentCount}
        </span>
      </div>
    </button>
  );
}

function StatusIcon({ discussion: d }: { discussion: DiscussionSummary }): JSX.Element {
  if (d.answered) {
    return (
      <span
        title="Answered"
        className="codicon codicon-pass-filled text-success text-[16px]"
        aria-hidden="true"
      />
    );
  }
  if (d.locked) {
    return <span className="codicon codicon-lock text-muted text-[15px]" aria-hidden="true" />;
  }
  if (d.closed) {
    return <span className="codicon codicon-check text-muted text-[15px]" aria-hidden="true" />;
  }
  return (
    <span
      className="codicon codicon-comment-discussion text-fg/60 text-[15px]"
      aria-hidden="true"
    />
  );
}

function LabelChip({ name, color }: { name: string; color: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center px-1.5 h-[16px] rounded-sm text-[10.5px] font-medium border"
      style={{
        borderColor: `#${color}55`,
        color: `#${color}`,
        backgroundColor: `#${color}1a`,
      }}
    >
      {name}
    </span>
  );
}
