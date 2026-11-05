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
