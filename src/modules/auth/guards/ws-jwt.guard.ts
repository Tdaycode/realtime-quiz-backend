import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractTokenFromHeader(client);

    if (!token) {
      throw new WsException('Unauthorized - No token provided');
    }

    try {
      const payload = this.authService.verifyToken(token) as {
        sub: string;
        email: string;
        username: string;
      };
      const user = await this.authService.validateUser(payload.sub);

      if (!user) {
        throw new WsException('Unauthorized - Invalid token');
      }

      // Attach user to socket for later use
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        username: payload.username,
      };

      return true;
    } catch {
      throw new WsException('Unauthorized - Invalid token');
    }
  }

  private extractTokenFromHeader(client: Socket): string | undefined {
    const authHeader = client.handshake.headers.authorization;
    const token = client.handshake.auth?.token as string | undefined;

    if (authHeader) {
      const [type, tokenValue] = authHeader.split(' ');
      return type === 'Bearer' ? tokenValue : undefined;
    }

    return token;
  }
}
