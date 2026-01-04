import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';

export const interestsDomain: DomainRegistry = {
  domain: 'interests',
  routes: [
    {
      id: 'interests.GET./interests/subjects',
      method: 'GET',
      path: '/interests/subjects',
      auth: Auth.public(),
      summary: 'List all interest subjects',
      tags: ['interests'],
      handler: async (_req, res) => {
        const subjects = await prisma.interestSubject.findMany({
          orderBy: { label: 'asc' },
          select: {
            id: true,
            key: true,
            label: true,
          }
        });
        return json(res, { subjects });
      }
    },
    {
      id: 'interests.GET./interests',
      method: 'GET',
      path: '/interests',
      auth: Auth.public(),
      summary: 'List interests with pagination',
      tags: ['interests'],
      handler: async (req, res) => {
        const userId = req.ctx?.userId;
        const { subjectId, q, cursorId, take = '20' } = req.query as {
          subjectId?: string;
          q?: string;
          cursorId?: string;
          take?: string;
        };

        const takeNum = Math.min(parseInt(take, 10) || 20, 50);
        const cursor = cursorId ? { id: BigInt(cursorId) } : undefined;

        const where: any = {};
        if (subjectId) {
          where.subjectId = BigInt(subjectId);
        }
        if (q) {
          where.OR = [
            { label: { contains: q } },
            { key: { contains: q } }
          ];
        }

        const interests = await prisma.interest.findMany({
          where,
          take: takeNum + 1,
          cursor,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            key: true,
            label: true,
            subjectId: true,
            subject: {
              select: {
                id: true,
                key: true,
                label: true,
              }
            }
          }
        });

        const hasMore = interests.length > takeNum;
        const items = hasMore ? interests.slice(0, takeNum) : interests;
        const nextCursor = hasMore ? items[items.length - 1].id.toString() : null;

        // If user is logged in, get their selected interests
        let userInterestIds = new Set<bigint>();
        if (userId) {
          const userInterests = await prisma.userInterest.findMany({
            where: { userId: BigInt(userId) },
            select: { interestId: true }
          });
          userInterestIds = new Set(userInterests.map(ui => ui.interestId));
        }

        const itemsWithSelected = items.map(item => ({
          ...item,
          id: item.id.toString(),
          subjectId: item.subjectId.toString(),
          subject: {
            ...item.subject,
            id: item.subject.id.toString(),
          },
          selected: userInterestIds.has(item.id),
        }));

        return json(res, {
          items: itemsWithSelected,
          nextCursor,
          hasMore,
        });
      }
    },
    {
      id: 'interests.GET./interests/my',
      method: 'GET',
      path: '/interests/my',
      auth: Auth.user(),
      summary: 'Get user\'s selected interests',
      tags: ['interests'],
      handler: async (req, res) => {
        const userId = BigInt(req.ctx!.userId!);
        
        const userInterests = await prisma.userInterest.findMany({
          where: { userId },
          select: {
            interestId: true,
            interest: {
              select: {
                id: true,
                key: true,
                label: true,
                subjectId: true,
                subject: {
                  select: {
                    id: true,
                    key: true,
                    label: true,
                  }
                }
              }
            },
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' }
        });

        const items = userInterests.map(ui => ({
          id: ui.interest.id.toString(),
          key: ui.interest.key,
          label: ui.interest.label,
          subjectId: ui.interest.subjectId.toString(),
          subject: {
            id: ui.interest.subject.id.toString(),
            key: ui.interest.subject.key,
            label: ui.interest.subject.label,
          },
          selected: true,
          createdAt: ui.createdAt.toISOString(),
        }));

        return json(res, { items });
      }
    },
    {
      id: 'interests.POST./interests/:interestId/select',
      method: 'POST',
      path: '/interests/:interestId/select',
      auth: Auth.user(),
      summary: 'Add interest to user',
      tags: ['interests'],
      handler: async (req, res) => {
        const userId = BigInt(req.ctx!.userId!);
        const interestIdParsed = parsePositiveBigInt(req.params.interestId);
        if (!interestIdParsed.ok) {
          return json(res, { error: interestIdParsed.error }, 400);
        }
        const interestId = interestIdParsed.value;

        // Get interest to find subjectId
        const interest = await prisma.interest.findUnique({
          where: { id: interestId },
          select: { subjectId: true }
        });

        if (!interest) {
          return json(res, { error: 'Interest not found' }, 404);
        }

        // Upsert user interest
        const userInterest = await prisma.userInterest.upsert({
          where: {
            userId_subjectId_interestId: {
              userId,
              subjectId: interest.subjectId,
              interestId,
            }
          },
          create: {
            userId,
            subjectId: interest.subjectId,
            interestId,
          },
          update: {},
          select: {
            interest: {
              select: {
                id: true,
                key: true,
                label: true,
                subjectId: true,
                subject: {
                  select: {
                    id: true,
                    key: true,
                    label: true,
                  }
                }
              }
            }
          }
        });

        // Mark interest as dirty for relationship recalculation
        await prisma.interestDirty.upsert({
          where: { interestId },
          create: { interestId },
          update: { touchedAt: new Date() }
        }).catch(() => null); // Ignore errors

        const result = {
          id: userInterest.interest.id.toString(),
          key: userInterest.interest.key,
          label: userInterest.interest.label,
          subjectId: userInterest.interest.subjectId.toString(),
          subject: {
            id: userInterest.interest.subject.id.toString(),
            key: userInterest.interest.subject.key,
            label: userInterest.interest.subject.label,
          },
          selected: true,
        };

        return json(res, result);
      }
    },
    {
      id: 'interests.DELETE./interests/:interestId/select',
      method: 'DELETE',
      path: '/interests/:interestId/select',
      auth: Auth.user(),
      summary: 'Remove interest from user',
      tags: ['interests'],
      handler: async (req, res) => {
        const userId = BigInt(req.ctx!.userId!);
        const interestIdParsed = parsePositiveBigInt(req.params.interestId);
        if (!interestIdParsed.ok) {
          return json(res, { error: interestIdParsed.error }, 400);
        }
        const interestId = interestIdParsed.value;

        // Get interest to find subjectId
        const interest = await prisma.interest.findUnique({
          where: { id: interestId },
          select: { subjectId: true }
        });

        if (!interest) {
          return json(res, { error: 'Interest not found' }, 404);
        }

        await prisma.userInterest.deleteMany({
          where: {
            userId,
            subjectId: interest.subjectId,
            interestId,
          }
        });

        // Mark interest as dirty for relationship recalculation
        await prisma.interestDirty.upsert({
          where: { interestId },
          create: { interestId },
          update: { touchedAt: new Date() }
        }).catch(() => null); // Ignore errors

        return json(res, { ok: true });
      }
    },
    {
      id: 'interests.POST./interests/search',
      method: 'POST',
      path: '/interests/search',
      auth: Auth.user(),
      summary: 'Search interests from text',
      tags: ['interests'],
      handler: async (req, res) => {
        const { text, subjectId } = req.body as { text?: string; subjectId?: string };
        
        if (!text || !text.trim()) {
          return json(res, { error: 'Text is required' }, 400);
        }

        const searchText = text.trim().toLowerCase();
        const where: any = {
          OR: [
            { key: { contains: searchText } },
            { label: { contains: searchText } }
          ]
        };

        if (subjectId) {
          where.subjectId = BigInt(subjectId);
        }

        // Search for existing interests
        const existing = await prisma.interest.findMany({
          where,
          take: 10,
          select: {
            id: true,
            key: true,
            label: true,
            subjectId: true,
            subject: {
              select: {
                id: true,
                key: true,
                label: true,
              }
            }
          }
        });

        const results = existing.map(item => ({
          id: item.id.toString(),
          key: item.key,
          label: item.label,
          subjectId: item.subjectId.toString(),
          subject: {
            id: item.subject.id.toString(),
            key: item.subject.key,
            label: item.subject.label,
          },
          selected: false,
        }));

        return json(res, { items: results });
      }
    },
  ],
};
