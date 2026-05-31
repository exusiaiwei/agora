/**
 * Strings used inside the webview. The webview cannot call vscode.l10n.t
 * directly, so the extension host computes the localized values once and
 * sends them in the `context` event. The webview consumes them via a
 * React context.
 */
export interface WebviewStrings {
  refresh: string;
  loadingDiscussions: string;
  loadingDiscussion: string;
  noDiscussions: string;
  noRepoDetected: string;
  noRepoHint: string;
  failedToLoad: string;
  back: string;
  openInBrowser: string;
  markedAsAnswer: string;
  answer: string;
  locked: string;
  closed: string;
  answered: string;
  categories: string;
  all: string;
  commentCount: (n: number) => string;
  discussionCount: (n: number) => string;
}

/** A static snapshot delivered over the wire — no closures. */
export interface WebviewStringsDTO {
  refresh: string;
  loadingDiscussions: string;
  loadingDiscussion: string;
  noDiscussions: string;
  noRepoDetected: string;
  noRepoHint: string;
  failedToLoad: string;
  back: string;
  openInBrowser: string;
  markedAsAnswer: string;
  answer: string;
  locked: string;
  closed: string;
  answered: string;
  categories: string;
  all: string;
  commentSingular: string;
  commentPlural: string;
  discussionSingular: string;
  discussionPlural: string;
}

export function inflate(dto: WebviewStringsDTO): WebviewStrings {
  return {
    ...dto,
    commentCount: (n) => `${n} ${n === 1 ? dto.commentSingular : dto.commentPlural}`,
    discussionCount: (n) =>
      `${n} ${n === 1 ? dto.discussionSingular : dto.discussionPlural}`,
  };
}
