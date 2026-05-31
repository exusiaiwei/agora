import * as vscode from 'vscode';
import { AuthService } from './services/auth';
import { GitHubService } from './services/github';
import { RepositoryDetector } from './services/gitRemote';
import { AgoraPanel } from './webview/panel';
import { AgoraSidebarView } from './webview/sidebarView';
import type { ViewerInfo } from '../shared/types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const auth = new AuthService(context);
  const github = new GitHubService();
  const repoDetector = new RepositoryDetector();
  let viewer: ViewerInfo | null = null;

  context.subscriptions.push(auth, repoDetector);

  const deps = {
    context,
    github,
    repoDetector,
    auth,
    viewer: () => viewer,
  };

  const sidebar = new AgoraSidebarView(deps);
  context.subscriptions.push(sidebar);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgoraSidebarView.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
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
        console.warn('[agora] viewer fetch failed:', err);
        viewer = null;
      }
    } else {
      viewer = null;
    }
    await updateContext();
  };

  context.subscriptions.push(auth.onDidChange(() => void onAuthChanged()));
  context.subscriptions.push(
    repoDetector.onDidChange(() => {
      void updateContext();
    }),
  );

  await auth.refresh({ silent: true });
  await onAuthChanged();

  context.subscriptions.push(
    vscode.commands.registerCommand('agora.signIn', async () => {
      await auth.signIn();
    }),
    vscode.commands.registerCommand('agora.signOut', async () => {
      await auth.signOut();
    }),
    vscode.commands.registerCommand('agora.refresh', async () => {
      await repoDetector.refresh();
      // Sidebar re-fetches on context change; here we also send a refresh
      // event so any open panel re-runs its current view.
    }),
    vscode.commands.registerCommand('agora.openHome', () => {
      AgoraPanel.reveal(deps, { kind: 'navigate', to: { view: 'list' } });
    }),
    vscode.commands.registerCommand('agora.openDiscussion', (numberOrSummary: unknown) => {
      const number =
        typeof numberOrSummary === 'number'
          ? numberOrSummary
          : isSummary(numberOrSummary)
            ? numberOrSummary.number
            : NaN;
      if (Number.isNaN(number)) return;
      AgoraPanel.reveal(deps, { kind: 'navigate', to: { view: 'discussion', number } });
    }),
    vscode.commands.registerCommand('agora.openInBrowser', (arg: unknown) => {
      const url =
        typeof arg === 'string' ? arg : isSummary(arg) ? arg.url : null;
      if (url) {
        void vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),
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
