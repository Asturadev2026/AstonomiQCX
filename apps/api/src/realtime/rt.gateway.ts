import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verifyOidcToken, tenantForUser } from '../auth/oidc';

/**
 * Pushes live updates to the screen (Guide §9). Each logged-in screen opens
 * one socket, authenticated with its login token; we place it in a room
 * named after its tenant, so a message pushed to ShopNova only reaches
 * ShopNova's screens. TicketsService (and everything after it) just calls
 * emitToTenant() — this class is the only thing that changed from the Part 8
 * stub, no callers needed updating.
 */
@WebSocketGateway({ cors: true })
export class RtGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RtGateway.name);

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      const claims = await verifyOidcToken(token);
      const tenantId = await tenantForUser(claims.sub as string);
      socket.join(`tenant:${tenantId}`);
    } catch {
      socket.disconnect(true); // no valid token -> kick out
    }
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.logger.debug(`emit ${event} -> tenant:${tenantId}`);
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
