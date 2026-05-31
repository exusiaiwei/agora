import * as vscode from 'vscode';
import type { Repository } from '../../shared/types';

interface GitExtension {
  getAPI(version: 1): GitAPI;
}

const logger = vscode.window.createOutputChannel('Agora');

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    remotes: Array<{
      name: string;
      fetchUrl?: string;
      pushUrl?: string;
    }>;
    onDidChange: vscode.Event<void>;
  };
}

const GITHUB_PATTERNS = [
  // https://github.com/owner/name(.git)
  /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  // git@github.com:owner/name(.git) — also matches SSH config aliases
  // like `git@github-personal:owner/name.git`.
  /^git@(?:[a-z0-9_.-]*github[a-z0-9_.-]*):([^/]+)\/([^/]+?)(?:\.git)?$/i,
  // ssh://git@github.com/owner/name(.git)
  /^ssh:\/\/git@(?:[a-z0-9_.-]*github[a-z0-9_.-]*)\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
];

export function parseGitHubRemote(url: string): Repository | null {
  for (const pattern of GITHUB_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], name: match[2] };
    }
  }
  return null;
}

export function parseRepoString(value: string): Repository | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

export class RepositoryDetector implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<Repository | null>();
  readonly onDidChange = this._onDidChange.event;

  private _current: Repository | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private gitApi: GitAPI | null = null;

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('agora.repository')) {
          void this.refresh();
        }
      }),
    );
    void this.initialize();
  }

  get current(): Repository | null {
    return this._current;
  }

  private async initialize(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (ext) {
        const exports = ext.isActive ? ext.exports : await ext.activate();
        this.gitApi = exports.getAPI(1);

        const watchRepo = (repo: GitRepository): void => {
          this.disposables.push(repo.state.onDidChange(() => void this.refresh()));
        };
        for (const repo of this.gitApi.repositories) {
          watchRepo(repo);
        }
        this.disposables.push(
          // When VS Code's git extension discovers a new repository (often
          // *after* we've finished activating), wire up the same state
          // listener — `remotes` is populated asynchronously, so the first
          // `onDidOpenRepository` fires before remotes are available.
          this.gitApi.onDidOpenRepository((repo) => {
            watchRepo(repo);
            void this.refresh();
          }),
          this.gitApi.onDidCloseRepository(() => void this.refresh()),
        );
      }
    } catch {
      // Git extension is optional.
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const override = vscode.workspace.getConfiguration('agora').get<string>('repository', '');
    const parsed = override ? parseRepoString(override) : null;
    const detected = parsed ?? this.detectFromGit();
    const changed =
      detected?.owner !== this._current?.owner || detected?.name !== this._current?.name;
    this._current = detected;
    if (changed) {
      this._onDidChange.fire(detected);
    }
  }

  private detectFromGit(): Repository | null {
    if (!this.gitApi) {
      logger.appendLine('[detect] git extension API not available');
      return null;
    }
    const repos = this.gitApi.repositories;
    if (repos.length === 0) {
      logger.appendLine('[detect] git extension has no repositories yet (will retry on open)');
      return null;
    }
    for (const repo of repos) {
      const remotes = repo.state.remotes;
      const ordered = [
        ...remotes.filter((r) => r.name === 'origin'),
        ...remotes.filter((r) => r.name === 'upstream'),
        ...remotes.filter((r) => r.name !== 'origin' && r.name !== 'upstream'),
      ];
      if (ordered.length === 0) {
        logger.appendLine(
          `[detect] repo ${repo.rootUri.fsPath} has no remotes yet`,
        );
        continue;
      }
      for (const remote of ordered) {
        const url = remote.fetchUrl ?? remote.pushUrl;
        if (!url) continue;
        const parsed = parseGitHubRemote(url);
        if (parsed) {
          logger.appendLine(
            `[detect] matched ${remote.name} ${url} → ${parsed.owner}/${parsed.name}`,
          );
          return parsed;
        }
        logger.appendLine(
          `[detect] remote ${remote.name} ${url} did not match GitHub patterns`,
        );
      }
    }
    return null;
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
