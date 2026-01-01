import { prisma } from '../../../../lib/prisma/client.js';

type CommentPreview = { id: bigint; text: string };

export async function buildPostCommentPreviews(postIds: bigint[], limit = 2) {
  const previewByPostId = new Map<bigint, { preview: CommentPreview[] }>();
  if (!postIds.length) return previewByPostId;

  await Promise.all(
    postIds.map(async (postId) => {
      const comments = await prisma.comment.findMany({
        where: {
          targetKind: 'POST',
          targetId: postId,
          status: 'ACTIVE',
          parentId: null
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, body: true }
      });
      previewByPostId.set(postId, {
        preview: comments.map((comment) => ({ id: comment.id, text: comment.body }))
      });
    })
  );

  return previewByPostId;
}
