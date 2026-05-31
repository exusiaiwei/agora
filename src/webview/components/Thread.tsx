import { useCallback, useMemo, useRef, useState } from 'react';
import type { CommentNode, DiscussionDetail } from '@shared/types';
import { Avatar, Badge, DropdownMenu, type DropdownMenuItem, IconButton } from './primitives';
import { Markdown } from './Markdown';
import { Composer, type ComposerHandle } from './Composer';
import { QuoteProvider, useQuoteSurface } from './QuoteSelection';
import { relativeTime, absoluteTime } from '../lib/time';
import { cn } from '../lib/cn';
import { useStrings } from '../lib/strings';
import { rpc } from '../lib/vscode';
import type { WebviewStrings } from '@shared/strings';

interface ThreadProps {
  discussion: DiscussionDetail;
  onBack: () => void;
  onOpenInBrowser: (url: string) => void;
  /** Called after any successful mutation so the parent can refresh state. */
  onChange: () => void;
}

export function Thread(props: ThreadProps): JSX.Element {
  // QuoteProvider must wrap the tree because surfaces (comments,
  // replies, the thread-end composer) call useQuoteSurface to
  // register themselves; the floating selection popover also lives
  // inside the provider.
  return (
    <QuoteProvider>
      <ThreadInner {...props} />
    </QuoteProvider>
  );
}

function ThreadInner({ discussion: d, onBack, onOpenInBrowser, onChange }: ThreadProps): JSX.Element {
  const strings = useStrings();
  const answer = d.comments.find((c) => c.isAnswer);
  const others = d.comments.filter((c) => !c.isAnswer);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(d.title);
  const threadEndComposerRef = useRef<ComposerHandle>(null);

  // Selecting text inside the discussion body funnels into the
  // top-of-thread new-comment composer.
  useQuoteSurface(
    `discussion:${d.id}`,
    useCallback((q: string) => {
      threadEndComposerRef.current?.insertAtStart(q);
      threadEndComposerRef.current?.focus();
    }, []),
  );

  const discussionMenu = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (d.viewerCanUpdate) {
      items.push({
        icon: 'edit',
        label: strings.edit,
        onSelect: () => {
          setEditTitle(d.title);
          setEditing(true);
        },
      });
      items.push({
        icon: d.locked ? 'unlock' : 'lock',
        label: d.locked ? strings.unlockDiscussion : strings.lockDiscussion,
        onSelect: async () => {
          if (d.locked) await rpc({ kind: 'unlockDiscussion', discussionId: d.id });
          else await rpc({ kind: 'lockDiscussion', discussionId: d.id });
          onChange();
        },
      });
    }
    if (d.viewerCanDelete) {
      items.push({
        icon: 'trash',
        label: strings.delete,
        destructive: true,
        onSelect: async () => {
          const { confirmed } = await rpc({
            kind: 'confirm',
            message: strings.deleteDiscussionConfirm,
            confirmLabel: strings.delete,
            destructive: true,
          });
          if (!confirmed) return;
          await rpc({ kind: 'deleteDiscussion', discussionId: d.id });
          onBack();
        },
      });
    }
    return items;
  }, [d, strings, onChange, onBack]);

  return (
    <div className="ag-fade-in flex flex-col h-full">
      <header className="sticky top-0 z-10 backdrop-blur-sm bg-[color-mix(in_srgb,var(--vscode-sideBar-background)_92%,transparent)] border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
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
          {editing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className={cn(
                'block w-full px-3 h-[40px] rounded-md text-xl font-semibold tracking-tight',
                'bg-input-bg text-input-fg placeholder:text-muted',
                'border border-[var(--vscode-input-border,var(--vscode-widget-border,transparent))]',
                'outline-none focus:border-[var(--vscode-focusBorder)]',
              )}
            />
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-2xl font-semibold tracking-tight text-fg">{d.title}</h1>
              <DropdownMenu items={discussionMenu} triggerLabel={strings.edit} />
            </div>
          )}

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

          <div className="mt-6" data-quote-surface={`discussion:${d.id}`}>
            {editing ? (
              <Composer
                draftKey={`discussion:${d.id}:edit`}
                initialBody={d.body}
                submitLabel={strings.save}
                cancellable
                onCancel={() => setEditing(false)}
                onSubmit={async (body) => {
                  await rpc({
                    kind: 'updateDiscussion',
                    discussionId: d.id,
                    title: editTitle.trim(),
                    body,
                  });
                  setEditing(false);
                  onChange();
                }}
              />
            ) : (
              <Markdown source={d.body} />
            )}
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-muted">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 h-[26px] rounded border border-[var(--vscode-widget-border,var(--vscode-panel-border))]',
                'transition-colors duration-100 hover:bg-hover',
                d.viewerHasUpvoted && 'text-accent border-accent/40',
              )}
              title={`${d.upvoteCount} upvotes`}
            >
              <span className="codicon codicon-triangle-up" aria-hidden="true" />
              <span className="tabular-nums">{d.upvoteCount}</span>
            </button>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 h-[26px]"
              title={strings.commentCount(d.commentCount)}
            >
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
              <Comment
                node={answer}
                discussion={d}
                highlight
                strings={strings}
                onChange={onChange}
              />
            </section>
          )}

          <section>
            <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              {strings.commentCount(d.commentCount)}
            </div>
            <ul className="flex flex-col gap-6">
              {others.map((c) => (
                <li key={c.id}>
                  <Comment node={c} discussion={d} strings={strings} onChange={onChange} />
                </li>
              ))}
            </ul>

            {d.locked ? (
              <div className="mt-6 px-4 py-3 rounded-md border border-[var(--vscode-widget-border,var(--vscode-panel-border))] text-sm text-muted flex items-center gap-2">
                <span className="codicon codicon-lock" aria-hidden="true" />
                {strings.repliesClosedNotice}
              </div>
            ) : (
              <div className="mt-6">
                <Composer
                  ref={threadEndComposerRef}
                  draftKey={`discussion:${d.id}:reply`}
                  placeholder={strings.composerPlaceholder}
                  onSubmit={async (body) => {
                    await rpc({ kind: 'addComment', discussionId: d.id, body });
                    onChange();
                  }}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Comment({
  node,
  discussion,
  highlight,
  strings,
  onChange,
}: {
  node: CommentNode;
  discussion: DiscussionDetail;
  highlight?: boolean;
  strings: WebviewStrings;
  onChange: () => void;
}): JSX.Element {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const inlineComposerRef = useRef<ComposerHandle>(null);

  // Quote-selection surface: selecting text in this comment's body
  // flips replying on and seeds the inline composer.
  useQuoteSurface(
    `comment:${node.id}`,
    useCallback((q: string) => {
      if (discussion.locked) return;
      setReplying(true);
      // The composer mounts on the next render once replying flips,
      // so push the quote on the following frame.
      requestAnimationFrame(() => {
        inlineComposerRef.current?.insertAtStart(q);
        inlineComposerRef.current?.focus();
      });
    }, [discussion.locked]),
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (node.viewerCanMarkAsAnswer) {
      items.push({
        icon: 'pass-filled',
        label: strings.markAsAnswer,
        onSelect: async () => {
          await rpc({ kind: 'markAnswer', commentId: node.id });
          onChange();
        },
      });
    }
    if (node.viewerCanUnmarkAsAnswer) {
      items.push({
        icon: 'circle-slash',
        label: strings.unmarkAsAnswer,
        onSelect: async () => {
          await rpc({ kind: 'unmarkAnswer', commentId: node.id });
          onChange();
        },
      });
    }
    if (node.viewerCanUpdate) {
      items.push({
        icon: 'edit',
        label: strings.edit,
        onSelect: () => setEditing(true),
      });
    }
    if (node.viewerCanDelete) {
      items.push({
        icon: 'trash',
        label: strings.delete,
        destructive: true,
        onSelect: async () => {
          const { confirmed } = await rpc({
            kind: 'confirm',
            message: strings.deleteConfirm,
            confirmLabel: strings.delete,
            destructive: true,
          });
          if (!confirmed) return;
          await rpc({ kind: 'deleteComment', commentId: node.id });
          onChange();
        },
      });
    }
    return items;
  }, [node, strings, onChange]);

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
          <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums mr-1">
            <span className="codicon codicon-triangle-up" aria-hidden="true" />
            {node.upvoteCount}
          </span>
        )}
        <DropdownMenu items={menuItems} triggerLabel={strings.edit} />
      </header>

      {editing ? (
        <Composer
          draftKey={`comment:${node.id}:edit`}
          initialBody={node.body}
          submitLabel={strings.save}
          cancellable
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await rpc({ kind: 'updateComment', commentId: node.id, body });
            setEditing(false);
            onChange();
          }}
        />
      ) : (
        <div data-quote-surface={`comment:${node.id}`}>
          <Markdown source={node.body} />
        </div>
      )}

      {(node.replies.length > 0 || replying) && (
        <div className="mt-4 pl-4 border-l-2 border-[var(--vscode-widget-border,var(--vscode-panel-border))] flex flex-col gap-4">
          {node.replies.map((r) => (
            <Reply
              key={r.id}
              node={r}
              discussion={discussion}
              parentCommentId={node.id}
              strings={strings}
              onChange={onChange}
            />
          ))}

          {replying && (
            <Composer
              ref={inlineComposerRef}
              draftKey={`discussion:${discussion.id}:reply-to:${node.id}`}
              compact
              cancellable
              placeholder={strings.composerPlaceholder}
              submitLabel={strings.reply}
              onCancel={() => setReplying(false)}
              onSubmit={async (body) => {
                await rpc({
                  kind: 'addComment',
                  discussionId: discussion.id,
                  body,
                  replyToId: node.id,
                });
                setReplying(false);
                onChange();
              }}
            />
          )}
        </div>
      )}

      {!discussion.locked && !replying && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded text-xs text-fg/70 hover:text-fg hover:bg-hover transition-colors duration-100"
          >
            <span className="codicon codicon-reply" aria-hidden="true" />
            {strings.reply}
          </button>
        </div>
      )}
    </article>
  );
}

function Reply({
  node,
  discussion,
  parentCommentId,
  strings,
  onChange,
}: {
  node: CommentNode;
  discussion: DiscussionDetail;
  parentCommentId: string;
  strings: WebviewStrings;
  onChange: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (node.viewerCanUpdate) {
      items.push({ icon: 'edit', label: strings.edit, onSelect: () => setEditing(true) });
    }
    if (node.viewerCanDelete) {
      items.push({
        icon: 'trash',
        label: strings.delete,
        destructive: true,
        onSelect: async () => {
          const { confirmed } = await rpc({
            kind: 'confirm',
            message: strings.deleteConfirm,
            confirmLabel: strings.delete,
            destructive: true,
          });
          if (!confirmed) return;
          await rpc({ kind: 'deleteComment', commentId: node.id });
          onChange();
        },
      });
    }
    return items;
  }, [node, strings, onChange]);

  const mentionLogin = node.author?.login;
  const canReply = !discussion.locked && !replying && !editing;
  const composerRef = useRef<ComposerHandle>(null);

  // Selecting text inside this reply's body funnels into this
  // reply's inline composer (with replying flipped on if needed).
  useQuoteSurface(
    `reply:${node.id}`,
    useCallback((q: string) => {
      if (discussion.locked) return;
      setReplying(true);
      requestAnimationFrame(() => {
        composerRef.current?.insertAtStart(q);
        composerRef.current?.focus();
      });
    }, [discussion.locked]),
  );

  return (
    <article>
      <header className="flex items-center gap-2 mb-1.5">
        {node.author && <Avatar src={node.author.avatarUrl} alt={node.author.login} size={18} />}
        <span className="text-sm text-fg/90 font-medium">{node.author?.login ?? 'ghost'}</span>
        <span className="text-xs text-muted opacity-50">·</span>
        <span className="text-xs text-muted" title={absoluteTime(node.createdAt)}>
          {relativeTime(node.createdAt)}
        </span>
        <div className="flex-1" />
        <DropdownMenu items={menuItems} triggerLabel={strings.edit} />
      </header>
      {editing ? (
        <Composer
          draftKey={`comment:${node.id}:edit`}
          initialBody={node.body}
          submitLabel={strings.save}
          cancellable
          compact
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await rpc({ kind: 'updateComment', commentId: node.id, body });
            setEditing(false);
            onChange();
          }}
        />
      ) : (
        <div data-quote-surface={`reply:${node.id}`}>
          <Markdown source={node.body} />
        </div>
      )}

      {canReply && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded text-xs text-fg/60 hover:text-fg hover:bg-hover transition-colors duration-100"
          >
            <span className="codicon codicon-reply" aria-hidden="true" />
            {strings.reply}
          </button>
        </div>
      )}

      {replying && (
        <div className="mt-2">
          {mentionLogin && (
            <div className="text-xs text-muted mb-1.5 flex items-center gap-1.5">
              <span className="codicon codicon-reply" aria-hidden="true" />
              {strings.composerReplyingToPrefix}{' '}
              <span className="text-fg/80 font-medium">@{mentionLogin}</span>
            </div>
          )}
          {/* GitHub's Discussions API only allows a single nesting
              level — replyToId must point to a top-level comment.
              A "reply to a reply" is therefore sent as a fresh reply
              under the same parent comment. Quoting is opt-in via
              the button above rather than auto-prefilled: matches
              GitHub's web behaviour, keeps the composer uncluttered
              when the user just wants to chime in, and avoids
              dumping multi-paragraph quotes the user then has to
              delete. Thread participation handles notifying the
              original author. */}
          <Composer
            ref={composerRef}
            draftKey={`comment:${parentCommentId}:reply-to:${node.id}`}
            compact
            cancellable
            submitLabel={strings.reply}
            placeholder={strings.composerPlaceholder}
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              await rpc({
                kind: 'addComment',
                discussionId: discussion.id,
                body,
                replyToId: parentCommentId,
              });
              setReplying(false);
              onChange();
            }}
          />
        </div>
      )}
    </article>
  );
}
