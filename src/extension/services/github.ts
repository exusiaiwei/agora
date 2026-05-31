import { graphql, type GraphqlResponseError } from '@octokit/graphql';
import type {
  Category,
  CommentNode,
  DiscussionDetail,
  DiscussionListPage,
  DiscussionSummary,
  Repository,
} from '../../shared/types';

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
      throw new Error('Not signed in.');
    }
    return this.client;
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
      bodyHTML: d.bodyHTML,
      bodyText: d.bodyText,
      viewerCanUpdate: d.viewerCanUpdate,
      viewerCanDelete: d.viewerCanDelete,
      viewerCanReact: d.viewerCanReact,
      comments,
    };
  }

  private async run<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const client = this.require();
    try {
      return await client<T>(query, variables);
    } catch (err) {
      const ge = err as GraphqlResponseError<unknown>;
      if (ge?.errors?.length) {
        throw new Error(ge.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }
  }
}

function mapCategory(c: RawCategory): Category {
  return {
    id: c.id,
    name: c.name,
    emoji: c.emoji,
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
    commentCount: d.comments.totalCount,
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
    bodyHTML: c.bodyHTML,
    bodyText: c.bodyText,
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
    replies: (c.replies?.nodes ?? []).map((r) => mapComment(r)),
    replyCount: c.replies?.totalCount ?? 0,
  };
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
  comments: { totalCount: number };
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
  bodyHTML: string;
  bodyText: string;
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
      bodyHTML: string;
      bodyText: string;
      viewerCanUpdate: boolean;
      viewerCanDelete: boolean;
      viewerCanReact: boolean;
      comments: { totalCount: number; nodes: RawComment[] };
    };
  };
}

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
    comments { totalCount }
    labels(first: 10) {
      nodes { id name color description }
    }
  }
`;

const COMMENT_FRAGMENT = /* GraphQL */ `
  fragment CommentFields on DiscussionComment {
    id
    databaseId
    bodyHTML
    bodyText
    createdAt
    updatedAt
    isAnswer
    upvoteCount
    viewerHasUpvoted
    viewerCanUpdate
    viewerCanDelete
    viewerCanMarkAsAnswer
    viewerCanUnmarkAsAnswer
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
        bodyHTML
        bodyText
        viewerCanUpdate
        viewerCanDelete
        viewerCanReact
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
