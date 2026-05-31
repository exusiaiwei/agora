import type {
  CommentNode,
  DiscussionDetail,
  DiscussionListPage,
  ReactionContent,
  Repository,
  ViewerInfo,
} from './types';
import type { WebviewStringsDTO } from './strings';

/**
 * Messages from the webview → extension host.
 * Each request has a matching response keyed by `requestId`.
 */
export type WebviewRequest =
  | { kind: 'ready' }
  | { kind: 'listDiscussions'; categoryId: string | null; cursor: string | null }
  | { kind: 'getDiscussion'; number: number }
  | { kind: 'openInBrowser'; url: string }
  | { kind: 'signIn' }
  | { kind: 'redetectRepo' }
  | { kind: 'openCompose' }
  // ── Writes ─────────────────────────────────────────────────
  | { kind: 'addDiscussion'; categoryId: string; title: string; body: string }
  | { kind: 'updateDiscussion'; discussionId: string; title?: string; body?: string; categoryId?: string }
  | { kind: 'deleteDiscussion'; discussionId: string }
  | { kind: 'addComment'; discussionId: string; body: string; replyToId?: string }
  | { kind: 'updateComment'; commentId: string; body: string }
  | { kind: 'deleteComment'; commentId: string }
  | { kind: 'markAnswer'; commentId: string }
  | { kind: 'unmarkAnswer'; commentId: string }
  | { kind: 'lockDiscussion'; discussionId: string }
  | { kind: 'unlockDiscussion'; discussionId: string }
  | { kind: 'addReaction'; subjectId: string; content: ReactionContent }
  | { kind: 'removeReaction'; subjectId: string; content: ReactionContent };

export interface WebviewRpcMessage {
  type: 'rpc';
  requestId: string;
  request: WebviewRequest;
}

/** Messages from the extension host → webview. */
export type HostEvent =
  | {
      kind: 'context';
      repo: Repository | null;
      viewer: ViewerInfo | null;
      locale: string;
      strings: WebviewStringsDTO;
    }
  | {
      kind: 'navigate';
      to:
        | { view: 'list' }
        | { view: 'discussion'; number: number }
        | { view: 'compose' };
    }
  | { kind: 'refresh' };

export interface HostEventMessage {
  type: 'event';
  event: HostEvent;
}

export type HostRpcResult<R extends WebviewRequest> =
  R extends { kind: 'listDiscussions' } ? DiscussionListPage :
  R extends { kind: 'getDiscussion' } ? DiscussionDetail :
  R extends { kind: 'ready' } ? { ok: true } :
  R extends { kind: 'openInBrowser' } ? { ok: true } :
  R extends { kind: 'signIn' } ? { ok: true } :
  R extends { kind: 'redetectRepo' } ? { ok: true } :
  R extends { kind: 'openCompose' } ? { ok: true } :
  R extends { kind: 'addDiscussion' } ? { number: number; url: string } :
  R extends { kind: 'updateDiscussion' } ? { ok: true } :
  R extends { kind: 'deleteDiscussion' } ? { ok: true } :
  R extends { kind: 'addComment' } ? CommentNode :
  R extends { kind: 'updateComment' } ? CommentNode :
  R extends { kind: 'deleteComment' } ? { ok: true } :
  R extends { kind: 'markAnswer' } ? { ok: true } :
  R extends { kind: 'unmarkAnswer' } ? { ok: true } :
  R extends { kind: 'lockDiscussion' } ? { ok: true } :
  R extends { kind: 'unlockDiscussion' } ? { ok: true } :
  R extends { kind: 'addReaction' } ? { ok: true } :
  R extends { kind: 'removeReaction' } ? { ok: true } :
  never;

export interface HostRpcResponseSuccess {
  type: 'rpc-response';
  requestId: string;
  ok: true;
  result: unknown;
}

export interface HostRpcResponseError {
  type: 'rpc-response';
  requestId: string;
  ok: false;
  error: string;
}

export type HostRpcResponse = HostRpcResponseSuccess | HostRpcResponseError;

export type HostMessage = HostEventMessage | HostRpcResponse;
