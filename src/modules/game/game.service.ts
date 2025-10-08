/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { Lobby, LobbyStatus } from '../../common/interfaces/lobby.interface';
import { Question, Answer } from '../../common/interfaces/question.interface';
import {
  LeaderboardEntry,
  RoundResult,
} from '../../common/interfaces/game-state.interface';
import { GAME_CONFIG } from '../../common/constants/game.constants';
import { QUESTIONS_POOL } from '../../data/questions.data';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly activeGames: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly redisService: RedisService) {}

  /**
   * Start the game for a lobby
   */
  async startGame(lobbyId: string, server: Server): Promise<void> {
    try {
      const lobby = await this.redisService.getLobby(lobbyId);

      if (!lobby) {
        throw new Error('Lobby not found');
      }

      // Update lobby status
      lobby.status = LobbyStatus.IN_PROGRESS;
      lobby.currentRound = 1;
      await this.redisService.saveLobby(lobbyId, lobby);

      this.logger.log(`Game started for lobby ${lobbyId}`);

      // Start first round
      await this.startRound(lobbyId, server);
    } catch (error) {
      this.logger.error(`Error starting game: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start a new round
   */
  private async startRound(lobbyId: string, server: Server): Promise<void> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      this.logger.error(`Lobby ${lobbyId} not found when starting round`);
      return;
    }

    // Select random question
    const question = this.selectRandomQuestion();

    // Update lobby with current question
    lobby.currentQuestion = question;
    lobby.questionStartTime = Date.now();
    await this.redisService.saveLobby(lobbyId, lobby);

    // Prepare question for clients (hide correct answer)
    const clientQuestion = {
      id: question.id,
      text: question.text,
      options: question.options,
      points: question.points,
      category: question.category,
      timeLimit: GAME_CONFIG.QUESTION_TIME_LIMIT,
      roundNumber: lobby.currentRound,
      totalRounds: lobby.totalRounds,
    };

    // Broadcast question to all players
    server.to(lobbyId).emit(GAME_CONFIG.EVENTS.QUESTION_START, {
      question: clientQuestion,
      roundNumber: lobby.currentRound,
      totalRounds: lobby.totalRounds,
    });

    this.logger.log(`Round ${lobby.currentRound} started for lobby ${lobbyId}`);

    // Set timeout to end round
    const timeout = setTimeout(() => {
      void this.endRound(lobbyId, server);
    }, GAME_CONFIG.QUESTION_TIME_LIMIT);

    this.activeGames.set(lobbyId, timeout);
  }

  /**
   * Submit an answer
   */
  async submitAnswer(
    lobbyId: string,
    playerId: string,
    answer: Answer,
  ): Promise<void> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby?.currentQuestion) {
      throw new Error('No active question');
    }

    const player = lobby.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Check if answer already submitted (prevent double submission)
    const existingAnswer = await this.redisService.client.get(
      `answer:${lobbyId}:${playerId}:${lobby.currentQuestion.id}`,
    );

    if (existingAnswer) {
      this.logger.warn(`Player ${playerId} already submitted answer`);
      return;
    }

    // Calculate score
    const isCorrect =
      answer.selectedOption === lobby.currentQuestion.correctAnswer;
    const responseTime =
      answer.submittedAt - (lobby?.questionStartTime ?? Date.now());
    const score = this.calculateScore(
      isCorrect,
      responseTime,
      player.currentStreak,
    );

    // Update player score and streak
    if (isCorrect) {
      player.score += score;
      player.currentStreak += 1;
    } else {
      player.currentStreak = 0;
    }

    lobby.players.set(playerId, player);
    await this.redisService.saveLobby(lobbyId, lobby);

    // Store answer in Redis temporarily
    await this.redisService.client.setex(
      `answer:${lobbyId}:${playerId}:${lobby.currentQuestion.id}`,
      60, // 1 minute TTL
      JSON.stringify({
        ...answer,
        isCorrect,
        score,
        responseTime,
      }),
    );

    this.logger.log(
      `Player ${playerId} answered ${isCorrect ? 'correctly' : 'incorrectly'} (+${score} points)`,
    );
  }

  /**
   * Calculate score based on accuracy, speed, and streak
   */
  private calculateScore(
    isCorrect: boolean,
    responseTime: number,
    currentStreak: number,
  ): number {
    if (!isCorrect) {
      return 0;
    }

    // Base points
    let score = GAME_CONFIG.BASE_POINTS;

    // Speed bonus (faster = more points)
    const speedRatio = 1 - responseTime / GAME_CONFIG.QUESTION_TIME_LIMIT;
    const speedBonus = Math.floor(speedRatio * GAME_CONFIG.SPEED_BONUS_MAX);
    score += Math.max(0, speedBonus);

    // Streak multiplier (applies after 3 correct answers)
    if (currentStreak >= 2) {
      score = Math.floor(score * GAME_CONFIG.STREAK_MULTIPLIER);
    }

    return score;
  }

  /**
   * End the current round
   */
  private async endRound(lobbyId: string, server: Server): Promise<void> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby?.currentQuestion) {
      return;
    }

    this.logger.log(`Ending round ${lobby.currentRound} for lobby ${lobbyId}`);

    // Generate leaderboard
    const leaderboard = this.generateLeaderboard(lobby);

    // Prepare round result
    const roundResult: RoundResult = {
      questionId: lobby.currentQuestion.id,
      correctAnswer: lobby.currentQuestion.correctAnswer,
      leaderboard,
      roundNumber: lobby.currentRound,
    };

    // Broadcast round end
    server.to(lobbyId).emit(GAME_CONFIG.EVENTS.ROUND_END, roundResult);

    // Clear the timeout
    const timeout = this.activeGames.get(lobbyId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeGames.delete(lobbyId);
    }

    // Check if game should end
    if (lobby.currentRound >= lobby.totalRounds) {
      await this.endGame(lobbyId, server);
    } else {
      // Start next round after a delay
      lobby.currentRound += 1;
      lobby.currentQuestion = undefined;
      lobby.questionStartTime = undefined;
      await this.redisService.saveLobby(lobbyId, lobby);

      // 3 second delay before next round
      setTimeout(() => {
        void this.startRound(lobbyId, server);
      }, 3000);
    }
  }

  /**
   * End the game
   */
  private async endGame(lobbyId: string, server: Server): Promise<void> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      return;
    }

    this.logger.log(`Game ended for lobby ${lobbyId}`);

    lobby.status = LobbyStatus.FINISHED;
    await this.redisService.saveLobby(lobbyId, lobby);

    // Generate final leaderboard
    const finalLeaderboard = this.generateLeaderboard(lobby);

    // Determine winner
    const winner = finalLeaderboard[0];

    // Broadcast game end
    server.to(lobbyId).emit(GAME_CONFIG.EVENTS.GAME_END, {
      finalLeaderboard,
      winner: {
        username: winner.username,
        score: winner.score,
      },
      message: `🎉 ${winner.username} wins with ${winner.score} points!`,
    });

    // Clean up after 30 seconds
    setTimeout(() => {
      void this.redisService.deleteLobby(lobbyId).then(() => {
        this.logger.log(`Lobby ${lobbyId} cleaned up`);
      });
    }, 30000);
  }

  /**
   * Generate leaderboard from current lobby state
   */
  private generateLeaderboard(lobby: Lobby): LeaderboardEntry[] {
    const players = Array.from(lobby.players.values());

    const leaderboard = players
      .map((player) => ({
        playerId: player.id,
        username: player.username,
        score: player.score,
        streak: player.currentStreak,
        rank: 0, // Will be set after sorting
      }))
      .sort((a, b) => {
        // Sort by score (descending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // If scores are equal, sort by streak
        return b.streak - a.streak;
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return leaderboard;
  }

  /**
   * Select a random question from the pool
   */
  private selectRandomQuestion(): Question {
    const randomIndex = Math.floor(Math.random() * QUESTIONS_POOL.length);
    return QUESTIONS_POOL[randomIndex];
  }

  /**
   * Clean up on service destroy
   */
  onModuleDestroy() {
    // Clear all active timeouts
    this.activeGames.forEach((timeout) => clearTimeout(timeout));
    this.activeGames.clear();
  }
}
