import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import {
  AuthUser,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from './decorators.js';
import { ACCESS_COOKIE } from './auth.constants.js';

/**
 * Registered globally: every route requires a valid session unless marked @Public().
 * "Secure by default": forgetting a decorator closes a route instead of opening it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(
        token,
      );
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      // Expired or tampered token: the signature check fails.
      throw new UnauthorizedException();
    }
  }
}

/** Runs after JwtAuthGuard: compares request.user.role with the route's @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
