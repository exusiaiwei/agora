import * as vscode from 'vscode';
import type { GitHubService } from '../services/github';
import type { RepositoryDetector } from '../services/gitRemote';
import type { AuthService } from '../services/auth';
import { buildWebviewStrings } from '../services/webviewStrings';
import { loadWebviewHtml, localResourceRoots } from './html';
import type {
  HostEvent,
  HostMessage,
  HostRpcResponse,
  WebviewRpcMessage,
} from '../../shared/messages';
import type { Repository, ViewerInfo } from '../../shared/types';

interface SidebarDeps {
  context: vscode.ExtensionContext;
  github: GitHubService;
  repoDetector: RepositoryDetector;
  auth: AuthService;
  viewer: () => ViewerInfo | null;
}

/**
 * The sidebar view replaces what was a TreeDataProvider so we can fully
 * control spacing, fonts, hover affordances and (eventually) inline
 * actions — VS Code's TreeView doesn't expose enough layout control to
 * match the Claude Code / Copilot Chat density (see vscode#28974,
 * #110092, #66605: extensions cannot match the built-in Explorer's
 * icon/indent layout).
 */
export class AgoraSidebarView implements vscode.WebviewViewProvider {
  static readonly viewType = 'agora.discussions';

  private view: vscode.WebviewView | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly deps: SidebarDeps) {
    this.disposables.push(
      deps.repoDetector.onDidChange(() => this.sendContext()),
      deps.auth.onDidChange(() => this.sendContext()),
    );
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: localResourceRoots(this.deps.context),
    };
    view.webview.html = await loadWebviewHtml(
      view.webview,
      this.deps.context,
      'sidebar',
    );

    view.onDidDispose(() => {
      this.view = null;
    });
    view.webview.onDidReceiveMessage((raw) => this.handleMessage(raw));
  }

  private sendContext(): void {
    this.post({ type: 'event', event: this.buildContextEvent() });
  }

  private buildContextEvent(): HostEvent {
    return {
      kind: 'context',
      repo: this.deps.repoDetector.current,
      viewer: this.deps.viewer(),
      locale: vscode.env.language,
      strings: buildWebviewStrings(),
    };
  }

  private post(message: HostMessage): void {
    if (this.view) void this.view.webview.postMessage(message);
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as WebviewRpcMessage;
    if (msg.type !== 'rpc') return;

    try {
      const result = await this.dispatch(msg);
      this.sendResponse({ type: 'rpc-response', requestId: msg.requestId, ok: true, result });
    } catch (err) {
      this.sendResponse({
        type: 'rpc-response',
        requestId: msg.requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async dispatch(msg: WebviewRpcMessage): Promise<unknown> {
    const req = msg.request;
    switch (req.kind) {
      case 'ready': {
        this.sendContext();
        return { ok: true };
      }
      case 'listDiscussions': {
        const repo = this.requireRepo();
        return this.deps.github.listDiscussions(repo, {
          categoryId: req.categoryId,
          cursor: req.cursor,
          first: vscode.workspace.getConfiguration('agora').get<number>('pageSize', 25),
        });
      }
      case 'getDiscussion': {
        // Clicking a discussion in the sidebar should open the full
        // panel rather than try to render the thread in the narrow side
        // view.
        await vscode.commands.executeCommand('agora.openDiscussion', req.number);
        // Return a minimal placeholder so the RPC envelope is happy.
        return { ok: true };
      }
      case 'openInBrowser': {
        await vscode.env.openExternal(vscode.Uri.parse(req.url));
        return { ok: true };
      }
      case 'signIn': {
        await this.deps.auth.signIn();
        return { ok: true };
      }
      case 'redetectRepo': {
        await this.deps.repoDetector.refresh();
        this.sendContext();
        return { ok: true };
      }
    }
  }

  private requireRepo(): Repository {
    const repo = this.deps.repoDetector.current;
    if (!repo) {
      throw new Error(
        vscode.l10n.t('Could not detect a GitHub repository in this workspace.'),
      );
    }
    return repo;
  }

  private sendResponse(response: HostRpcResponse): void {
    if (this.view) void this.view.webview.postMessage(response);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
