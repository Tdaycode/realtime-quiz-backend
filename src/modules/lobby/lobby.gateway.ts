/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
// src/modules/lobby/lobby.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { LobbyService } from './lobby.service';
import { GameService } from '../game/game.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { RedisService } from '../redis/redis.service';
import { GAME_CONFIG } from '../../common/constants/game.constants';
import {
  CreateLobbyDto,
  JoinLobbyDto,
} from '../../common/dto/create-lobby.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LobbyGateway.name);

  constructor(
    private readonly lobbyService: LobbyService,
    private readonly gameService: GameService,
    private readonly analyticsService: AnalyticsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Handle new client connections
   */
  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // Track connection
    await this.analyticsService.trackConnection(true);

    client.emit('connected', { clientId: client.id });
  }

  /**
   * Handle client disconnections
   */
  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Track disconnection
    await this.analyticsService.trackConnection(false);

    try {
      // IMPORTANT: Use actual userId if authenticated, socket id for guests
      const userId = client.data.user?.userId || client.id;

      const result = await this.lobbyService.leaveLobby(userId);

      if (result.lobby && result.lobbyId) {
        const gameState = this.lobbyService.toGameState(result.lobby);
        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.PLAYER_LEFT, {
          playerId: userId,
          gameState,
        });
        this.server
          .to(result.lobbyId)
          .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);
      } else if (result.lobbyId) {
        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, {
          message: 'Lobby closed',
        });
      }

      // Clean up socket-to-userId mapping
      if (client.data.user?.userId) {
        await this.redisService.client.del(`socket:${client.id}:userId`);
      }
    } catch (error) {
      this.logger.error(`Error handling disconnect: ${error.message}`);
      await this.analyticsService.trackError('disconnect_error');
    }
  }

  /**
   * CREATE LOBBY
   * CHANGE: Now uses persistent userId instead of socket client.id
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.CREATE_LOBBY)
  async handleCreateLobby(
    @MessageBody() data: CreateLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.analyticsService.trackMessage();

      // CHANGE: Use persistent userId from JWT if authenticated, socket id for guests
      const userId = client.data.user?.userId || client.id;
      const username = client.data.user?.username || data.username;

      // CHANGE: Store mapping of socket ID to user ID for cross-reference
      if (client.data.user?.userId) {
        await this.redisService.client.setex(
          `socket:${client.id}:userId`,
          3600,
          client.data.user.userId,
        );
      }

      const lobby = await this.lobbyService.createLobby(userId, username);

      await client.join(lobby.id);

      const gameState = this.lobbyService.toGameState(lobby);

      client.emit(GAME_CONFIG.EVENTS.LOBBY_CREATED, {
        success: true,
        lobbyId: lobby.id,
        gameState,
      });

      // CHANGE: Better logging with userId
      this.logger.log(
        `Lobby ${lobby.id} created by ${username} (userId: ${userId})`,
      );

      return { success: true, lobbyId: lobby.id };
    } catch (error) {
      this.logger.error(`Error creating lobby: ${error.message}`);
      await this.analyticsService.trackError('create_lobby_error');
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to create lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * JOIN LOBBY
   * CHANGE: Now uses persistent userId instead of socket client.id
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.JOIN_LOBBY)
  async handleJoinLobby(
    @MessageBody() data: JoinLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.analyticsService.trackMessage();

      // CHANGE: Use persistent userId from JWT if authenticated, socket id for guests
      const userId = client.data.user?.userId || client.id;
      const username = client.data.user?.username || data.username;

      // CHANGE: Store mapping of socket ID to user ID for cross-reference
      if (client.data.user?.userId) {
        await this.redisService.client.setex(
          `socket:${client.id}:userId`,
          3600,
          client.data.user.userId,
        );
      }

      const lobby = await this.lobbyService.joinLobby(
        data.lobbyId,
        userId,
        username,
      );

      await client.join(lobby.id);

      const gameState = this.lobbyService.toGameState(lobby);

      this.server.to(lobby.id).emit(GAME_CONFIG.EVENTS.PLAYER_JOINED, {
        playerId: userId,
        username: username,
        gameState,
      });

      this.server
        .to(lobby.id)
        .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);

      // Track player activity if authenticated
      if (client.data.user?.userId) {
        await this.analyticsService.trackPlayerActivity(
          client.data.user.userId,
        );
      }

      // CHANGE: Better logging with userId
      this.logger.log(
        `${username} (userId: ${userId}) joined lobby ${data.lobbyId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Error joining lobby: ${error.message}`);
      await this.analyticsService.trackError('join_lobby_error');
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to join lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * LEAVE LOBBY
   * CHANGE: Now uses persistent userId instead of socket client.id
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.LEAVE_LOBBY)
  async handleLeaveLobby(@ConnectedSocket() client: Socket) {
    try {
      await this.analyticsService.trackMessage();

      // CHANGE: Use persistent userId from JWT if authenticated
      const userId = client.data.user?.userId || client.id;

      const result = await this.lobbyService.leaveLobby(userId);

      if (result.lobby && result.lobbyId) {
        await client.leave(result.lobbyId);

        const gameState = this.lobbyService.toGameState(result.lobby);

        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.PLAYER_LEFT, {
          playerId: userId,
          gameState,
        });
        this.server
          .to(result.lobbyId)
          .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);
      }

      client.emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, {
        message: 'Left lobby successfully',
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error leaving lobby: ${error.message}`);
      await this.analyticsService.trackError('leave_lobby_error');
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to leave lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * PLAYER READY
   * CHANGE: Now uses persistent userId instead of socket client.id
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.PLAYER_READY)
  async handlePlayerReady(
    @MessageBody() data: { isReady: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.analyticsService.trackMessage();

      // CHANGE: Use persistent userId from JWT if authenticated
      const userId = client.data.user?.userId || client.id;

      const lobby = await this.lobbyService.setPlayerReady(
        userId,
        data.isReady,
      );
      const gameState = this.lobbyService.toGameState(lobby);

      this.server
        .to(lobby.id)
        .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);

      if (this.lobbyService.canStartGame(lobby)) {
        await this.startGame(lobby.id);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error setting player ready: ${error.message}`);
      await this.analyticsService.trackError('player_ready_error');
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to set ready status',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * START GAME (triggered automatically when all ready)
   */
  private async startGame(lobbyId: string) {
    try {
      this.logger.log(`Starting game for lobby ${lobbyId}`);

      const lobby = await this.lobbyService.getLobby(lobbyId);
      if (lobby) {
        await this.analyticsService.trackGameStart(
          lobby.id,
          lobby.players.size,
        );
      }

      this.server.to(lobbyId).emit(GAME_CONFIG.EVENTS.GAME_STARTING, {
        countdown: GAME_CONFIG.LOBBY_START_DELAY / 1000,
        message: 'Game starting soon!',
      });

      await new Promise((resolve) =>
        setTimeout(resolve, GAME_CONFIG.LOBBY_START_DELAY),
      );

      await this.gameService.startGame(lobbyId, this.server);
    } catch (error) {
      this.logger.error(`Error starting game: ${error.message}`);
      await this.analyticsService.trackError('start_game_error');
      this.server.to(lobbyId).emit(GAME_CONFIG.EVENTS.ERROR, {
        message: 'Failed to start game',
      });
    }
  }

  /**
   * SUBMIT ANSWER
   * CHANGE: Now uses persistent userId instead of socket client.id
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.SUBMIT_ANSWER)
  async handleSubmitAnswer(
    @MessageBody() data: { questionId: string; selectedOption: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.analyticsService.trackMessage();

      // CHANGE: Use persistent userId from JWT if authenticated
      const userId = client.data.user?.userId || client.id;

      const lobbyId = await this.lobbyService.getPlayerLobby(userId);

      if (!lobbyId) {
        throw new Error('You are not in a lobby');
      }

      const lobby = await this.lobbyService.getLobby(lobbyId.id);

      if (!lobby || lobby.status !== 'IN_PROGRESS') {
        throw new Error('Game is not in progress');
      }

      await this.gameService.submitAnswer(lobbyId.id, userId, {
        playerId: userId,
        questionId: data.questionId,
        selectedOption: data.selectedOption,
        submittedAt: Date.now(),
      });

      client.emit('answer_submitted', {
        success: true,
        message: 'Answer submitted successfully',
      });

      // CHANGE: Better logging with userId
      this.logger.log(
        `Player ${userId} submitted answer for question ${data.questionId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Error submitting answer: ${error.message}`);
      await this.analyticsService.trackError('submit_answer_error');
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to submit answer',
      });
      return { success: false, error: error.message };
    }
  }
}
