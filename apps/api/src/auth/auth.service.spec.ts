import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

// Unit tests: Prisma is replaced by a fake, so no database is needed and each case
// controls exactly what the "database" returns.
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: '',
    role: Role.CLIENT,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: { user: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({ secret: 'test-secret' }),
    );
  });

  describe('register', () => {
    it('stores a hash, never the plain password, and lowercases the email', async () => {
      prisma.user.create.mockImplementation(({ data }) => makeUser(data));

      const user = await service.register({
        email: 'Alice@Example.com',
        name: 'Alice',
        password: 'correct-horse',
      });

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('alice@example.com');
      expect(data.passwordHash).not.toContain('correct-horse');
      expect(await argon2.verify(data.passwordHash, 'correct-horse')).toBe(true);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('maps a duplicate email to 409 Conflict', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register({ email: 'a@b.co', name: 'Al', password: '12345678' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('validateCredentials', () => {
    it('returns the user when the password matches', async () => {
      const passwordHash = await argon2.hash('correct-horse');
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));

      const user = await service.validateCredentials({
        email: 'alice@example.com',
        password: 'correct-horse',
      });
      expect(user.email).toBe('alice@example.com');
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await argon2.hash('correct-horse');
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));

      await expect(
        service.validateCredentials({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error as a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateCredentials({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  it('signs a token that carries the user id and role', async () => {
    const token = await service.signToken({ id: 'u1', role: Role.AGENT });
    const payload = new JwtService({ secret: 'test-secret' }).verify(token);
    expect(payload).toMatchObject({ sub: 'u1', role: Role.AGENT });
  });
});
