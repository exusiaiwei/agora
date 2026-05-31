import * as vscode from 'vscode';
import { AuthService } from './services/auth';
import { GitHubService } from './services/github';
import { RepositoryDetector } from './services/gitRemote';
import { DiscussionsTreeProvider } from './providers/discussionsTree';
import { AgoraPanel } from './webview/panel';
import type { ViewerInfo } from '../shared/types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const auth = new AuthService(context);
  const github = new GitHubService();
  const repoDetector = new RepositoryDetector();
  let viewer: ViewerInfo | null = null;

  context.subscriptions.push(auth, repoDetector);

  const tree = new DiscussionsTreeProvider(github, auth);
  context.subscriptions.push(tree);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agora.discussions', tree),
  );

  const updateContext = async (): Promise<void> => {
    const signedIn = !!auth.currentSession;
    const hasRepo = !!repoDetector.current;
    await vscode.commands.executeCommand('setContext', 'agora.signedIn', signedIn);
    await vscode.commands.executeCommand('setContext', 'agora.hasRepo', hasRepo);
  };

  const onAuthChanged = async (): Promise<void> => {
    const session = auth.currentSession;
    github.setToken(session?.accessToken ?? null);
    if (session) {
      try {
        viewer = await github.getViewer();
      } catch (err) {
        // Don't block activation on viewer fetch failures; surface as a
        // log entry but keep operating with a null viewer.
        console.warn('[agora] viewer fetch failed:', err);
        viewer = null;
      }
    } else {
      viewer = null;
    }
    await updateContext();
    tree.refresh();
  };

  context.subscriptions.push(auth.onDidChange(() => void onAuthChanged()));
  context.subscriptions.push(
    repoDetector.onDidChange((repo) => {
      tree.setRepo(repo);
      void updateContext();
    }),
  );

  await auth.refresh({ silent: true });
  await onAuthChanged();
  tree.setRepo(repoDetector.current);

  context.subscriptions.push(
    vscode.commands.registerCommand('agora.signIn', async () => {
      await auth.signIn();
    }),
    vscode.commands.registerCommand('agora.signOut', async () => {
      await auth.signOut();
    }),
    vscode.commands.registerCommand('agora.refresh', async () => {
      await repoDetector.refresh();
      tree.refresh();
    }),
    vscode.commands.registerCommand('agora.openHome', () => {
      AgoraPanel.reveal(
        {
          context,
          auth,
          github,
          repoDetector,
          viewer: () => viewer,
        },
        { kind: 'navigate', to: { view: 'list' } },
      );
    }),
    vscode.commands.registerCommand('agora.openDiscussion', (numberOrSummary: unknown) => {
      const number =
        typeof numberOrSummary === 'number'
          ? numberOrSummary
          : isSummary(numberOrSummary)
            ? numberOrSummary.number
            : NaN;
      if (Number.isNaN(number)) return;
      AgoraPanel.reveal(
        {
          context,
          auth,
          github,
          repoDetector,
          viewer: () => viewer,
        },
        { kind: 'navigate', to: { view: 'discussion', number } },
      );
    }),
    vscode.commands.registerCommand('agora.openInBrowser', (arg: unknown) => {
      const url =
        typeof arg === 'string'
          ? arg
          : isSummary(arg)
            ? arg.url
            : null;
      if (url) {
        void vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),
    vscode.commands.registerCommand(
      '_agora.loadMore',
      async (categoryId: string, cursor: string) => {
        try {
          await tree.loadCategoryPage(categoryId, cursor);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(msg);
        }
      },
    ),
  );
}

export function deactivate(): void {
  // disposables handle cleanup
}

function isSummary(v: unknown): v is { number: number; url: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { number?: unknown }).number === 'number' &&
    typeof (v as { url?: unknown }).url === 'string'
  );
}
