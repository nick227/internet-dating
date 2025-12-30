import type { FeedPostCandidate, FeedQuestionCandidate, FeedSuggestionCandidate, ViewerContext } from '../types.js';
import { getPostCandidates } from './posts.js';
import { getProfileSuggestions } from './profiles.js';
import { getQuestionCandidates } from './questions.js';

export type FeedCandidateResult = {
  posts: FeedPostCandidate[];
  suggestions: FeedSuggestionCandidate[];
  questions: FeedQuestionCandidate[];
  nextCursorId: bigint | null;
};

export async function getCandidates(ctx: ViewerContext): Promise<FeedCandidateResult> {
  const [postResult, suggestions, questions] = await Promise.all([
    getPostCandidates(ctx),
    getProfileSuggestions(ctx),
    getQuestionCandidates(ctx)
  ]);

  return {
    posts: postResult.items,
    suggestions,
    questions,
    nextCursorId: postResult.nextCursorId
  };
}
