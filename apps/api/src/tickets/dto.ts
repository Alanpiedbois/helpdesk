import { TicketPriority, TicketStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject: string;

  /** First message of the conversation: the client's description of the problem. */
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body: string;

  /** Staff only: a note visible to agents, hidden from the client. */
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

/** Staff only. Every field is optional; assigneeId: null unassigns the ticket. */
export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}

export class ListTicketsQuery {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  /** "me": tickets assigned to the caller; "none": the unassigned queue. */
  @IsOptional()
  @IsIn(['me', 'none'])
  assigned?: 'me' | 'none';

  // Query string values are strings: @Type converts them before validation.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
