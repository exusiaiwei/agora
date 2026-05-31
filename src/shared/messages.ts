import type {
  DiscussionDetail,
  DiscussionListPage,
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
  | { kind: 'redetectRepo' };

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
  | { kind: 'navigate'; to: { view: 'list' } | { view: 'discussion'; number: number } }
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
