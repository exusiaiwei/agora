import * as vscode from 'vscode';
import type { GitHubService } from '../services/github';
import type { AuthService } from '../services/auth';
import type {
  Category,
  DiscussionSummary,
  Repository,
} from '../../shared/types';

type Node = CategoryNode | DiscussionNode | LoadMoreNode | InfoNode;

interface CategoryNode {
  kind: 'category';
  category: Category;
}

interface DiscussionNode {
  kind: 'discussion';
  discussion: DiscussionSummary;
}

interface LoadMoreNode {
  kind: 'loadMore';
  categoryId: string | null;
  cursor: string;
}

interface InfoNode {
  kind: 'info';
  label: string;
}

interface CategoryCache {
  category: Category;
  discussions: DiscussionSummary[];
  cursor: string | null;
  hasNextPage: boolean;
  loaded: boolean;
}

export class DiscussionsTreeProvider
  implements vscode.TreeDataProvider<Node>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private categoriesById = new Map<string, CategoryCache>();
  private categoryOrder: string[] = [];
  private loadingRoot = false;
  private rootError: string | null = null;
  private repo: Repository | null = null;

  constructor(
    private readonly github: GitHubService,
    private readonly auth: AuthService,
  ) {}

  refresh(): void {
    this.categoriesById.clear();
    this.categoryOrder = [];
    this.rootError = null;
    this._onDidChange.fire(undefined);
  }

  setRepo(repo: Repository | null): void {
    this.repo = repo;
    this.refresh();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'category': {
        const item = new vscode.TreeItem(
          `${node.category.emoji} ${node.category.name}`.trim(),
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = 'category';
        item.id = `category:${node.category.id}`;
        item.tooltip = node.category.description ?? undefined;
        return item;
      }
      case 'discussion': {
        const d = node.discussion;
        const item = new vscode.TreeItem(d.title, vscode.TreeItemCollapsibleState.None);
        item.id = `discussion:${d.id}`;
        item.description = `#${d.number} · ${d.commentCount}`;
        item.contextValue = 'discussion';
        item.iconPath = iconFor(d);
        item.tooltip = new vscode.MarkdownString(
          `**${escapeMarkdown(d.title)}** \`#${d.number}\`\n\n` +
            `${d.author ? `@${d.author.login} · ` : ''}${relativeTime(d.updatedAt)}\n\n` +
            `${d.category.emoji} ${escapeMarkdown(d.category.name)} · ` +
            `💬 ${d.commentCount}` +
            (d.answered ? ` · ✓` : ''),
        );
        item.command = {
          command: 'agora.openDiscussion',
          title: 'Open',
          arguments: [d.number],
        };
        return item;
      }
      case 'loadMore': {
        const item = new vscode.TreeItem(
          vscode.l10n.t('Load more…'),
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('chevron-down');
        item.command = {
          command: '_agora.loadMore',
          title: 'Load more',
          arguments: [node.categoryId, node.cursor],
        };
        return item;
      }
      case 'info': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
      }
    }
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!this.auth.currentSession || !this.repo) {
      return [];
    }
    if (!node) {
      return this.getRoot();
    }
    if (node.kind === 'category') {
      return this.getCategoryChildren(node.category.id);
    }
    return [];
  }

  private async getRoot(): Promise<Node[]> {
    if (this.loadingRoot) return [];
    if (this.categoryOrder.length === 0 && !this.rootError) {
      this.loadingRoot = true;
      try {
        await this.loadPage(null, null);
      } catch (err) {
        this.rootError = err instanceof Error ? err.message : String(err);
      } finally {
        this.loadingRoot = false;
      }
    }
    if (this.rootError) {
      return [{ kind: 'info', label: this.rootError }];
    }
    if (this.categoryOrder.length === 0) {
      return [{ kind: 'info', label: vscode.l10n.t('No discussions yet.') }];
    }
    return this.categoryOrder.map((id) => ({
      kind: 'category',
      category: this.categoriesById.get(id)!.category,
    }));
  }

  private async getCategoryChildren(categoryId: string): Promise<Node[]> {
    const cache = this.categoriesById.get(categoryId);
    if (!cache) return [];
    const nodes: Node[] = cache.discussions.map((d) => ({ kind: 'discussion', discussion: d }));
    if (cache.discussions.length === 0) {
      nodes.push({ kind: 'info', label: vscode.l10n.t('No discussions in this category.') });
    }
    if (cache.hasNextPage && cache.cursor) {
      nodes.push({ kind: 'loadMore', categoryId, cursor: cache.cursor });
    }
    return nodes;
  }

  async loadPage(categoryId: string | null, cursor: string | null): Promise<void> {
    if (!this.repo) return;
    const page = await this.github.listDiscussions(this.repo, {
      categoryId,
      cursor,
      first: vscode.workspace.getConfiguration('agora').get<number>('pageSize', 25),
    });

    for (const cat of page.categories) {
      if (!this.categoriesById.has(cat.id)) {
        this.categoriesById.set(cat.id, {
          category: cat,
          discussions: [],
          cursor: null,
          hasNextPage: false,
          loaded: false,
        });
        this.categoryOrder.push(cat.id);
      }
    }

    for (const d of page.nodes) {
      const cache = this.categoriesById.get(d.category.id);
      if (!cache) continue;
      if (!cache.discussions.some((existing) => existing.id === d.id)) {
        cache.discussions.push(d);
      }
      cache.cursor = page.endCursor;
      cache.hasNextPage = page.hasNextPage;
      cache.loaded = true;
    }

    this._onDidChange.fire(undefined);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function iconFor(d: DiscussionSummary): vscode.ThemeIcon {
  if (d.answered) {
    return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
  }
  if (d.locked) return new vscode.ThemeIcon('lock');
  if (d.closed) return new vscode.ThemeIcon('check');
  return new vscode.ThemeIcon('comment-discussion');
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return vscode.l10n.t('just now');
  if (m < 60) return vscode.l10n.t('{0}m ago', m);
  const h = Math.floor(m / 60);
  if (h < 24) return vscode.l10n.t('{0}h ago', h);
  const d = Math.floor(h / 24);
  if (d < 30) return vscode.l10n.t('{0}d ago', d);
  return new Date(iso).toLocaleDateString();
}

function escapeMarkdown(s: string): string {
  return s.replace(/([*_`<>[\]\\])/g, '\\$1');
}
