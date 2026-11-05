import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { PublicUser, toPublicUser } from '../auth/auth.service.js';
import { Roles } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

class UpdateRoleDto {
  @IsEnum(Role)
  role: Role;
}

/** User administration. Every route here is ADMIN only. */
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toPublicUser);
  }

  /**
   * Agents and admins, for the "assign to" menu. Open to agents too: the handler-level
   * @Roles overrides the class-level one (Reflector.getAllAndOverride checks the handler first).
   */
  @Roles(Role.AGENT, Role.ADMIN)
  @Get('staff')
  staff(): Promise<{ id: string; name: string; role: Role }[]> {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.AGENT, Role.ADMIN] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Promote a client to agent, or an agent to admin. */
  @Patch(':id/role')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { role: dto.role },
      });
      return toPublicUser(user);
    } catch (e) {
      // P2025 = record to update not found.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw e;
    }
  }
}
