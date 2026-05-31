import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';

export type AgoraMode = 'panel' | 'sidebar';

/**
 * Loads the Vite-built `dist/webview/index.html`, rewrites its asset
 * URLs to webview-safe URIs, injects a strict CSP, and stamps the
 * `<html>` element with `data-agora-mode` so the React app can render
 * the sidebar vs. the full panel from the same bundle.
 */
export async function loadWebviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  mode: AgoraMode,
): Promise<string> {
  const distRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
  const indexPath = vscode.Uri.joinPath(distRoot, 'index.html').fsPath;

  let html: string;
  try {
    html = await fs.readFile(indexPath, 'utf8');
  } catch {
    return `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:24px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)"><h2>Agora webview not built</h2><p>Run <code>npm run build:webview</code> to compile the React app.</p></body></html>`;
  }

  const nonce = makeNonce();

  html = html.replace(/(href|src)="([^"]+)"/g, (match, attr: string, src: string) => {
    if (/^(https?:|data:|vscode-webview:|#)/i.test(src)) return match;
    const normalized = src.replace(/^\.?\//, '');
    const onDisk = vscode.Uri.joinPath(distRoot, ...normalized.split('/'));
    const asWebviewUri = webview.asWebviewUri(onDisk).toString();
    return `${attr}="${asWebviewUri}"`;
  });

  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  // Stamp the root element so main.tsx knows which view to render.
  html = html.replace(/<html(\s[^>]*)?>/i, (_m, attrs = '') =>
    `<html${attrs} data-agora-mode="${mode}">`,
  );

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

  return html;
}

export function localResourceRoots(context: vscode.ExtensionContext): vscode.Uri[] {
  return [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')];
}

function makeNonce(): string {
  return randomBytes(16).toString('base64');
}
