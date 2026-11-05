import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import type { DomainEvent } from '../events/events.types.js';
import { RabbitMQService } from '../events/rabbitmq.service.js';
import { StatsService } from '../stats/stats.service.js';
import {
  audienceFor,
  STAFF_ROOM,
  toRealtimeMessage,
  userRoom,
} from './audience.js';

/**
 * WebSocket entry point (Socket.IO, served on the API's port under /socket.io).
 *
 * Flow: API or worker publishes an event -> RabbitMQ -> this instance's temporary
 * queue (see RabbitMQService.subscribe) -> emitted to the right rooms.
 * Because every API instance has its own queue, each one receives every event and
 * pushes it to its own connected browsers: scaling out needs no Redis adapter.
 */
@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway
  implements OnGatewayConnection, OnApplicationBootstrap
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rabbit: RabbitMQService,
    private readonly stats: StatsService,
  ) {}

  async onApplicationBootstrap() {
    await this.rabbit.subscribe(['ticket.#', 'message.#'], (event) =>
      this.dispatch(event),
    );
  }

  /**
   * The browser sends the same httpOnly session cookie on the WebSocket handshake.
   * Same check as the HTTP guard: no valid token, no connection.
   */
  async handleConnection(socket: Socket) {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const token = cookies[ACCESS_COOKIE];
      if (!token) throw new Error('no session');
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(
        token,
      );
      await socket.join(userRoom(payload.sub));
      if (payload.role !== Role.CLIENT) await socket.join(STAFF_ROOM);
    } catch {
      socket.disconnect(true);
    }
  }

  private async dispatch(event: DomainEvent) {
    // Any ticket change can move the dashboard numbers: drop the cached stats.
    await this.stats.invalidate();
    const rooms = audienceFor(event);
    this.server.to(rooms).emit('ticket.event', toRealtimeMessage(event));
    this.logger.debug(`${event.type} -> ${rooms.join(', ')}`);
  }
}
