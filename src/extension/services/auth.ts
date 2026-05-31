import * as vscode from 'vscode';

// VS Code's built-in GitHub provider only understands standard OAuth scopes
// (read:discussion / write:discussion are PAT-only fine-grained scopes, so
// requesting them used to silently downgrade us to public_repo and fail on
// private repositories). `repo` covers reading + writing discussions in
// both public and private repositories.
const SCOPES = ['repo'];
const PROVIDER = 'github';
const SIGNED_OUT_KEY = 'agora.signedOutAccounts';

export class AuthService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.AuthenticationSession | null>();
  readonly onDidChange = this._onDidChange.event;

  private session: vscode.AuthenticationSession | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
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

      // Respect a user-initiated sign-out: even if VS Code still holds a
      // session, we keep the extension in signed-out state until the user
      // explicitly signs back in.
      if (session && this.isAccountSignedOut(session.account.id)) {
        if (options.createIfNone) {
          // The user explicitly asked to sign in — clear the opt-out flag.
          await this.clearSignedOut(session.account.id);
        } else {
          if (this.session !== null) {
            this.session = null;
            this._onDidChange.fire(null);
          }
          return null;
        }
      }

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
    const accountId = this.session?.account.id;
    if (accountId) {
      await this.markSignedOut(accountId);
    }
    const previous = this.session;
    this.session = null;
    if (previous) {
      this._onDidChange.fire(null);
    }
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Open the Accounts menu in the Activity Bar to fully sign out of GitHub.',
      ),
      vscode.l10n.t('Open Accounts menu'),
    );
    if (choice) {
      await vscode.commands.executeCommand('workbench.actions.manage.accounts');
    }
  }

  private getSignedOutSet(): Set<string> {
    const stored = this.context.globalState.get<string[]>(SIGNED_OUT_KEY, []);
    return new Set(stored);
  }

  private isAccountSignedOut(accountId: string): boolean {
    return this.getSignedOutSet().has(accountId);
  }

  private async markSignedOut(accountId: string): Promise<void> {
    const set = this.getSignedOutSet();
    set.add(accountId);
    await this.context.globalState.update(SIGNED_OUT_KEY, [...set]);
  }

  private async clearSignedOut(accountId: string): Promise<void> {
    const set = this.getSignedOutSet();
    if (set.delete(accountId)) {
      await this.context.globalState.update(SIGNED_OUT_KEY, [...set]);
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
