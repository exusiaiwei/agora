import * as vscode from 'vscode';
import type { GitHubService } from '../services/github';
import type { AuthService } from '../services/auth';
import type { RepositoryDetector } from '../services/gitRemote';
import type { WebviewRequest } from '../../shared/messages';
import type { Repository } from '../../shared/types';

/**
 * The write-side RPC handlers shared between the panel and the sidebar
 * webview. Read-side (`listDiscussions` / `getDiscussion`) is left to
 * the callers because they differ — the sidebar forwards
 * `getDiscussion` to the panel rather than rendering a thread itself.
 */
export interface WriteRpcDeps {
  github: GitHubService;
  auth: AuthService;
  repoDetector: RepositoryDetector;
}

export async function dispatchWriteRpc(
  req: WebviewRequest,
  deps: WriteRpcDeps,
): Promise<unknown> {
  switch (req.kind) {
    case 'addDiscussion': {
      const repo = requireRepo(deps);
      const repositoryId = await deps.github.getRepositoryId(repo);
      return deps.github.addDiscussion({
        repositoryId,
        categoryId: req.categoryId,
        title: req.title,
        body: req.body,
      });
    }
    case 'updateDiscussion': {
      const { discussionId, title, body, categoryId } = req;
      await deps.github.updateDiscussion({ discussionId, title, body, categoryId });
      return { ok: true };
    }
    case 'deleteDiscussion': {
      await deps.github.deleteDiscussion(req.discussionId);
      return { ok: true };
    }
    case 'addComment': {
      return deps.github.addDiscussionComment({
        discussionId: req.discussionId,
        body: req.body,
        replyToId: req.replyToId,
      });
    }
    case 'updateComment': {
      return deps.github.updateDiscussionComment(req.commentId, req.body);
    }
    case 'deleteComment': {
      await deps.github.deleteDiscussionComment(req.commentId);
      return { ok: true };
    }
    case 'markAnswer': {
      await deps.github.markCommentAsAnswer(req.commentId);
      return { ok: true };
    }
    case 'unmarkAnswer': {
      await deps.github.unmarkCommentAsAnswer(req.commentId);
      return { ok: true };
    }
    case 'lockDiscussion': {
      await deps.github.lockDiscussion(req.discussionId);
      return { ok: true };
    }
    case 'unlockDiscussion': {
      await deps.github.unlockDiscussion(req.discussionId);
      return { ok: true };
    }
    case 'addReaction': {
      await deps.github.addReaction(req.subjectId, req.content);
      return { ok: true };
    }
    case 'removeReaction': {
      await deps.github.removeReaction(req.subjectId, req.content);
      return { ok: true };
    }
    default:
      throw new Error(`Unsupported write RPC: ${(req as { kind: string }).kind}`);
  }
}

function requireRepo(deps: WriteRpcDeps): Repository {
  const repo = deps.repoDetector.current;
  if (!repo) {
    throw new Error(
      vscode.l10n.t('Could not detect a GitHub repository in this workspace.'),
    );
  }
  return repo;
}

export function isWriteRpc(req: WebviewRequest): boolean {
  switch (req.kind) {
    case 'addDiscussion':
    case 'updateDiscussion':
    case 'deleteDiscussion':
    case 'addComment':
    case 'updateComment':
    case 'deleteComment':
    case 'markAnswer':
    case 'unmarkAnswer':
    case 'lockDiscussion':
    case 'unlockDiscussion':
    case 'addReaction':
    case 'removeReaction':
      return true;
    default:
      return false;
  }
}
