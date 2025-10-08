/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { User } from './interfaces/user.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserService {
  constructor(private redisService: RedisService) {}

  async create(data: {
    email: string;
    username: string;
    password: string;
  }): Promise<User> {
    const userId = uuidv4();

    const user: User = {
      id: userId,
      email: data.email,
      username: data.username,
      password: data.password,
      createdAt: Date.now(),
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        totalScore: 0,
        averageScore: 0,
        bestStreak: 0,
        fastestAnswer: 0,
      },
    };

    // Save to Redis
    await this.redisService.client.setex(
      `user:${userId}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(user),
    );

    // Create email index
    await this.redisService.client.setex(
      `user:email:${data.email}`,
      86400 * 30,
      userId,
    );

    // Create username index
    await this.redisService.client.setex(
      `user:username:${data.username}`,
      86400 * 30,
      userId,
    );

    return user;
  }

  async findById(userId: string): Promise<User | null> {
    const data = await this.redisService.client.get(`user:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = await this.redisService.client.get(`user:email:${email}`);
    if (!userId) return null;
    return this.findById(userId);
  }

  async findByUsername(username: string): Promise<User | null> {
    const userId = await this.redisService.client.get(
      `user:username:${username}`,
    );
    if (!userId) return null;
    return this.findById(userId);
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.lastLogin = Date.now();

    await this.redisService.client.setex(
      `user:${userId}`,
      86400 * 30,
      JSON.stringify(user),
    );
  }

  async updateStats(
    userId: string,
    gameData: {
      score: number;
      won: boolean;
      maxStreak: number;
      fastestAnswer: number;
    },
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.stats.gamesPlayed += 1;
    if (gameData.won) user.stats.gamesWon += 1;
    user.stats.totalScore += gameData.score;
    user.stats.averageScore = Math.round(
      user.stats.totalScore / user.stats.gamesPlayed,
    );

    if (gameData.maxStreak > user.stats.bestStreak) {
      user.stats.bestStreak = gameData.maxStreak;
    }

    if (
      gameData.fastestAnswer < user.stats.fastestAnswer ||
      user.stats.fastestAnswer === 0
    ) {
      user.stats.fastestAnswer = gameData.fastestAnswer;
    }

    await this.redisService.client.setex(
      `user:${userId}`,
      86400 * 30,
      JSON.stringify(user),
    );
  }

  async getProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Don't return password
    const { password, ...profile } = user;
    return profile;
  }

  async getLeaderboard(limit: number = 10) {
    // This is a simple implementation
    // In production, you'd want a more efficient leaderboard system
    const keys = await this.redisService.client.keys('user:*');
    const users: User[] = [];

    for (const key of keys) {
      if (key.includes(':email:') || key.includes(':username:')) continue;
      const data = await this.redisService.client.get(key);
      if (data) users.push(JSON.parse(data));
    }

    return users
      .sort((a, b) => b.stats.totalScore - a.stats.totalScore)
      .slice(0, limit)
      .map((user) => ({
        username: user.username,
        gamesPlayed: user.stats.gamesPlayed,
        gamesWon: user.stats.gamesWon,
        totalScore: user.stats.totalScore,
        averageScore: user.stats.averageScore,
        winRate:
          user.stats.gamesPlayed > 0
            ? Math.round((user.stats.gamesWon / user.stats.gamesPlayed) * 100)
            : 0,
      }));
  }
}
