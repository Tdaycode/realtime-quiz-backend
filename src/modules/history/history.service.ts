/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { GameHistory } from './interfaces/game-history.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private redisService: RedisService) {}

  async saveGame(gameData: Omit<GameHistory, 'id'>): Promise<string> {
    const gameId = uuidv4();

    const history: GameHistory = {
      id: gameId,
      ...gameData,
    };

    // Save game history
    await this.redisService.client.setex(
      `history:game:${gameId}`,
      86400 * 90, // 90 days retention
      JSON.stringify(history),
    );

    // Index by each player for easy retrieval
    for (const player of gameData.players) {
      await this.redisService.client.lpush(
        `history:user:${player.userId}`,
        gameId,
      );
      // Keep only last 100 games per user
      await this.redisService.client.ltrim(
        `history:user:${player.userId}`,
        0,
        99,
      );
    }

    // Add to global games list
    await this.redisService.client.lpush('history:games:all', gameId);
    await this.redisService.client.ltrim('history:games:all', 0, 999); // Keep last 1000 games

    this.logger.log(`Game ${gameId} saved to history`);
    return gameId;
  }

  async getGameById(gameId: string): Promise<GameHistory | null> {
    const data = await this.redisService.client.get(`history:game:${gameId}`);
    return data ? JSON.parse(data) : null;
  }

  async getUserGames(
    userId: string,
    limit: number = 20,
  ): Promise<GameHistory[]> {
    const gameIds = await this.redisService.client.lrange(
      `history:user:${userId}`,
      0,
      limit - 1,
    );

    const games: GameHistory[] = [];
    for (const gameId of gameIds) {
      const game = await this.getGameById(gameId);
      if (game) games.push(game);
    }

    return games;
  }

  async getRecentGames(limit: number = 50): Promise<GameHistory[]> {
    const gameIds = await this.redisService.client.lrange(
      'history:games:all',
      0,
      limit - 1,
    );

    const games: GameHistory[] = [];
    for (const gameId of gameIds) {
      const game = await this.getGameById(gameId);
      if (game) games.push(game);
    }

    return games;
  }

  async getUserStats(userId: string) {
    const games = await this.getUserGames(userId, 100);

    if (games.length === 0) {
      return {
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        averageScore: 0,
        averageRank: 0,
        totalScore: 0,
        bestGame: null,
      };
    }

    const userResults = games
      .map((game) => game.players.find((p) => p.userId === userId))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    const wins = userResults.filter((r) => r?.rank === 1).length;
    const totalScore = userResults.reduce(
      (sum, r) => sum + (r?.finalScore || 0),
      0,
    );
    const averageScore = Math.round(totalScore / userResults.length);
    const averageRank =
      userResults.reduce((sum, r) => sum + (r?.rank || 0), 0) /
      userResults.length;
    const bestGame = games.reduce((best, game) => {
      const playerResult = game.players.find((p) => p.userId === userId);
      if (!playerResult) return best;
      if (!best || playerResult.finalScore > best.score) {
        return {
          gameId: game.id,
          score: playerResult.finalScore,
          rank: playerResult.rank,
          date: game.endedAt,
        };
      }
      return best;
    }, null as any);

    return {
      gamesPlayed: games.length,
      wins,
      winRate: Math.round((wins / games.length) * 100),
      averageScore,
      averageRank: Math.round(averageRank * 10) / 10,
      totalScore,
      bestGame,
    };
  }
}
