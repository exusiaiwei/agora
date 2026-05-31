import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { onHostEvent, rpc } from './lib/vscode';
import { setLocale } from './lib/time';
import { StringsProvider, useStrings } from './lib/strings';
import type {
  DiscussionDetail,
  DiscussionListPage,
  DiscussionSummary,
  Repository,
  ViewerInfo,
} from '@shared/types';
import type { WebviewStringsDTO } from '@shared/strings';
import { Sidebar } from './components/Sidebar';
import { DiscussionList } from './components/DiscussionList';
import { Thread } from './components/Thread';
import { Button, EmptyState, Spinner } from './components/primitives';
import { SidebarApp } from './components/SidebarApp';
import { NewDiscussionView } from './components/NewDiscussionView';

export type AgoraMode = 'sidebar' | 'panel';

type View =
  | { name: 'list' }
  | { name: 'thread'; number: number }
  | { name: 'compose' };

interface AppState {
  view: View;
  repo: Repository | null;
  viewer: ViewerInfo | null;
  strings: WebviewStringsDTO | null;
  list: {
    page: DiscussionListPage | null;
    selectedCategoryId: string | null;
    loading: boolean;
    error: string | null;
  };
  thread: {
    discussion: DiscussionDetail | null;
    loading: boolean;
    error: string | null;
  };
}

type Action =
  | {
      type: 'setContext';
      repo: Repository | null;
      viewer: ViewerInfo | null;
      strings: WebviewStringsDTO;
    }
  | { type: 'navigate'; view: View }
  | { type: 'list/loading' }
  | { type: 'list/loaded'; page: DiscussionListPage }
  | { type: 'list/error'; error: string }
  | { type: 'list/setCategory'; id: string | null }
  | { type: 'thread/loading'; number: number }
  | { type: 'thread/loaded'; discussion: DiscussionDetail }
  | { type: 'thread/error'; error: string };

const initialState: AppState = {
  view: { name: 'list' },
  repo: null,
  viewer: null,
  strings: null,
  list: { page: null, selectedCategoryId: null, loading: false, error: null },
  thread: { discussion: null, loading: false, error: null },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setContext':
      return {
        ...state,
        repo: action.repo,
        viewer: action.viewer,
        strings: action.strings,
      };
    case 'navigate':
      return { ...state, view: action.view };
    case 'list/loading':
      return { ...state, list: { ...state.list, loading: true, error: null } };
    case 'list/loaded':
      return { ...state, list: { ...state.list, loading: false, page: action.page, error: null } };
    case 'list/error':
      return { ...state, list: { ...state.list, loading: false, error: action.error } };
    case 'list/setCategory':
      return {
        ...state,
        list: { ...state.list, selectedCategoryId: action.id, page: null, error: null },
      };
    case 'thread/loading':
      return {
        ...state,
        thread: { discussion: null, loading: true, error: null },
        view: { name: 'thread', number: action.number },
      };
    case 'thread/loaded':
      return { ...state, thread: { discussion: action.discussion, loading: false, error: null } };
    case 'thread/error':
      return { ...state, thread: { ...state.thread, loading: false, error: action.error } };
  }
}

export function App({ mode }: { mode: AgoraMode }): JSX.Element {
  if (mode === 'sidebar') {
    return <SidebarApp />;
  }
  return <PanelApp />;
}

function PanelApp(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const readyRef = useRef(false);

  // Mirror latest state into refs so the host-event handler (subscribed once)
  // can act on the *current* view/category rather than the values captured at
  // the time the effect ran.
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadList = useCallback(async (categoryId: string | null) => {
    dispatch({ type: 'list/loading' });
    try {
      const page = await rpc({ kind: 'listDiscussions', categoryId, cursor: null });
      dispatch({ type: 'list/loaded', page });
    } catch (err) {
      dispatch({ type: 'list/error', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const loadThread = useCallback(async (number: number, opts?: { silent?: boolean }) => {
    // `silent` reloads keep the previous discussion on screen until
    // the new payload arrives — used after a mutation (post / edit /
    // react / lock / …) so the thread doesn't blink to a spinner for
    // every small action. Initial navigation still shows the spinner.
    if (!opts?.silent) {
      dispatch({ type: 'thread/loading', number });
    }
    try {
      const discussion = await rpc({ kind: 'getDiscussion', number });
      dispatch({ type: 'thread/loaded', discussion });
    } catch (err) {
      // In silent mode the user is staring at a working thread; we
      // don't want to nuke it with an error screen because a single
      // refetch hiccuped. The next mutation will re-attempt, and if
      // something is truly broken the user can hit refresh.
      if (!opts?.silent) {
        dispatch({ type: 'thread/error', error: err instanceof Error ? err.message : String(err) });
      } else {
        // eslint-disable-next-line no-console
        console.warn('silent reload failed:', err);
      }
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
      } else if (event.kind === 'navigate') {
        if (event.to.view === 'list') {
          dispatch({ type: 'navigate', view: { name: 'list' } });
        } else if (event.to.view === 'compose') {
          dispatch({ type: 'navigate', view: { name: 'compose' } });
        } else {
          void loadThread(event.to.number);
        }
      } else if (event.kind === 'refresh') {
        const s = stateRef.current;
        if (s.view.name === 'list') {
          void loadList(s.list.selectedCategoryId);
        } else if (s.view.name === 'thread') {
          void loadThread(s.view.number);
        }
      }
    });
    if (!readyRef.current) {
      readyRef.current = true;
      void rpc({ kind: 'ready' });
    }
    return off;
  }, [loadList, loadThread]);

  // Initial / repo-change list load
  useEffect(() => {
    if (state.repo && state.view.name === 'list' && !state.list.page && !state.list.loading) {
      void loadList(state.list.selectedCategoryId);
    }
  }, [state.repo, state.view.name, state.list.selectedCategoryId, state.list.page, state.list.loading, loadList]);

  if (!state.strings) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <StringsProvider dto={state.strings}>
      <AppBody state={state} loadList={loadList} loadThread={loadThread} dispatch={dispatch} />
    </StringsProvider>
  );
}

function AppBody({
  state,
  loadList,
  loadThread,
  dispatch,
}: {
  state: AppState;
  loadList: (id: string | null) => void;
  loadThread: (n: number, opts?: { silent?: boolean }) => void;
  dispatch: (a: Action) => void;
}): JSX.Element {
  const strings = useStrings();

  if (!state.repo) {
    return (
      <Layout>
        <EmptyState
          icon="repo"
          title={strings.noRepoDetected}
          hint={strings.noRepoHint}
          action={
            <Button icon="refresh" onClick={() => rpc({ kind: 'redetectRepo' })}>
              {strings.refresh}
            </Button>
          }
        />
      </Layout>
    );
  }

  if (state.view.name === 'compose') {
    return (
      <Layout>
        <NewDiscussionView
          onCancel={() => dispatch({ type: 'navigate', view: { name: 'list' } })}
          onCreated={(number) => loadThread(number)}
        />
      </Layout>
    );
  }

  if (state.view.name === 'thread') {
    return (
      <Layout>
        {state.thread.loading && (
          <div className="p-10">
            <Spinner label={strings.loadingDiscussion} />
          </div>
        )}
        {state.thread.error && (
          <div className="p-10 text-error text-sm">{state.thread.error}</div>
        )}
        {state.thread.discussion && (
          <Thread
            discussion={state.thread.discussion}
            onBack={() => dispatch({ type: 'navigate', view: { name: 'list' } })}
            onOpenInBrowser={(url) => rpc({ kind: 'openInBrowser', url })}
            onChange={() => {
              if (state.view.name === 'thread') loadThread(state.view.number, { silent: true });
            }}
          />
        )}
      </Layout>
    );
  }

  return (
    <Layout>
      <ListView
        state={state}
        onSelectCategory={(id) => dispatch({ type: 'list/setCategory', id })}
        onOpenDiscussion={(d) => loadThread(d.number)}
        onRefresh={() => loadList(state.list.selectedCategoryId)}
      />
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="h-full w-full text-fg bg-bg">{children}</div>;
}

function ListView({
  state,
  onSelectCategory,
  onOpenDiscussion,
  onRefresh,
}: {
  state: AppState;
  onSelectCategory: (id: string | null) => void;
  onOpenDiscussion: (d: DiscussionSummary) => void;
  onRefresh: () => void;
}): JSX.Element {
  const strings = useStrings();
  const page = state.list.page;
  const filtered = useMemo(() => {
    if (!page) return [];
    if (state.list.selectedCategoryId === null) return page.nodes;
    return page.nodes.filter((n) => n.category.id === state.list.selectedCategoryId);
  }, [page, state.list.selectedCategoryId]);
  const countsByCategory = useMemo(() => {
    const m = new Map<string, number>();
    if (page) {
      for (const n of page.nodes) {
        m.set(n.category.id, (m.get(n.category.id) ?? 0) + 1);
      }
    }
    return m;
  }, [page]);

  return (
    <div className="flex h-full">
      <Sidebar
        categories={page?.categories ?? []}
        selectedCategoryId={state.list.selectedCategoryId}
        totalCount={page?.totalCount ?? 0}
        countsByCategory={countsByCategory}
        onSelectCategory={onSelectCategory}
      />
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-[var(--vscode-widget-border,var(--vscode-panel-border))]">
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-md font-semibold text-fg truncate">
                {state.repo?.owner}/{state.repo?.name}
              </div>
              <div className="text-xs text-muted">
                {page ? strings.discussionCount(page.totalCount) : ''}
              </div>
            </div>
            <Button icon="refresh" onClick={onRefresh}>
              {strings.refresh}
            </Button>
          </div>
        </header>

        {state.list.loading && (
          <div className="p-10">
            <Spinner label={strings.loadingDiscussions} />
          </div>
        )}
        {state.list.error && !state.list.loading && (
          <EmptyState icon="error" title={strings.failedToLoad} hint={state.list.error} />
        )}
        {!state.list.loading && !state.list.error && page && filtered.length === 0 && (
          <EmptyState icon="comment-discussion" title={strings.noDiscussions} />
        )}
        {!state.list.loading && filtered.length > 0 && (
          <div className="ag-fade-in">
            <DiscussionList discussions={filtered} onOpen={onOpenDiscussion} />
          </div>
        )}
      </main>
    </div>
  );
}
