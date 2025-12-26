import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';

function orderedPair(a: bigint, b: bigint) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export const safetyDomain: DomainRegistry = {
  domain: 'safety',
  routes: [
    {
      id: 'safety.POST./users/:userId/block',
      method: 'POST',
      path: '/users/:userId/block',
      auth: Auth.user(),
      summary: 'Block user',
      tags: ['safety'],
      handler: async (req, res) => {
        const blockerId = req.ctx.userId!;
        const blockedParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!blockedParsed.ok) return json(res, { error: blockedParsed.error }, 400);
        const blockedId = blockedParsed.value;
        if (blockerId === blockedId) return json(res, { error: 'Cannot block yourself' }, 400);

        await prisma.userBlock.upsert({
          where: { blockerId_blockedId: { blockerId, blockedId } },
          update: {},
          create: { blockerId, blockedId }
        });

        // if a match exists between them, mark blocked
        const pair = orderedPair(blockerId, blockedId);
        await prisma.match.updateMany({
          where: { userAId: pair.userAId, userBId: pair.userBId },
          data: { state: 'BLOCKED', closedAt: new Date() }
        });

        return json(res, { ok: true });
      }
    },
    {
      id: 'safety.POST./users/:userId/report',
      method: 'POST',
      path: '/users/:userId/report',
      auth: Auth.user(),
      summary: 'Report user',
      tags: ['safety'],
      handler: async (req, res) => {
        const reporterId = req.ctx.userId!;
        const targetParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!targetParsed.ok) return json(res, { error: targetParsed.error }, 400);
        const targetId = targetParsed.value;
        const { reason, details } = (req.body ?? {}) as { reason?: string; details?: string };
        if (!reason) return json(res, { error: 'reason required' }, 400);

        await prisma.userReport.create({
          data: { reporterId, targetId, reason: reason as any, details: details ?? null }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
