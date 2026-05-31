import type {
  HostEvent,
  HostMessage,
  WebviewRequest,
  HostRpcResult,
} from '@shared/messages';

interface VSCodeApi {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi: () => VSCodeApi;
  }
}

const vscode: VSCodeApi = window.acquireVsCodeApi();

let nextId = 1;
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();
const eventListeners = new Set<(event: HostEvent) => void>();

window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'rpc-response') {
    const handler = pending.get(msg.requestId);
    if (!handler) return;
    pending.delete(msg.requestId);
    if (msg.ok) handler.resolve(msg.result);
    else handler.reject(new Error(msg.error));
  } else if (msg.type === 'event') {
    eventListeners.forEach((fn) => fn(msg.event));
  }
});

export function rpc<R extends WebviewRequest>(request: R): Promise<HostRpcResult<R>> {
  const requestId = `r${nextId++}`;
  return new Promise<HostRpcResult<R>>((resolve, reject) => {
    pending.set(requestId, {
      resolve: (v) => resolve(v as HostRpcResult<R>),
      reject,
    });
    vscode.postMessage({ type: 'rpc', requestId, request });
  });
}

export function onHostEvent(fn: (event: HostEvent) => void): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

export const persisted = {
  get<T>(): T | undefined {
    return vscode.getState<T>();
  },
  set<T>(state: T): void {
    vscode.setState(state);
  },
};
