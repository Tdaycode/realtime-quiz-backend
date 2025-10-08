/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SystemMetrics,
  GameMetrics,
  PlayerMetrics,
} from './interfaces/analytics.interface';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private metricsBuffer: {
    connections: number[];
    messages: number[];
    errors: number[];
  } = {
    connections: [],
    messages: [],
    errors: [],
  };

  constructor(private redisService: RedisService) {}

  // Track real-time metrics
  async trackConnection(connected: boolean) {
    const key = 'analytics:connections:current';
    if (connected) {
      await this.redisService.client.incr(key);
    } else {
      await this.redisService.client.decr(key);
    }
  }

  async trackMessage() {
    const minute = Math.floor(Date.now() / 60000);
    await this.redisService.client.incr(`analytics:messages:${minute}`);
    await this.redisService.client.expire(`analytics:messages:${minute}`, 3600);
  }

  async trackError(errorType: string) {
    const hour = Math.floor(Date.now() / 3600000);
    await this.redisService.client.hincrby(
      `analytics:errors:${hour}`,
      errorType,
      1,
    );
    await this.redisService.client.expire(`analytics:errors:${hour}`, 86400);
  }

  async trackGameStart(lobbyId: string, playerCount: number) {
    await this.redisService.client.hincrby(
      'analytics:games:daily',
      this.getToday(),
      1,
    );
    await this.redisService.client.setex(
      `analytics:game:${lobbyId}:start`,
      3600,
      Date.now().toString(),
    );
    await this.redisService.client.setex(
      `analytics:game:${lobbyId}:players`,
      3600,
      playerCount.toString(),
    );
  }

  async trackGameEnd(lobbyId: string, duration: number) {
    const startTime = await this.redisService.client.get(
      `analytics:game:${lobbyId}:start`,
    );

    if (startTime) {
      await this.redisService.client.lpush(
        'analytics:game:durations',
        duration.toString(),
      );
      await this.redisService.client.ltrim('analytics:game:durations', 0, 999);
    }
  }

  async trackPlayerActivity(userId: string) {
    const today = this.getToday();
    await this.redisService.client.sadd(
      `analytics:players:active:${today}`,
      userId,
    );
    await this.redisService.client.expire(
      `analytics:players:active:${today}`,
      86400 * 7,
    );
  }

  // Get current system metrics
  async getSystemMetrics(): Promise<SystemMetrics> {
    const currentConnections = await this.redisService.client.get(
      'analytics:connections:current',
    );

    const lobbies = await this.redisService.client.keys('lobby:*');
    const activeLobbies = lobbies.length;

    // Calculate messages per second (last minute)
    const minute = Math.floor(Date.now() / 60000);
    const messages = await this.redisService.client.get(
      `analytics:messages:${minute}`,
    );
    const messagesPerSecond = messages ? parseInt(messages) / 60 : 0;

    // Get error rate (last hour)
    const hour = Math.floor(Date.now() / 3600000);
    const errors = await this.redisService.client.hgetall(
      `analytics:errors:${hour}`,
    );
    const totalErrors = Object.values(errors).reduce(
      (sum, val) => sum + parseInt(val),
      0,
    );
    const errorRate = totalErrors / 3600; // per second

    return {
      timestamp: Date.now(),
      activeConnections: parseInt(currentConnections || '0'),
      activeLobbies,
      activePlayers: parseInt(currentConnections || '0'),
      messagesPerSecond: Math.round(messagesPerSecond * 100) / 100,
      averageLatency: 0, // Would need to track this separately
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  // Get game metrics
  async getGameMetrics(): Promise<GameMetrics> {
    const durations = await this.redisService.client.lrange(
      'analytics:game:durations',
      0,
      -1,
    );

    const avgDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + parseInt(d), 0) / durations.length
        : 0;

    const today = this.getToday();
    const gamesPlayed = await this.redisService.client.hget(
      'analytics:games:daily',
      today,
    );

    return {
      totalGamesPlayed: parseInt(gamesPlayed || '0'),
      averageGameDuration: Math.round(avgDuration / 1000), // seconds
      averagePlayersPerGame: 6, // Would need to calculate from actual data
      mostPopularCategory: 'General', // Would need to track categories
      peakConcurrentGames: 0, // Would need to track this
    };
  }

  // Get player metrics
  async getPlayerMetrics(): Promise<PlayerMetrics> {
    const today = this.getToday();
    const activeToday = await this.redisService.client.scard(
      `analytics:players:active:${today}`,
    );

    const totalUsers = await this.redisService.client.keys('user:*');
    const userCount = totalUsers.filter(
      (key) => !key.includes(':email:') && !key.includes(':username:'),
    ).length;

    return {
      totalPlayers: userCount,
      activePlayersToday: activeToday,
      averageSessionDuration: 0, // Would need to track session times
      retentionRate: {
        day1: 0, // Would need historical data
        day7: 0,
        day30: 0,
      },
    };
  }

  // Get dashboard data
  async getDashboardData() {
    const [system, game, player] = await Promise.all([
      this.getSystemMetrics(),
      this.getGameMetrics(),
      this.getPlayerMetrics(),
    ]);

    return {
      system,
      game,
      player,
      timestamp: Date.now(),
    };
  }

  // Get historical data
  async getHistoricalData(days: number = 7) {
    const data: Array<{
      date: string;
      gamesPlayed: number;
      activePlayers: number;
    }> = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);

      const gamesPlayed = await this.redisService.client.hget(
        'analytics:games:daily',
        dateStr,
      );

      const activePlayers = await this.redisService.client.scard(
        `analytics:players:active:${dateStr}`,
      );

      data.push({
        date: dateStr,
        gamesPlayed: parseInt(gamesPlayed || '0'),
        activePlayers,
      });
    }

    return data.reverse();
  }

  // Cleanup old data (runs daily)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldData() {
    this.logger.log('Running analytics cleanup...');

    // Clean up old message counters (older than 24 hours)
    const oneDayAgo = Math.floor((Date.now() - 86400000) / 60000);
    const keys = await this.redisService.client.keys('analytics:messages:*');

    for (const key of keys) {
      const minute = parseInt(key.split(':')[2]);
      if (minute < oneDayAgo) {
        await this.redisService.client.del(key);
      }
    }

    this.logger.log('Analytics cleanup completed');
  }

  private getToday(): string {
    return this.formatDate(new Date());
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
