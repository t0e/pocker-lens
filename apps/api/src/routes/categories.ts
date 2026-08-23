import { FastifyPluginAsync } from 'fastify';
import { Category, CategoryType as PrismaCategoryType } from '@prisma/client';
import {
  createCategorySchema,
  CategoryResponse,
  CategoryType,
} from '@pocketlens/shared';
import { prisma } from '../db/client.js';

export function formatCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    type: category.type.toLowerCase() as CategoryType,
    icon: category.icon,
    isSystem: category.isSystem,
    isArchived: category.isArchived,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export const categoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /categories
  fastify.get('/categories', async (request, reply) => {
    const query = request.query as { type?: string };
    const userId = request.user.id;

    let typeFilter: PrismaCategoryType | undefined;
    if (query.type && (query.type === 'expense' || query.type === 'income')) {
      typeFilter = query.type.toUpperCase() as PrismaCategoryType;
    }

    const categories = await prisma.category.findMany({
      where: {
        AND: [
          {
            OR: [{ isSystem: true }, { userId }],
          },
          { isArchived: false },
          ...(typeFilter ? [{ type: typeFilter }] : []),
        ],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return reply.send(categories.map(formatCategoryResponse));
  });

  // POST /categories (Create user custom category)
  fastify.post('/categories', async (request, reply) => {
    const parseResult = createCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid category input',
        details: parseResult.error.format(),
      });
    }

    const { name, type, icon } = parseResult.data;
    const userId = request.user.id;

    // Check if duplicate custom category already exists for user
    const existing = await prisma.category.findFirst({
      where: {
        userId,
        name,
        type: type.toUpperCase() as PrismaCategoryType,
        isArchived: false,
      },
    });

    if (existing) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'A category with this name and type already exists',
      });
    }

    const category = await prisma.category.create({
      data: {
        userId,
        name,
        type: type.toUpperCase() as PrismaCategoryType,
        icon: icon || null,
        isSystem: false,
        isArchived: false,
      },
    });

    return reply.status(201).send(formatCategoryResponse(category));
  });
};
