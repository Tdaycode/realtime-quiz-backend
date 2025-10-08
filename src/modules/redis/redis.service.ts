/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Lobby } from '../../common/interfaces/lobby.interface';

@Injectable()
export class RedisService implements OnModuleDestroy {
  public readonly client: Redis;
  private readonly pubClient: Redis;
  private readonly subClient: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    this.client = new Redis(redisConfig);
    this.pubClient = new Redis(redisConfig);
    this.subClient = new Redis(redisConfig);
  }

  // Lobby Management
  async saveLobby(lobbyId: string, lobby: Lobby): Promise<void> {
    const lobbyData = {
      ...lobby,
      players: Array.from(lobby.players.entries()),
    };
    await this.client.setex(
      `lobby:${lobbyId}`,
      3600, // 1 hour expiry
      JSON.stringify(lobbyData),
    );
  }

  async getLobby(lobbyId: string): Promise<Lobby | null> {
    const data = await this.client.get(`lobby:${lobbyId}`);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const playersData = parsed?.players || [];
    return {
      ...parsed,
      players: new Map(playersData),
    } as Lobby;
  }

  async deleteLobby(lobbyId: string): Promise<void> {
    await this.client.del(`lobby:${lobbyId}`);
  }

  async getAllLobbies(): Promise<string[]> {
    return await this.client.keys('lobby:*');
  }

  // Player-Lobby Mapping
  async setPlayerLobby(playerId: string, lobbyId: string): Promise<void> {
    await this.client.setex(`player:${playerId}:lobby`, 3600, lobbyId);
  }

  async getPlayerLobby(playerId: string): Promise<string | null> {
    return await this.client.get(`player:${playerId}:lobby`);
  }

  async removePlayerLobby(playerId: string): Promise<void> {
    await this.client.del(`player:${playerId}:lobby`);
  }

  // Pub/Sub for distributed events
  async publish(channel: string, message: any): Promise<void> {
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  subscribe(channel: string, callback: (message: any) => void): void {
    this.subClient.subscribe(channel);
    this.subClient.on('message', (ch, msg) => {
      if (ch === channel) {
        callback(JSON.parse(msg));
      }
    });
  }

  // Leaderboard (sorted set)
  async updateLeaderboard(
    lobbyId: string,
    playerId: string,
    score: number,
  ): Promise<void> {
    await this.client.zadd(`leaderboard:${lobbyId}`, score, playerId);
  }

  async getLeaderboard(lobbyId: string, limit = 10): Promise<any[]> {
    return await this.client.zrevrange(
      `leaderboard:${lobbyId}`,
      0,
      limit - 1,
      'WITHSCORES',
    );
  }

  // Connection health check
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  onModuleDestroy() {
    this.client.disconnect();
    this.pubClient.disconnect();
    this.subClient.disconnect();
  }
}
