import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/decorators.js';
import {
  CreateMessageDto,
  CreateTicketDto,
  ListTicketsQuery,
  UpdateTicketDto,
} from './dto.js';
import { TicketsService } from './tickets.service.js';

// Every route requires a session (global JwtAuthGuard). Who sees what is decided
// in the service via visibleTicketsWhere, so it cannot be bypassed by a new route.
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTicketsQuery) {
    return this.tickets.list(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.findOne(user, id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.tickets.addMessage(user, id, dto);
  }

  @Roles(Role.AGENT, Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.tickets.update(user, id, dto);
  }
}
