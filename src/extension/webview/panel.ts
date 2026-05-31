import * as vscode from 'vscode';
import type { GitHubService } from '../services/github';
import type { RepositoryDetector } from '../services/gitRemote';
import type { AuthService } from '../services/auth';
import { buildWebviewStrings } from '../services/webviewStrings';
import { loadWebviewHtml, localResourceRoots } from './html';
import { dispatchWriteRpc, isWriteRpc } from './rpc';
import type {
  HostEvent,
  HostMessage,
  HostRpcResponse,
  WebviewRpcMessage,
} from '../../shared/messages';
import type { Repository, ViewerInfo } from '../../shared/types';

interface PanelDeps {
  context: vscode.ExtensionContext;
  github: GitHubService;
  repoDetector: RepositoryDetector;
  auth: AuthService;
  viewer: () => ViewerInfo | null;
}

export class AgoraPanel {
  private static current: AgoraPanel | null = null;

  static reveal(deps: PanelDeps, initial?: HostEvent): AgoraPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (AgoraPanel.current) {
      AgoraPanel.current.panel.reveal(column);
      if (initial) AgoraPanel.current.post({ type: 'event', event: initial });
      return AgoraPanel.current;
    }
    AgoraPanel.current = new AgoraPanel(deps, initial);
    return AgoraPanel.current;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(private readonly deps: PanelDeps, initial?: HostEvent) {
    this.panel = vscode.window.createWebviewPanel(
      'agora.panel',
      'Agora · Discussions',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: localResourceRoots(deps.context),
      },
    );
    this.panel.iconPath = {
      light: vscode.Uri.joinPath(deps.context.extensionUri, 'media', 'agora.svg'),
      dark: vscode.Uri.joinPath(deps.context.extensionUri, 'media', 'agora.svg'),
    };
    void this.setHtml().then(() => {
      if (initial) this.post({ type: 'event', event: initial });
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.disposables.push(
      deps.repoDetector.onDidChange(() => this.sendContext()),
      deps.auth.onDidChange(() => this.sendContext()),
    );
  }

  navigate(event: HostEvent): void {
    this.post({ type: 'event', event });
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
    void this.panel.webview.postMessage(message);
  }

  private async setHtml(): Promise<void> {
    this.panel.webview.html = await loadWebviewHtml(
      this.panel.webview,
      this.deps.context,
      'panel',
    );
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as WebviewRpcMessage;
    if (msg.type !== 'rpc') return;

    try {
      const result = await this.dispatch(msg);
      this.sendResponse({
        type: 'rpc-response',
        requestId: msg.requestId,
        ok: true,
        result,
      });
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
        const repo = this.requireRepo();
        return this.deps.github.getDiscussion(repo, req.number);
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
      default:
        if (isWriteRpc(req)) {
          return dispatchWriteRpc(req, this.deps);
        }
        throw new Error(`Unknown RPC: ${(req as { kind: string }).kind}`);
    }
  }

  private requireRepo(): Repository {
    const repo = this.deps.repoDetector.current;
    if (!repo) {
      throw new Error(vscode.l10n.t('Could not detect a GitHub repository in this workspace.'));
    }
    return repo;
  }

  private sendResponse(response: HostRpcResponse): void {
    void this.panel.webview.postMessage(response);
  }

  dispose(): void {
    AgoraPanel.current = null;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
