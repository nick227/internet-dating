# Schema Overview

This project uses Prisma with `prismaSchemaFolder` and a MySQL datasource. Models live in `backend/prisma/schema/*.prisma` and are combined at build time.

## Tables (Models)

- User: Auth core; owns profiles, posts, media, matches, conversations, messages, and safety records; soft delete via `deletedAt`.
- Profile: Public-facing profile fields + geo; links to avatar/hero media; soft delete via `deletedAt`.
- Post: User-authored content; visibility gated; soft delete via `deletedAt`.
- Media: Stored media assets with variants; visibility gated; soft delete via `deletedAt`.
- PostMedia: Join table between Post and Media with ordering.
- LikedPost: Per-user saves/likes of posts.
- Like: Swipe actions between users (like/pass) that drive matching.
- Match: Mutual match between users; drives Conversation.
- Conversation: One conversation per match; links to messages.
- Message: Chat message content; soft delete via `deletedAt`.
- MessageReceipt: Per-user read state for messages.
- Quiz: Quiz metadata (slug/title/isActive).
- QuizQuestion: Questions for a quiz.
- QuizOption: Options for a question.
- QuizResult: A user's answers and score vector for a quiz.
- ProfileRating: Per-user rating of a profile (4 factors).
- Top5List: Custom list headers for a profile.
- Top5Item: Ordered list items for a Top5List.
- UserBlock: Block relationship between users.
- UserReport: Reports between users.
- ProfileAccess: Request/grant access between owner and viewer for private content.

## Key Relationships

- User 1:1 Profile (`Profile.userId` is unique).
- User 1:N Posts, Media, LikesMade/LikesGot, Matches, Conversations, Messages, Receipts, Reports, Blocks.
- Post N:M Media via PostMedia (with order).
- Match 1:1 Conversation (Conversation.matchId unique).
- Conversation 1:N Messages; Message 1:N Receipts.
- Profile 1:N RatingsGiven/RatingsGot (ProfileRating references Profile by `userId`).
- Profile 1:N Top5Lists; Top5List 1:N Top5Items.
- ProfileAccess pairs `ownerUserId` + `viewerUserId` with a unique constraint and status.

## Lifecycle Flows

- Signup -> User created -> Profile created or updated (1:1); Profile links optional avatar/hero Media by id.
- Media upload -> Media row created (status PENDING) -> storage write -> Media marked READY; Media may be linked to Profile (avatar/hero) or Post via PostMedia.
- Post creation -> Post row created with visibility + optional PostMedia links; Post can be edited later, but cannot become empty if it has no media.
- Visibility + access: PUBLIC content is visible to all; PRIVATE content is visible to owner or to viewers with ProfileAccess status GRANTED.
- Access requests: Viewer creates ProfileAccess (PENDING) -> owner grants (GRANTED) or denies/revokes (DENIED/REVOKED).
- Swipe -> Like created (fromUserId, toUserId, action). Mutual likes create a Match row.
- Match -> Conversation created (1:1) and then Messages are appended; MessageReceipt rows track per-user read state.
- Quiz flow: Quiz -> Questions -> Options; QuizResult stores a user's answers and scoreVec.
- Ratings: ProfileRating is one row per rater/target pair; aggregates are derived from these rows.
- Safety: UserBlock and UserReport capture moderation actions; blocks should be enforced in matching, feed, and messaging queries.

## Index Highlights

- Feed/listing: Post has indexes on `(visibility, createdAt)` and `(userId, createdAt)`.
- Matching: Like has unique `(fromUserId, toUserId)` plus lookups by `toUserId` + action.
- Messaging: Message index `(conversationId, createdAt)` for history queries; Conversation indexes by user + updatedAt.
- Safety: UserReport index `(targetId, createdAt)` for moderation queues.
- Access: ProfileAccess indexed by owner/viewer + status + updatedAt.

## Assessment (Prioritized)

This is a solid, production-ready relational model. The main risks are key consistency, ordering invariants, and soft-delete leakage. Fix those early and you will avoid subtle bugs later.

Highest-priority fixes

- Profile foreign keys are inconsistent: ProfileRating -> Profile.userId, Top5List -> Profile.id. Pick one (recommend Profile.id) and standardize.
- Match ordering invariant: unique `(userAId, userBId)` only works if ordering is normalized. Enforce min/max at write time or add a reversed unique constraint.
- Soft delete filtering: high-volume reads must include `deletedAt IS NULL`. Add composite indexes such as `(visibility, deletedAt, createdAt)` and `(userId, deletedAt, createdAt)` where read traffic is heavy.

Medium-priority risks

- Media ownership ambiguity: `userId` vs `ownerUserId`. If uploader != owner, document clearly; if always same, remove one.
- Visibility mismatch: prevent PUBLIC Post -> PRIVATE Media unless access is granted. Enforce at the service layer.
- Conversation invariants: `Conversation.matchId`, `userAId`, `userBId` should always match the referenced Match row.

Index and query improvements

- UserBlock: add index on `(blockedId, createdAt)` for feed filtering.
- Conversation: index `(userAId, updatedAt)` and `(userBId, updatedAt)`.
- ProfileAccess: composite `(viewerUserId, status, updatedAt)` for inbox-style views.

Design decisions that are good

- 1:1 Match -> Conversation (clean mental model).
- MessageReceipt instead of read flags (correct for multi-device).
- Derived aggregates for ratings (avoids write amplification).
- Join table for ordered media (PostMedia) instead of array fields.

Optional follow-ups

- Add DB CHECK constraints where Prisma allows (status enums, ordering rules).
- Define hard-delete GC jobs for soft-deleted Users (orphan cleanup).
- Add schema doc comments explaining: Like -> Match creation rules and access + visibility resolution order.

## Design Notes and Optimization Opportunities

- Soft deletes are used on User/Profile/Post/Media/Message. Ensure all read paths consistently filter `deletedAt` and consider composite indexes including `deletedAt` where high-volume queries filter it (e.g., posts and media).
- Media has both `userId` and `ownerUserId`. If these are always identical, one can be removed; if not, document the distinction (uploader vs owner) to avoid confusion.
- ProfileRating references Profile by `userId` while Top5List references Profile by `id`. Mixed key usage can be a maintenance risk; consider standardizing on one key for profile relations.
- UserBlock only has a unique `(blockerId, blockedId)` constraint. If you frequently query by `blockedId` (e.g., to hide profiles), add an index on `blockedId` or `(blockedId, createdAt)`.
- Match uses `(userAId, userBId)` unique, which is ordered. If inserts can happen in either order, ensure code normalizes ordering or add a secondary unique constraint for the reversed pair.
- Post visibility and media visibility are separate; ensure application logic prevents public posts referencing private media unless access rules allow it.
- Conversations reference `userAId` and `userBId` separately from Match; verify invariants in code to avoid mismatches.

## Suggested Follow-ups for Review

- Audit indexes against actual query patterns (feed, profile, messages) once you have real traffic.
- Consider adding cascade delete policies (or background cleanup) for soft-deleted users to avoid long-term orphaned data.
