import type { CommentNode, DiscussionDetail } from '@shared/types';
import { Avatar, Badge, IconButton } from './primitives';
import { Markdown } from './Markdown';
import { relativeTime, absoluteTime } from '../lib/time';
import { cn } from '../lib/cn';
import { useStrings } from '../lib/strings';
import type { WebviewStrings } from '@shared/strings';

interface ThreadProps {
  discussion: DiscussionDetail;
  onBack: () => void;
  onOpenInBrowser: (url: string) => void;
}

export function Thread({ discussion: d, onBack, onOpenInBrowser }: ThreadProps): JSX.Element {
  const strings = useStrings();
  const answer = d.comments.find((c) => c.isAnswer);
  const others = d.comments.filter((c) => !c.isAnswer);

  return (
    <div className="ag-fade-in flex flex-col h-full">
      <header className="sticky top-0 z-10 backdrop-blur-sm bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
        <div className="max-w-[var(--ag-content-max)] mx-auto px-6 py-3 flex items-center gap-2">
          <IconButton icon="arrow-left" label={strings.back} onClick={onBack} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted">
                {d.category.emoji} {d.category.name}
              </span>
              <span className="text-xs text-muted opacity-50">·</span>
              <span className="text-xs text-muted tabular-nums">#{d.number}</span>
              {d.locked && (
                <Badge tone="muted">
                  <span className="codicon codicon-lock" aria-hidden="true" /> {strings.locked}
                </Badge>
              )}
              {d.closed && !d.answered && (
                <Badge tone="muted">
                  <span className="codicon codicon-check" aria-hidden="true" /> {strings.closed}
                </Badge>
              )}
              {d.answered && (
                <Badge tone="success">
                  <span className="codicon codicon-pass-filled" aria-hidden="true" /> {strings.answered}
                </Badge>
              )}
            </div>
          </div>
          <IconButton icon="link-external" label={strings.openInBrowser} onClick={() => onOpenInBrowser(d.url)} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[var(--ag-content-max)] mx-auto px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{d.title}</h1>

          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            {d.author && (
              <>
                <Avatar src={d.author.avatarUrl} alt={d.author.login} size={20} />
                <span className="text-fg/90">{d.author.login}</span>
                <span className="opacity-40">·</span>
              </>
            )}
            <span title={absoluteTime(d.createdAt)}>{relativeTime(d.createdAt)}</span>
            {d.labels.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {d.labels.map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex items-center px-1.5 h-[18px] rounded-sm text-[11px] font-medium border"
                      style={{
                        borderColor: `#${l.color}55`,
                        color: `#${l.color}`,
                        backgroundColor: `#${l.color}1a`,
                      }}
                    >
                      {l.name}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>

          <div className="mt-6">
            <Markdown source={d.bodyText} />
          </div>

          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 px-2 h-[26px] rounded border border-[var(--vscode-widget-border,var(--vscode-panel-border))]',
                'transition-colors duration-100 hover:bg-hover',
                d.viewerHasUpvoted && 'text-accent border-accent/40',
              )}
            >
              <span className="codicon codicon-triangle-up" aria-hidden="true" />
              <span className="tabular-nums">{d.upvoteCount}</span>
            </button>
            <span className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="codicon codicon-comment" aria-hidden="true" />
              <span className="tabular-nums">{d.commentCount}</span>
            </span>
          </div>

          <div className="my-8 h-px bg-[var(--vscode-widget-border,var(--vscode-panel-border))]" />

          {answer && (
            <section className="mb-8">
              <div className="text-xs font-medium uppercase tracking-wider text-success mb-2 flex items-center gap-1">
                <span className="codicon codicon-pass-filled" aria-hidden="true" />
                {strings.markedAsAnswer}
              </div>
              <Comment node={answer} highlight strings={strings} />
            </section>
          )}

          <section>
            <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              {strings.commentCount(d.commentCount)}
            </div>
            <ul className="flex flex-col gap-6">
              {others.map((c) => (
                <li key={c.id}>
                  <Comment node={c} strings={strings} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Comment({
  node,
  highlight,
  strings,
}: {
  node: CommentNode;
  highlight?: boolean;
  strings: WebviewStrings;
}): JSX.Element {
  return (
    <article
      className={cn(
        'rounded-md p-4 transition-colors',
        highlight
          ? 'border border-success/40 bg-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_8%,transparent)]'
          : 'border border-[var(--vscode-widget-border,var(--vscode-panel-border))]',
      )}
    >
      <header className="flex items-center gap-2 mb-2">
        {node.author && <Avatar src={node.author.avatarUrl} alt={node.author.login} size={22} />}
        <span className="text-sm text-fg/90 font-medium">
          {node.author?.login ?? 'ghost'}
        </span>
        <span className="text-xs text-muted opacity-50">·</span>
        <span className="text-xs text-muted" title={absoluteTime(node.createdAt)}>
          {relativeTime(node.createdAt)}
        </span>
        {node.isAnswer && (
          <Badge tone="success" className="ml-1">
            <span className="codicon codicon-pass-filled" aria-hidden="true" />
            {strings.answer}
          </Badge>
        )}
        <div className="flex-1" />
        {node.upvoteCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">
            <span className="codicon codicon-triangle-up" aria-hidden="true" />
            {node.upvoteCount}
          </span>
        )}
      </header>

      <Markdown source={node.bodyText} />

      {node.replies.length > 0 && (
        <div className="mt-4 pl-4 border-l-2 border-[var(--vscode-widget-border,var(--vscode-panel-border))] flex flex-col gap-4">
          {node.replies.map((r) => (
            <article key={r.id}>
              <header className="flex items-center gap-2 mb-1.5">
                {r.author && <Avatar src={r.author.avatarUrl} alt={r.author.login} size={18} />}
                <span className="text-sm text-fg/90 font-medium">
                  {r.author?.login ?? 'ghost'}
                </span>
                <span className="text-xs text-muted opacity-50">·</span>
                <span className="text-xs text-muted" title={absoluteTime(r.createdAt)}>
                  {relativeTime(r.createdAt)}
                </span>
              </header>
              <Markdown source={r.bodyText} />
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
