import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { onHostEvent, rpc } from '../lib/vscode';
import { setLocale } from '../lib/time';
import { StringsProvider, useStrings } from '../lib/strings';
import type {
  Category,
  DiscussionListPage,
  DiscussionSummary,
  Repository,
  ViewerInfo,
} from '@shared/types';
import type { WebviewStringsDTO } from '@shared/strings';
import { Spinner } from './primitives';
import { cn } from '../lib/cn';

interface SidebarState {
  repo: Repository | null;
  viewer: ViewerInfo | null;
  strings: WebviewStringsDTO | null;
  page: DiscussionListPage | null;
  loading: boolean;
  error: string | null;
}

type Action =
  | {
      type: 'setContext';
      repo: Repository | null;
      viewer: ViewerInfo | null;
      strings: WebviewStringsDTO;
    }
  | { type: 'loading' }
  | { type: 'loaded'; page: DiscussionListPage }
  | { type: 'error'; error: string };

const initial: SidebarState = {
  repo: null,
  viewer: null,
  strings: null,
  page: null,
  loading: false,
  error: null,
};

function reducer(state: SidebarState, a: Action): SidebarState {
  switch (a.type) {
    case 'setContext':
      return { ...state, repo: a.repo, viewer: a.viewer, strings: a.strings };
    case 'loading':
      return { ...state, loading: true, error: null };
    case 'loaded':
      return { ...state, loading: false, page: a.page, error: null };
    case 'error':
      return { ...state, loading: false, error: a.error };
  }
}

export function SidebarApp(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initial);
  const readyRef = useRef(false);

  const load = useCallback(async () => {
    dispatch({ type: 'loading' });
    try {
      const page = await rpc({ kind: 'listDiscussions', categoryId: null, cursor: null });
      dispatch({ type: 'loaded', page });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'error', error: msg || 'Unknown error' });
    }
  }, []);

  useEffect(() => {
    const off = onHostEvent((event) => {
      if (event.kind === 'context') {
        setLocale(event.locale);
        dispatch({
          type: 'setContext',
          repo: event.repo,
          viewer: event.viewer,
          strings: event.strings,
        });
      }
    });
    if (!readyRef.current) {
      readyRef.current = true;
      void rpc({ kind: 'ready' });
    }
    return off;
  }, []);

  // Load when context arrives / repo changes
  useEffect(() => {
    if (state.repo && !state.page && !state.loading) {
      void load();
    }
  }, [state.repo, state.page, state.loading, load]);

  if (!state.strings) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <StringsProvider dto={state.strings}>
      <SidebarBody state={state} onRefresh={load} />
    </StringsProvider>
  );
}

function SidebarBody({
  state,
  onRefresh,
}: {
  state: SidebarState;
  onRefresh: () => void;
}): JSX.Element {
  const strings = useStrings();

  if (!state.repo) {
    return (
      <div className="h-full p-3 text-sm text-muted ag-fade-in">
        <p className="leading-relaxed">{strings.noRepoDetected}</p>
        <p className="mt-2 text-xs leading-relaxed opacity-80">{strings.noRepoHint}</p>
        <button
          type="button"
          onClick={() => rpc({ kind: 'redetectRepo' })}
          className="mt-3 inline-flex items-center gap-1.5 h-[24px] px-2 rounded text-xs bg-btn-secondary-bg text-btn-secondary-fg hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
        >
          <span className="codicon codicon-refresh" aria-hidden="true" />
          {strings.refresh}
        </button>
      </div>
    );
  }

  return (
    <div className="ag-fade-in flex flex-col h-full">
      <SidebarHeader repo={state.repo} totalCount={state.page?.totalCount} onRefresh={onRefresh} />
      {state.loading && (
        <div className="px-3 py-4">
          <Spinner label={strings.loadingDiscussions} />
        </div>
      )}
      {!state.loading && state.error && (
        <div className="px-3 py-4">
          <div className="text-xs text-error">{state.error}</div>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1.5 h-[24px] px-2 rounded text-xs bg-btn-secondary-bg text-btn-secondary-fg hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
          >
            <span className="codicon codicon-refresh" aria-hidden="true" />
            {strings.refresh}
          </button>
        </div>
      )}
      {!state.loading && !state.error && state.page && (
        <SidebarList page={state.page} />
      )}
      {!state.loading && !state.error && !state.page && (
        <div className="px-3 py-4">
          <div className="text-xs text-muted">{strings.failedToLoad}</div>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1.5 h-[24px] px-2 rounded text-xs bg-btn-secondary-bg text-btn-secondary-fg hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
          >
            <span className="codicon codicon-refresh" aria-hidden="true" />
            {strings.refresh}
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarHeader({
  repo,
  totalCount,
  onRefresh,
}: {
  repo: Repository;
  totalCount: number | undefined;
  onRefresh: () => void;
}): JSX.Element {
  const strings = useStrings();
  return (
    <header className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
      <div className="flex items-center gap-2">
        <span className="codicon codicon-repo text-muted shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg truncate" title={`${repo.owner}/${repo.name}`}>
            {repo.name}
          </div>
          <div className="text-xs text-muted truncate">
            {repo.owner}
            {totalCount !== undefined && (
              <>
                <span className="opacity-40"> · </span>
                {strings.discussionCount(totalCount)}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => rpc({ kind: 'openCompose' })}
          title={strings.newDiscussion}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-fg/70 hover:text-fg hover:bg-hover"
        >
          <span className="codicon codicon-add" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          title={strings.refresh}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-fg/70 hover:text-fg hover:bg-hover"
        >
          <span className="codicon codicon-refresh" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function SidebarList({ page }: { page: DiscussionListPage }): JSX.Element {
  const strings = useStrings();

  // Group discussions by category, but keep all categories visible even
  // if empty, so the sidebar mirrors the GitHub Discussions structure.
  const byCategory = useMemo(() => {
    const groups = new Map<string, DiscussionSummary[]>();
    for (const cat of page.categories) groups.set(cat.id, []);
    for (const d of page.nodes) {
      const arr = groups.get(d.category.id);
      if (arr) arr.push(d);
      else groups.set(d.category.id, [d]);
    }
    return groups;
  }, [page]);

  // Default: expand only categories with content; user can toggle.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const [id, arr] of byCategory) if (arr.length > 0) s.add(id);
    return s;
  });

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {page.categories.map((cat) => {
        const items = byCategory.get(cat.id) ?? [];
        const isOpen = expanded.has(cat.id);
        return (
          <div key={cat.id}>
            <CategoryHeader
              category={cat}
              count={items.length}
              expanded={isOpen}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat.id)) next.delete(cat.id);
                  else next.add(cat.id);
                  return next;
                })
              }
            />
            {isOpen && (
              <ul className="mb-1">
                {items.length === 0 ? (
                  <li className="pl-7 pr-3 py-1 text-xs text-muted italic">
                    {strings.noDiscussions}
                  </li>
                ) : (
                  items.map((d) => (
                    <li key={d.id}>
                      <DiscussionRow discussion={d} />
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CategoryHeader({
  category,
  count,
  expanded,
  onToggle,
}: {
  category: Category;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'group w-full flex items-center gap-1.5 px-2 h-[26px] text-left text-sm rounded-sm',
        'text-fg/85 hover:bg-hover transition-colors duration-100',
      )}
    >
      <span
        className={cn(
          'codicon shrink-0 text-fg/60 transition-transform duration-100',
          expanded ? 'codicon-chevron-down' : 'codicon-chevron-right',
        )}
        aria-hidden="true"
      />
      <span className="shrink-0 text-base leading-none" aria-hidden="true">
        {category.emoji || '•'}
      </span>
      <span className="flex-1 truncate text-[13px] font-medium">{category.name}</span>
      {count > 0 && (
        <span className="text-xs text-muted tabular-nums">{count}</span>
      )}
    </button>
  );
}

function DiscussionRow({ discussion: d }: { discussion: DiscussionSummary }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => rpc({ kind: 'getDiscussion', number: d.number })}
      className={cn(
        'group w-full flex items-start gap-2 pl-7 pr-2.5 py-1.5 text-left',
        'rounded-sm text-fg/90 hover:bg-hover transition-colors duration-100',
      )}
      title={`${d.title}\n#${d.number} · ${d.commentCount} comments`}
    >
      <StatusGlyph d={d} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] leading-snug truncate">{d.title}</span>
        <span className="block text-[11px] text-muted leading-tight mt-0.5">
          <span className="tabular-nums">#{d.number}</span>
          {d.commentCount > 0 && (
            <>
              <span className="opacity-40"> · </span>
              <span className="tabular-nums">{d.commentCount}</span>
              <span className="opacity-40"> </span>
              <span className="codicon codicon-comment text-[10px]" aria-hidden="true" />
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function StatusGlyph({ d }: { d: DiscussionSummary }): JSX.Element {
  if (d.answered) {
    return (
      <span
        className="codicon codicon-pass-filled text-success mt-[2px] shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (d.locked) {
    return <span className="codicon codicon-lock text-muted mt-[2px] shrink-0" aria-hidden="true" />;
  }
  if (d.closed) {
    return <span className="codicon codicon-check text-muted mt-[2px] shrink-0" aria-hidden="true" />;
  }
  return (
    <span className="codicon codicon-comment text-fg/50 mt-[2px] shrink-0" aria-hidden="true" />
  );
}
