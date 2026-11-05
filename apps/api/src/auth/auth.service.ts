import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto, RegisterDto } from './dto.js';

/** User as sent to the client: never includes the password hash. */
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

// Hash of a random string, compared against when the email is unknown so that
// login takes the same time whether the account exists or not (no user enumeration).
const DUMMY_HASH = argon2.hash('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Public sign-up always creates a CLIENT. Agents and admins are promoted by an admin. */
  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await argon2.hash(dto.password); // argon2id, salt included in the hash
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash,
        },
      });
      return toPublicUser(user);
    } catch (e) {
      // P2002 = unique constraint violation: the email is already taken.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  /** Returns the user if the credentials match. Same error for unknown email and wrong password. */
  async validateCredentials(dto: LoginDto): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    const hash = user?.passwordHash ?? (await DUMMY_HASH);
    const valid = await argon2.verify(hash, dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return toPublicUser(user);
  }

  /** Signed JWT holding the user id (sub) and role. Signed, not encrypted: no secrets inside. */
  signToken(user: Pick<User, 'id' | 'role'>): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    return toPublicUser(user);
  }
}
