import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

/** What the JWT carries and what guards attach to request.user. */
export interface AuthUser {
  id: string;
  role: Role;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Opts a route out of the global authentication guard (e.g. login, register, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given roles. Checked by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user into a controller method: `me(@CurrentUser() user)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
