import * as vscode from 'vscode';
import { graphql, type GraphqlResponseError } from '@octokit/graphql';
import type {
  Category,
  CommentNode,
  DiscussionDetail,
  DiscussionListPage,
  DiscussionSummary,
  ReactionContent,
  ReactionGroup,
  Repository,
  ViewerInfo,
} from '../../shared/types';

// Re-export so callers that already import from this service can keep
// doing so. The single source of truth lives in shared/types.
export type { ReactionContent };

type GraphqlFn = ReturnType<typeof graphql.defaults>;

export class GitHubService {
  private client: GraphqlFn | null = null;
  private token: string | null = null;

  setToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    this.client = token
      ? graphql.defaults({
          headers: {
            authorization: `bearer ${token}`,
            'user-agent': 'agora-vscode',
          },
        })
      : null;
  }

  private require(): GraphqlFn {
    if (!this.client) {
      throw new Error(vscode.l10n.t('Not signed in.'));
    }
    return this.client;
  }

  async getViewer(): Promise<ViewerInfo> {
    const data = await this.run<{ viewer: { login: string; avatarUrl: string; name: string | null } }>(
      VIEWER_QUERY,
      {},
    );
    return {
      login: data.viewer.login,
      avatarUrl: data.viewer.avatarUrl,
      name: data.viewer.name,
    };
  }

  async listCategories(repo: Repository): Promise<Category[]> {
    const data = await this.run<{ repository: { discussionCategories: { nodes: RawCategory[] } } }>(
      LIST_CATEGORIES_QUERY,
      { owner: repo.owner, name: repo.name },
    );
    return data.repository.discussionCategories.nodes.map(mapCategory);
  }

  async getRepositoryId(repo: Repository): Promise<string> {
    const data = await this.run<{ repository: { id: string } }>(REPO_ID_QUERY, {
      owner: repo.owner,
      name: repo.name,
    });
    return data.repository.id;
  }

  async listDiscussions(
    repo: Repository,
    options: { categoryId: string | null; cursor: string | null; first: number },
  ): Promise<DiscussionListPage> {
    const data = await this.run<ListDiscussionsResponse>(LIST_DISCUSSIONS_QUERY, {
      owner: repo.owner,
      name: repo.name,
      first: options.first,
      after: options.cursor,
      categoryId: options.categoryId,
    });

    const categories = data.repository.discussionCategories.nodes.map(mapCategory);
    return {
      repository: repo,
      categories,
      nodes: data.repository.discussions.nodes.map((n) => mapSummary(n)),
      endCursor: data.repository.discussions.pageInfo.endCursor,
      hasNextPage: data.repository.discussions.pageInfo.hasNextPage,
      totalCount: data.repository.discussions.totalCount,
    };
  }

  async getDiscussion(repo: Repository, number: number): Promise<DiscussionDetail> {
    const data = await this.run<GetDiscussionResponse>(GET_DISCUSSION_QUERY, {
      owner: repo.owner,
      name: repo.name,
      number,
    });
    const d = data.repository.discussion;
    const comments = d.comments.nodes.map((c) => mapComment(c));
    return {
      ...mapSummary(d),
      body: d.body,
      bodyHTML: d.bodyHTML,
      viewerCanUpdate: d.viewerCanUpdate,
      viewerCanDelete: d.viewerCanDelete,
      viewerCanReact: d.viewerCanReact,
      reactionGroups: mapReactionGroups(d.reactionGroups),
      comments,
    };
  }

  // ─── Mutations ────────────────────────────────────────────────────

  async addDiscussion(args: {
    repositoryId: string;
    categoryId: string;
    title: string;
    body: string;
  }): Promise<{ number: number; url: string }> {
    const data = await this.run<{ createDiscussion: { discussion: { number: number; url: string } } }>(
      ADD_DISCUSSION_MUTATION,
      { input: args },
    );
    return data.createDiscussion.discussion;
  }

  async updateDiscussion(args: {
    discussionId: string;
    title?: string;
    body?: string;
    categoryId?: string;
  }): Promise<void> {
    await this.run(UPDATE_DISCUSSION_MUTATION, { input: args });
  }

  async deleteDiscussion(discussionId: string): Promise<void> {
    await this.run(DELETE_DISCUSSION_MUTATION, { input: { id: discussionId } });
  }

  async addDiscussionComment(args: {
    discussionId: string;
    body: string;
    replyToId?: string;
  }): Promise<CommentNode> {
    const data = await this.run<{ addDiscussionComment: { comment: RawComment } }>(
      ADD_COMMENT_MUTATION,
      { input: args },
    );
    return mapComment(data.addDiscussionComment.comment);
  }

  async updateDiscussionComment(commentId: string, body: string): Promise<CommentNode> {
    const data = await this.run<{ updateDiscussionComment: { comment: RawComment } }>(
      UPDATE_COMMENT_MUTATION,
      { input: { commentId, body } },
    );
    return mapComment(data.updateDiscussionComment.comment);
  }

  async deleteDiscussionComment(commentId: string): Promise<void> {
    await this.run(DELETE_COMMENT_MUTATION, { input: { id: commentId } });
  }

  async markCommentAsAnswer(commentId: string): Promise<void> {
    await this.run(MARK_ANSWER_MUTATION, { input: { id: commentId } });
  }

  async unmarkCommentAsAnswer(commentId: string): Promise<void> {
    await this.run(UNMARK_ANSWER_MUTATION, { input: { id: commentId } });
  }

  async lockDiscussion(discussionId: string): Promise<void> {
    await this.run(LOCK_MUTATION, { input: { lockableId: discussionId } });
  }

  async unlockDiscussion(discussionId: string): Promise<void> {
    await this.run(UNLOCK_MUTATION, { input: { lockableId: discussionId } });
  }

  async pinDiscussion(discussionId: string): Promise<void> {
    await this.run(PIN_DISCUSSION_MUTATION, { input: { discussionId } });
  }

  async unpinDiscussion(pinnedDiscussionId: string): Promise<void> {
    await this.run(UNPIN_DISCUSSION_MUTATION, { input: { id: pinnedDiscussionId } });
  }

  async addReaction(subjectId: string, content: ReactionContent): Promise<void> {
    await this.run(ADD_REACTION_MUTATION, { input: { subjectId, content } });
  }

  async removeReaction(subjectId: string, content: ReactionContent): Promise<void> {
    await this.run(REMOVE_REACTION_MUTATION, { input: { subjectId, content } });
  }

  private async run<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const client = this.require();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      return await client<T>(query, {
        ...variables,
        request: { signal: controller.signal },
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          vscode.l10n.t('Request timed out. Check your network connection and proxy settings.'),
        );
      }
      throw this.translateError(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private translateError(err: unknown): Error {
    const ge = err as GraphqlResponseError<unknown> & { status?: number };

    if (ge?.errors?.length) {
      const messages = ge.errors.map((e) => e.message);
      const couldNotResolve = messages.find((m) => /Could not resolve to a Repository/i.test(m));
      if (couldNotResolve) {
        const match = couldNotResolve.match(/'([^']+)'/);
        const name = match?.[1] ?? '';
        return new Error(
          vscode.l10n.t(
            "Cannot access '{0}'. The repository may not exist, be private without sufficient token scope, or have Discussions disabled.",
            name,
          ),
        );
      }
      const notFound = messages.find((m) => /not found|does not exist/i.test(m));
      if (notFound) {
        return new Error(vscode.l10n.t('Repository or discussion not found (404).'));
      }
      return new Error(messages.join('; '));
    }

    const status = ge?.status ?? (err as { status?: number } | null)?.status;
    if (status === 401) {
      return new Error(vscode.l10n.t('Authentication required (401). Please sign in again.'));
    }
    if (status === 403) {
      return new Error(
        vscode.l10n.t('Permission denied (403). The token may lack the required scopes.'),
      );
    }
    if (status === 404) {
      return new Error(vscode.l10n.t('Repository or discussion not found (404).'));
    }

    return err instanceof Error ? err : new Error(String(err));
  }
}

function emojiFromCategory(c: RawCategory): string {
  // GitHub returns shortcodes like ":bulb:" in `emoji` and a small HTML
  // wrapper around the actual Unicode codepoint in `emojiHTML`
  // (`<div><g-emoji ...>💡</g-emoji></div>`). Strip tags to recover the
  // codepoint; fall back to the shortcode if anything looks empty.
  const stripped = (c.emojiHTML ?? '').replace(/<[^>]*>/g, '').trim();
  return stripped || c.emoji;
}

function mapCategory(c: RawCategory): Category {
  return {
    id: c.id,
    name: c.name,
    emoji: emojiFromCategory(c),
    emojiHTML: c.emojiHTML,
    description: c.description,
    isAnswerable: c.isAnswerable,
  };
}

function mapSummary(d: RawDiscussionSummary): DiscussionSummary {
  return {
    id: d.id,
    number: d.number,
    title: d.title,
    url: d.url,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    author: d.author
      ? { login: d.author.login, avatarUrl: d.author.avatarUrl, url: d.author.url }
      : null,
    category: mapCategory(d.category),
    commentCount: d.commentTotal.totalCount,
    upvoteCount: d.upvoteCount,
    viewerHasUpvoted: d.viewerHasUpvoted,
    locked: d.locked,
    closed: d.closed,
    answered: !!d.answer || !!d.answerChosenAt,
    labels: (d.labels?.nodes ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      description: l.description,
    })),
  };
}

function mapComment(c: RawComment): CommentNode {
  return {
    id: c.id,
    databaseId: c.databaseId,
    body: c.body,
    bodyHTML: c.bodyHTML,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: c.author
      ? { login: c.author.login, avatarUrl: c.author.avatarUrl, url: c.author.url }
      : null,
    isAnswer: c.isAnswer,
    upvoteCount: c.upvoteCount,
    viewerHasUpvoted: c.viewerHasUpvoted,
    viewerCanUpdate: c.viewerCanUpdate,
    viewerCanDelete: c.viewerCanDelete,
    viewerCanMarkAsAnswer: c.viewerCanMarkAsAnswer,
    viewerCanUnmarkAsAnswer: c.viewerCanUnmarkAsAnswer,
    viewerCanReact: c.viewerCanReact,
    reactionGroups: mapReactionGroups(c.reactionGroups),
    replies: (c.replies?.nodes ?? []).map((r) => mapComment(r)),
    replyCount: c.replies?.totalCount ?? 0,
  };
}

function mapReactionGroups(raw: RawReactionGroup[] | undefined): ReactionGroup[] {
  if (!raw) return [];
  return raw.map((g) => ({
    content: g.content,
    viewerHasReacted: g.viewerHasReacted,
    count: g.reactors?.totalCount ?? 0,
  }));
}

interface RawReactionGroup {
  content: ReactionContent;
  viewerHasReacted: boolean;
  reactors?: { totalCount: number };
}

interface RawAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

interface RawCategory {
  id: string;
  name: string;
  emoji: string;
  emojiHTML: string;
  description: string | null;
  isAnswerable: boolean;
}

interface RawLabel {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface RawDiscussionSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: RawAuthor | null;
  category: RawCategory;
  commentTotal: { totalCount: number };
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  locked: boolean;
  closed: boolean;
  answer?: { id: string } | null;
  answerChosenAt?: string | null;
  labels?: { nodes: RawLabel[] };
}

interface RawComment {
  id: string;
  databaseId: number | null;
  body: string;
  bodyHTML: string;
  viewerCanReact: boolean;
  reactionGroups?: RawReactionGroup[];
  createdAt: string;
  updatedAt: string;
  author: RawAuthor | null;
  isAnswer: boolean;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  viewerCanMarkAsAnswer: boolean;
  viewerCanUnmarkAsAnswer: boolean;
  replies?: { totalCount: number; nodes: RawComment[] };
}

interface ListDiscussionsResponse {
  repository: {
    discussionCategories: { nodes: RawCategory[] };
    discussions: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      nodes: RawDiscussionSummary[];
    };
  };
}

interface GetDiscussionResponse {
  repository: {
    discussion: RawDiscussionSummary & {
      body: string;
      bodyHTML: string;
      viewerCanUpdate: boolean;
      viewerCanDelete: boolean;
      viewerCanReact: boolean;
      reactionGroups?: RawReactionGroup[];
      comments: { totalCount: number; nodes: RawComment[] };
    };
  };
}

const VIEWER_QUERY = /* GraphQL */ `
  query AgoraViewer {
    viewer {
      login
      avatarUrl
      name
    }
  }
`;

const LIST_CATEGORIES_QUERY = /* GraphQL */ `
  query AgoraListCategories($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      discussionCategories(first: 25) {
        nodes {
          id
          name
          emoji
          emojiHTML
          description
          isAnswerable
        }
      }
    }
  }
`;

const DISCUSSION_SUMMARY_FRAGMENT = /* GraphQL */ `
  fragment DiscussionSummary on Discussion {
    id
    number
    title
    url
    createdAt
    updatedAt
    locked
    closed
    upvoteCount
    viewerHasUpvoted
    answerChosenAt
    answer { id }
    author { login avatarUrl url }
    category {
      id
      name
      emoji
      emojiHTML
      description
      isAnswerable
    }
    commentTotal: comments { totalCount }
    labels(first: 10) {
      nodes { id name color description }
    }
  }
`;

const COMMENT_FRAGMENT = /* GraphQL */ `
  fragment CommentFields on DiscussionComment {
    id
    databaseId
    body
    bodyHTML
    createdAt
    updatedAt
    isAnswer
    upvoteCount
    viewerHasUpvoted
    viewerCanUpdate
    viewerCanDelete
    viewerCanMarkAsAnswer
    viewerCanUnmarkAsAnswer
    viewerCanReact
    reactionGroups {
      content
      viewerHasReacted
      reactors { totalCount }
    }
    author { login avatarUrl url }
  }
`;

const LIST_DISCUSSIONS_QUERY = /* GraphQL */ `
  query AgoraListDiscussions(
    $owner: String!
    $name: String!
    $first: Int!
    $after: String
    $categoryId: ID
  ) {
    repository(owner: $owner, name: $name) {
      discussionCategories(first: 25) {
        nodes {
          id
          name
          emoji
          emojiHTML
          description
          isAnswerable
        }
      }
      discussions(
        first: $first
        after: $after
        categoryId: $categoryId
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes { ...DiscussionSummary }
      }
    }
  }
  ${DISCUSSION_SUMMARY_FRAGMENT}
`;

const GET_DISCUSSION_QUERY = /* GraphQL */ `
  query AgoraGetDiscussion($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      discussion(number: $number) {
        ...DiscussionSummary
        body
        bodyHTML
        viewerCanUpdate
        viewerCanDelete
        viewerCanReact
        reactionGroups {
          content
          viewerHasReacted
          reactors { totalCount }
        }
        comments(first: 50) {
          totalCount
          nodes {
            ...CommentFields
            replies(first: 50) {
              totalCount
              nodes { ...CommentFields }
            }
          }
        }
      }
    }
  }
  ${DISCUSSION_SUMMARY_FRAGMENT}
  ${COMMENT_FRAGMENT}
`;

// ─── Mutations ───────────────────────────────────────────────────────

const REPO_ID_QUERY = /* GraphQL */ `
  query AgoraRepoId($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { id }
  }
`;

const ADD_DISCUSSION_MUTATION = /* GraphQL */ `
  mutation AgoraAddDiscussion($input: CreateDiscussionInput!) {
    createDiscussion(input: $input) {
      discussion { number url }
    }
  }
`;

const UPDATE_DISCUSSION_MUTATION = /* GraphQL */ `
  mutation AgoraUpdateDiscussion($input: UpdateDiscussionInput!) {
    updateDiscussion(input: $input) {
      discussion { id }
    }
  }
`;

const DELETE_DISCUSSION_MUTATION = /* GraphQL */ `
  mutation AgoraDeleteDiscussion($input: DeleteDiscussionInput!) {
    deleteDiscussion(input: $input) {
      discussion { id }
    }
  }
`;

const ADD_COMMENT_MUTATION = /* GraphQL */ `
  mutation AgoraAddComment($input: AddDiscussionCommentInput!) {
    addDiscussionComment(input: $input) {
      comment { ...CommentFields replies(first: 50) { totalCount nodes { ...CommentFields } } }
    }
  }
  ${COMMENT_FRAGMENT}
`;

const UPDATE_COMMENT_MUTATION = /* GraphQL */ `
  mutation AgoraUpdateComment($input: UpdateDiscussionCommentInput!) {
    updateDiscussionComment(input: $input) {
      comment { ...CommentFields replies(first: 50) { totalCount nodes { ...CommentFields } } }
    }
  }
  ${COMMENT_FRAGMENT}
`;

const DELETE_COMMENT_MUTATION = /* GraphQL */ `
  mutation AgoraDeleteComment($input: DeleteDiscussionCommentInput!) {
    deleteDiscussionComment(input: $input) {
      comment { id }
    }
  }
`;

const MARK_ANSWER_MUTATION = /* GraphQL */ `
  mutation AgoraMarkAnswer($input: MarkDiscussionCommentAsAnswerInput!) {
    markDiscussionCommentAsAnswer(input: $input) {
      discussion { id }
    }
  }
`;

const UNMARK_ANSWER_MUTATION = /* GraphQL */ `
  mutation AgoraUnmarkAnswer($input: UnmarkDiscussionCommentAsAnswerInput!) {
    unmarkDiscussionCommentAsAnswer(input: $input) {
      discussion { id }
    }
  }
`;

const LOCK_MUTATION = /* GraphQL */ `
  mutation AgoraLock($input: LockLockableInput!) {
    lockLockable(input: $input) { lockedRecord { __typename } }
  }
`;

const UNLOCK_MUTATION = /* GraphQL */ `
  mutation AgoraUnlock($input: UnlockLockableInput!) {
    unlockLockable(input: $input) { unlockedRecord { __typename } }
  }
`;

const PIN_DISCUSSION_MUTATION = /* GraphQL */ `
  mutation AgoraPin($input: PinDiscussionInput!) {
    pinDiscussion(input: $input) { pinnedDiscussion { id } }
  }
`;

const UNPIN_DISCUSSION_MUTATION = /* GraphQL */ `
  mutation AgoraUnpin($input: UnpinDiscussionInput!) {
    unpinDiscussion(input: $input) { pinnedDiscussion { id } }
  }
`;

const ADD_REACTION_MUTATION = /* GraphQL */ `
  mutation AgoraAddReaction($input: AddReactionInput!) {
    addReaction(input: $input) { reaction { content } }
  }
`;

const REMOVE_REACTION_MUTATION = /* GraphQL */ `
  mutation AgoraRemoveReaction($input: RemoveReactionInput!) {
    removeReaction(input: $input) { reaction { content } }
  }
`;
