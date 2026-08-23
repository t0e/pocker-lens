import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';

describe('Categories Endpoints (/categories)', () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  it('GET /categories lists system and user custom categories', async () => {
    const mockCategories = [
      {
        id: 'cat_food',
        userId: null,
        name: 'Food & Drink',
        type: 'EXPENSE',
        icon: 'utensils',
        isSystem: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cat_custom_coffee',
        userId: userA.id,
        name: 'Specialty Coffee',
        type: 'EXPENSE',
        icon: 'coffee',
        isSystem: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.spyOn(prisma.category, 'findMany').mockResolvedValue(mockCategories as any);

    const res = await app.inject({
      method: 'GET',
      url: '/categories',
      headers: { authorization: 'Bearer token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('Food & Drink');
    expect(body[0].isSystem).toBe(true);
    expect(body[1].name).toBe('Specialty Coffee');
    expect(body[1].userId).toBe(userA.id);
  });

  it('POST /categories creates a custom category for authenticated user', async () => {
    const mockCreated = {
      id: 'cat_custom_1',
      userId: userA.id,
      name: 'Board Games',
      type: 'EXPENSE',
      icon: 'dices',
      isSystem: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(prisma.category, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.category, 'create').mockResolvedValue(mockCreated as any);

    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Board Games',
        type: 'expense',
        icon: 'dices',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Board Games');
    expect(body.type).toBe('expense');
    expect(body.userId).toBe(userA.id);
    expect(body.isSystem).toBe(false);
  });

  it('POST /categories rejects duplicate custom category with 409', async () => {
    vi.spyOn(prisma.category, 'findFirst').mockResolvedValue({
      id: 'existing_cat',
      name: 'Board Games',
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Board Games',
        type: 'expense',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('already exists');
  });
});
