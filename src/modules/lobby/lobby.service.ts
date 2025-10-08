// src/modules/lobby/lobby.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Lobby, LobbyStatus } from '../../common/interfaces/lobby.interface';
import { Player } from '../../common/interfaces/player.interface';
import {
  GameState,
  LeaderboardEntry,
} from '../../common/interfaces/game-state.interface';
import { GAME_CONFIG } from '../../common/constants/game.constants';

@Injectable()
export class LobbyService {
  private readonly logger = new Logger(LobbyService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Create a new lobby
   */
  async createLobby(hostId: string, username: string): Promise<Lobby> {
    const lobbyId = this.generateLobbyCode();

    const host: Player = {
      id: hostId,
      socketId: hostId,
      username,
      score: 0,
      currentStreak: 0,
      joinedAt: Date.now(),
      isReady: true, // Host is auto-ready
    };

    const lobby: Lobby = {
      id: lobbyId,
      hostId,
      players: new Map([[hostId, host]]),
      status: LobbyStatus.WAITING,
      currentRound: 0,
      totalRounds: GAME_CONFIG.ROUND_COUNT,
      createdAt: Date.now(),
    };

    await this.redisService.saveLobby(lobbyId, lobby);
    await this.redisService.setPlayerLobby(hostId, lobbyId);

    this.logger.log(`Lobby ${lobbyId} created by ${username} `);
    return lobby;
  }

  /**
   * Join an existing lobby
   */
  async joinLobby(
    lobbyId: string,
    playerId: string,
    username: string,
  ): Promise<Lobby> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.status !== LobbyStatus.WAITING) {
      throw new Error('Lobby has already started');
    }

    if (lobby.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      throw new Error('Lobby is full');
    }

    // Check if username already exists
    const existingPlayer = Array.from(lobby.players.values()).find(
      (p) => p.username === username,
    );
    if (existingPlayer) {
      throw new Error('Username already taken in this lobby');
    }

    const player: Player = {
      id: playerId,
      socketId: playerId,
      username,
      score: 0,
      currentStreak: 0,
      joinedAt: Date.now(),
      isReady: false,
    };

    lobby.players.set(playerId, player);
    await this.redisService.saveLobby(lobbyId, lobby);
    await this.redisService.setPlayerLobby(playerId, lobbyId);

    this.logger.log(`Player ${username} joined lobby ${lobbyId}`);
    return lobby;
  }

  /**
   * Remove player from lobby
   */
  async leaveLobby(
    playerId: string,
  ): Promise<{ lobby: Lobby | null; lobbyId: string | null }> {
    const lobbyId = await this.redisService.getPlayerLobby(playerId);

    if (!lobbyId) {
      return { lobby: null, lobbyId: null };
    }

    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      await this.redisService.removePlayerLobby(playerId);
      return { lobby: null, lobbyId };
    }

    lobby.players.delete(playerId);
    await this.redisService.removePlayerLobby(playerId);

    // If lobby is empty or host left, delete the lobby
    if (lobby.players.size === 0 || playerId === lobby.hostId) {
      await this.redisService.deleteLobby(lobbyId);
      this.logger.log(`Lobby ${lobbyId} deleted`);
      return { lobby: null, lobbyId };
    }

    // Assign new host if current host left
    if (playerId === lobby.hostId) {
      const newHost = Array.from(lobby.players.values())[0];
      lobby.hostId = newHost.id;
      this.logger.log(`New host assigned: ${newHost.username}`);
    }

    await this.redisService.saveLobby(lobbyId, lobby);
    this.logger.log(`Player ${playerId} left lobby ${lobbyId}`);

    return { lobby, lobbyId };
  }

  /**
   * Mark player as ready
   */
  async setPlayerReady(playerId: string, isReady: boolean): Promise<Lobby> {
    const lobbyId = await this.redisService.getPlayerLobby(playerId);

    if (!lobbyId) {
      throw new Error('Player not in any lobby');
    }

    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.get(playerId);
    if (player) {
      player.isReady = isReady;
      lobby.players.set(playerId, player);
      await this.redisService.saveLobby(lobbyId, lobby);
    }

    return lobby;
  }

  /**
   * Check if all players are ready and enough players to start
   */
  canStartGame(lobby: Lobby): boolean {
    if (lobby.players.size < GAME_CONFIG.MIN_PLAYERS) {
      return false;
    }

    const allReady = Array.from(lobby.players.values()).every((p) => p.isReady);
    return allReady;
  }

  /**
   * Update lobby status
   */
  async updateLobbyStatus(
    lobbyId: string,
    status: LobbyStatus,
  ): Promise<Lobby> {
    const lobby = await this.redisService.getLobby(lobbyId);

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    lobby.status = status;
    await this.redisService.saveLobby(lobbyId, lobby);

    return lobby;
  }

  /**
   * Get lobby by ID
   */
  async getLobby(lobbyId: string): Promise<Lobby | null> {
    return await this.redisService.getLobby(lobbyId);
  }

  /**
   * Get lobby for a player
   */
  async getPlayerLobby(playerId: string): Promise<Lobby | null> {
    const lobbyId = await this.redisService.getPlayerLobby(playerId);

    if (!lobbyId) {
      return null;
    }

    return await this.redisService.getLobby(lobbyId);
  }

  /**
   * Convert lobby to game state for broadcasting
   */
  toGameState(lobby: Lobby): GameState {
    const players = Array.from(lobby.players.values());
    const leaderboard: LeaderboardEntry[] = players
      .map((p, index) => ({
        playerId: p.id,
        username: p.username,
        score: p.score,
        streak: p.currentStreak,
        rank: index + 1,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return {
      lobbyId: lobby.id,
      status: lobby.status,
      currentRound: lobby.currentRound,
      totalRounds: lobby.totalRounds,
      players,
      leaderboard,
    };
  }

  /**
   * Generate a short, memorable lobby code
   */
  private generateLobbyCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
