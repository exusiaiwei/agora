import * as vscode from 'vscode';
import type { WebviewStringsDTO } from '../../shared/strings';

export function buildWebviewStrings(): WebviewStringsDTO {
  return {
    refresh: vscode.l10n.t('Refresh'),
    loadingDiscussions: vscode.l10n.t('Loading discussions…'),
    loadingDiscussion: vscode.l10n.t('Loading discussion…'),
    noDiscussions: vscode.l10n.t('No discussions yet.'),
    noRepoDetected: vscode.l10n.t('No GitHub repository detected'),
    noRepoHint: vscode.l10n.t(
      'Open a folder with a GitHub remote, or set agora.repository in Settings.',
    ),
    failedToLoad: vscode.l10n.t('Failed to load discussions'),
    back: vscode.l10n.t('Back'),
    openInBrowser: vscode.l10n.t('Open in browser'),
    markedAsAnswer: vscode.l10n.t('Marked as answer'),
    answer: vscode.l10n.t('Answer'),
    locked: vscode.l10n.t('Locked'),
    closed: vscode.l10n.t('Closed'),
    answered: vscode.l10n.t('Answered'),
    categories: vscode.l10n.t('Categories'),
    all: vscode.l10n.t('All'),
    commentSingular: vscode.l10n.t('comment'),
    commentPlural: vscode.l10n.t('comments'),
    discussionSingular: vscode.l10n.t('discussion'),
    discussionPlural: vscode.l10n.t('discussions'),
  };
}
