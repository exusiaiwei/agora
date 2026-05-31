import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import type { GitHubService } from '../services/github';
import type { RepositoryDetector } from '../services/gitRemote';
import type { AuthService } from '../services/auth';
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
    const distRoot = vscode.Uri.joinPath(deps.context.extensionUri, 'dist', 'webview');
    this.panel = vscode.window.createWebviewPanel(
      'agora.panel',
      'Agora · Discussions',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distRoot],
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
      deps.repoDetector.onDidChange((repo) => {
        this.post({ type: 'event', event: { kind: 'context', repo, viewer: deps.viewer() } });
      }),
      deps.auth.onDidChange(() => {
        this.post({
          type: 'event',
          event: {
            kind: 'context',
            repo: deps.repoDetector.current,
            viewer: deps.viewer(),
          },
        });
      }),
    );
  }

  navigate(event: HostEvent): void {
    this.post({ type: 'event', event });
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async setHtml(): Promise<void> {
    const distRoot = vscode.Uri.joinPath(this.deps.context.extensionUri, 'dist', 'webview');
    const indexPath = vscode.Uri.joinPath(distRoot, 'index.html').fsPath;
    let html: string;
    try {
      html = await fs.readFile(indexPath, 'utf8');
    } catch {
      this.panel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:24px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)"><h2>Agora webview not built</h2><p>Run <code>npm run build:webview</code> to compile the React app.</p></body></html>`;
      return;
    }

    const nonce = makeNonce();
    const webview = this.panel.webview;

    html = html.replace(/(href|src)="([^"]+)"/g, (match, attr: string, src: string) => {
      if (/^(https?:|data:|vscode-webview:|#)/i.test(src)) return match;
      const normalized = src.replace(/^\.?\//, '');
      const onDisk = vscode.Uri.joinPath(distRoot, ...normalized.split('/'));
      const asWebviewUri = webview.asWebviewUri(onDisk).toString();
      return `${attr}="${asWebviewUri}"`;
    });

    html = html.replace(/<script /g, `<script nonce="${nonce}" `);

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `connect-src https://api.github.com`,
    ].join('; ');

    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="dark light">`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${meta}</head>`);
    } else {
      html = meta + html;
    }

    this.panel.webview.html = html;
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
        this.post({
          type: 'event',
          event: {
            kind: 'context',
            repo: this.deps.repoDetector.current,
            viewer: this.deps.viewer(),
          },
        });
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

function makeNonce(): string {
  let s = '';
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
