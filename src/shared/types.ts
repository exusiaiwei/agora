export interface Repository {
  owner: string;
  name: string;
}

export interface Actor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  emojiHTML: string;
  description: string | null;
  isAnswerable: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

export type DiscussionState = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface DiscussionSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: Actor | null;
  category: Category;
  commentCount: number;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  locked: boolean;
  closed: boolean;
  answered: boolean;
  labels: Label[];
}

export interface CommentNode {
  id: string;
  databaseId: number | null;
  /** Raw Markdown source (server-canonical). Use for rendering and as
   *  the seed value when opening the comment in an edit Composer. */
  body: string;
  /** GitHub-rendered HTML — kept around as a reference but the
   *  webview renders Markdown locally for sandboxing + styling. */
  bodyHTML: string;
  createdAt: string;
  updatedAt: string;
  author: Actor | null;
  isAnswer: boolean;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  viewerCanMarkAsAnswer: boolean;
  viewerCanUnmarkAsAnswer: boolean;
  viewerCanReact: boolean;
  reactionGroups: ReactionGroup[];
  replies: CommentNode[];
  replyCount: number;
}

export type ReactionContent =
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'LAUGH'
  | 'HOORAY'
  | 'CONFUSED'
  | 'HEART'
  | 'ROCKET'
  | 'EYES';

export interface ReactionGroup {
  content: ReactionContent;
  viewerHasReacted: boolean;
  count: number;
}

export interface DiscussionDetail extends DiscussionSummary {
  body: string;
  bodyHTML: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  viewerCanReact: boolean;
  reactionGroups: ReactionGroup[];
  comments: CommentNode[];
}

export interface DiscussionListPage {
  repository: Repository;
  categories: Category[];
  nodes: DiscussionSummary[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number;
}

export interface ViewerInfo {
  login: string;
  avatarUrl: string;
  name: string | null;
}
