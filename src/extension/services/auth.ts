import * as vscode from 'vscode';

const SCOPES = ['read:discussion', 'write:discussion', 'public_repo'];
const PROVIDER = 'github';

export class AuthService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.AuthenticationSession | null>();
  readonly onDidChange = this._onDidChange.event;

  private session: vscode.AuthenticationSession | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.authentication.onDidChangeSessions(async (e) => {
        if (e.provider.id === PROVIDER) {
          await this.refresh({ silent: true });
        }
      }),
    );
  }

  get currentSession(): vscode.AuthenticationSession | null {
    return this.session;
  }

  async refresh(options: { silent?: boolean; createIfNone?: boolean } = {}): Promise<vscode.AuthenticationSession | null> {
    try {
      const session = await vscode.authentication.getSession(PROVIDER, SCOPES, {
        createIfNone: options.createIfNone ?? false,
        silent: options.silent ?? false,
      });
      const changed = session?.accessToken !== this.session?.accessToken;
      this.session = session ?? null;
      if (changed) {
        this._onDidChange.fire(this.session);
      }
      return this.session;
    } catch (err) {
      if (!options.silent) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(vscode.l10n.t('Sign in failed: {0}', msg));
      }
      return null;
    }
  }

  async signIn(): Promise<vscode.AuthenticationSession | null> {
    return this.refresh({ createIfNone: true });
  }

  async signOut(): Promise<void> {
    this.session = null;
    this._onDidChange.fire(null);
    // VS Code itself owns the session lifecycle for the built-in GitHub provider;
    // the user must sign out from the Accounts menu. We just drop our reference.
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Open the Accounts menu in the activity bar to fully sign out of GitHub.'),
    );
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
