/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { LobbyService } from './lobby.service';
import { GameService } from '../game/game.service';
import { LobbyStatus } from '../../common/interfaces/lobby.interface';
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
  pingTimeout: 60000, // How long to wait for pong before disconnect
  pingInterval: 25000, // How often to send ping
  upgradeTimeout: 30000,
  allowUpgrades: true,
})
@UsePipes(new ValidationPipe())
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LobbyGateway.name);
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly lobbyService: LobbyService,
    private readonly gameService: GameService,
  ) {}

  /**
   * Handle new client connections
   */
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { clientId: client.id });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    try {
      // Get player's lobby before they disconnect
      const lobby = await this.lobbyService.getPlayerLobby(client.id);

      if (!lobby) {
        return;
      }

      // Mark player as temporarily disconnected
      await this.lobbyService.markPlayerDisconnected(client.id);

      // Notify other players
      const gameState = this.lobbyService.toGameState(lobby);
      this.server.to(lobby.id).emit(GAME_CONFIG.EVENTS.PLAYER_DISCONNECTED, {
        playerId: client.id,
        message: 'Player disconnected',
        gameState,
      });

      // Set a grace period (30 seconds) before removing player
      const timer = setTimeout(async () => {
        try {
          // Check if player reconnected
          const updatedLobby = await this.lobbyService.getLobby(lobby.id);
          const player = Array.from(updatedLobby?.players.values() ?? []).find(
            (p) => p.id === client.id,
          );

          if (player && player.isDisconnected) {
            // Player didn't reconnect, remove them
            this.logger.log(`Removing player ${client.id} after timeout`);

            const result = await this.lobbyService.leaveLobby(client.id);

            if (result.lobby && result.lobbyId) {
              const finalState = this.lobbyService.toGameState(result.lobby);
              this.server
                .to(result.lobbyId)
                .emit(GAME_CONFIG.EVENTS.PLAYER_LEFT, {
                  playerId: client.id,
                  gameState: finalState,
                  reason: 'timeout',
                });
              this.server
                .to(result.lobbyId)
                .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, finalState);
            }
          }
        } catch (error) {
          this.logger.error(`Error in disconnect timeout: ${error.message}`);
        } finally {
          this.disconnectTimers.delete(client.id);
        }
      }, 30000); // 30 second grace period

      this.disconnectTimers.set(client.id, timer);
    } catch (error) {
      this.logger.error(`Error handling disconnect: ${error.message}`);
    }
  }

  /**
   * Clear disconnect timer when player reconnects
   */
  private clearDisconnectTimer(socketId: string) {
    const timer = this.disconnectTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(socketId);
      this.logger.log(`Cleared disconnect timer for ${socketId}`);
    }
  }

  // /**
  //  * HEARTBEAT - Keep connection alive
  //  */
  // @SubscribeMessage('heartbeat')
  // handleHeartbeat(
  //   @MessageBody() data: { lobbyId: string; timestamp: number },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   this.redisServic.set(client.id, Date.now());

  //   // Send acknowledgment
  //   client.emit('heartbeat_ack', { timestamp: Date.now() });

  //   return { success: true };
  // }

  /**
   * CREATE LOBBY
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.CREATE_LOBBY)
  async handleCreateLobby(
    @MessageBody() data: CreateLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.createLobby(
        client.id,
        data.username,
      );

      // Join socket room
      await client.join(lobby.id);

      const gameState = this.lobbyService.toGameState(lobby);

      // Send response to creator
      client.emit(GAME_CONFIG.EVENTS.LOBBY_CREATED, {
        success: true,
        lobbyId: lobby.id,
        gameState,
      });

      this.logger.log(`Lobby ${lobby.id} created by ${data.username}`);

      return { success: true, lobbyId: lobby.id };
    } catch (error) {
      this.logger.error(`Error creating lobby: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to create lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * JOIN LOBBY
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.JOIN_LOBBY)
  async handleJoinLobby(
    @MessageBody() data: JoinLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.joinLobby(
        data.lobbyId,
        client.id,
        data.username,
      );

      // Join socket room
      await client.join(lobby.id);

      const gameState = this.lobbyService.toGameState(lobby);

      // Notify all players in the lobby
      this.server.to(lobby.id).emit(GAME_CONFIG.EVENTS.PLAYER_JOINED, {
        playerId: client.id,
        username: data.username,
        gameState,
      });

      // Update lobby state for all
      this.server
        .to(lobby.id)
        .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);

      this.logger.log(`${data.username} joined lobby ${data.lobbyId}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error joining lobby: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to join lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * LEAVE LOBBY
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.LEAVE_LOBBY)
  async handleLeaveLobby(@ConnectedSocket() client: Socket) {
    try {
      const result = await this.lobbyService.leaveLobby(client.id);

      if (result.lobby && result.lobbyId) {
        // Leave socket room
        await client.leave(result.lobbyId);

        const gameState = this.lobbyService.toGameState(result.lobby);

        // Notify remaining players
        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.PLAYER_LEFT, {
          playerId: client.id,
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
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to leave lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * PLAYER READY
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.PLAYER_READY)
  async handlePlayerReady(
    @MessageBody() data: { isReady: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.setPlayerReady(
        client.id,
        data.isReady,
      );
      const gameState = this.lobbyService.toGameState(lobby);

      // Broadcast updated state
      this.server
        .to(lobby.id)
        .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);

      // Check if game can start
      if (this.lobbyService.canStartGame(lobby)) {
        await this.startGame(lobby.id);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error setting player ready: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to set ready status',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * REJOIN LOBBY - For reconnections
   */
  @SubscribeMessage('rejoin_lobby')
  async handleRejoinLobby(
    @MessageBody() data: { lobbyId: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.getLobby(data.lobbyId);

      if (!lobby) {
        throw new Error('Lobby not found');
      }

      // Find existing player by username
      const existingPlayer = Array.from(lobby.players.values()).find(
        (p) => p.username === data.username,
      );

      if (existingPlayer) {
        // Update socket ID for reconnected player
        await this.lobbyService.updatePlayerSocketId(
          data.lobbyId,
          existingPlayer.id,
          client.id,
        );

        // Join socket room
        await client.join(lobby.id);

        const gameState = this.lobbyService.toGameState(lobby);

        // Send current game state
        client.emit('game_state_sync', {
          success: true,
          gameState,
          currentQuestion: lobby.currentQuestion || null,
          roundNumber: lobby.currentRound || 0,
          totalRounds: lobby.totalRounds || GAME_CONFIG.ROUND_COUNT,
          remainingTime: this.gameService.getRemainingTime(lobby.id) || 0,
          leaderboard: this.gameService.getLeaderboard(lobby.id) || [],
        });

        // Notify other players
        this.server.to(lobby.id).emit(GAME_CONFIG.EVENTS.PLAYER_REJOINED, {
          playerId: client.id,
          username: data.username,
          gameState,
        });

        this.logger.log(
          `${data.username} reconnected to lobby ${data.lobbyId}`,
        );

        return { success: true, reconnected: true };
      } else {
        // Player not found, join as new
        return this.handleJoinLobby(data as JoinLobbyDto, client);
      }
    } catch (error) {
      this.logger.error(`Error rejoining lobby: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to rejoin lobby',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * REQUEST GAME STATE - When app returns to foreground
   */
  @SubscribeMessage('request_game_state')
  async handleRequestGameState(
    @MessageBody() data: { lobbyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.getLobby(data.lobbyId);

      if (!lobby) {
        throw new Error('Lobby not found');
      }

      // Verify player is in this lobby
      const player = Array.from(lobby.players.values()).find(
        (p) => p.socketId === client.id,
      );

      if (!player) {
        throw new Error('You are not in this lobby');
      }

      const gameState = this.lobbyService.toGameState(lobby);

      // Send current state
      client.emit('game_state_sync', {
        success: true,
        gameState,
        currentQuestion: lobby.currentQuestion || null,
        roundNumber: lobby.currentRound || 0,
        totalRounds: lobby.totalRounds || GAME_CONFIG.ROUND_COUNT,
        remainingTime: this.gameService.getRemainingTime(lobby.id) || 0,
        leaderboard: this.gameService.getLeaderboard(lobby.id) || [],
      });

      this.logger.log(`Sent game state to ${player.username}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error requesting game state: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to get game state',
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

      // Send countdown
      this.server.to(lobbyId).emit(GAME_CONFIG.EVENTS.GAME_STARTING, {
        countdown: GAME_CONFIG.LOBBY_START_DELAY / 1000,
        message: 'Game starting soon!',
      });

      // Wait for countdown
      await new Promise((resolve) =>
        setTimeout(resolve, GAME_CONFIG.LOBBY_START_DELAY),
      );

      // Initialize game
      await this.gameService.startGame(lobbyId, this.server);
    } catch (error) {
      this.logger.error(`Error starting game: ${error.message}`);
      this.server.to(lobbyId).emit(GAME_CONFIG.EVENTS.ERROR, {
        message: 'Failed to start game',
      });
    }
  }

  /**
   * SUBMIT ANSWER
   */
  @SubscribeMessage(GAME_CONFIG.EVENTS.SUBMIT_ANSWER)
  async handleSubmitAnswer(
    @MessageBody() data: { questionId: string; selectedOption: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const lobby = await this.lobbyService.getPlayerLobby(client.id);

      if (!lobby) {
        throw new Error('You are not in a lobby');
      }

      if (!lobby || lobby.status !== LobbyStatus.IN_PROGRESS) {
        throw new Error('Game is not in progress');
      }

      // Submit answer
      await this.gameService.submitAnswer(lobby.id, client.id, {
        playerId: client.id,
        questionId: data.questionId,
        selectedOption: data.selectedOption,
        submittedAt: Date.now(),
      });

      // Send acknowledgment to player
      client.emit('answer_submitted', {
        success: true,
        message: 'Answer submitted successfully',
      });

      this.logger.log(
        `Player ${client.id} submitted answer for question ${data.questionId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Error submitting answer: ${error.message}`);
      client.emit(GAME_CONFIG.EVENTS.ERROR, {
        message: error.message || 'Failed to submit answer',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * PLAYER INACTIVE - App went to background
   */
  @SubscribeMessage('player_inactive')
  async handlePlayerInactive(@ConnectedSocket() client: Socket) {
    try {
      const lobby = await this.lobbyService.getPlayerLobby(client.id);

      if (lobby) {
        await this.lobbyService.markPlayerInactive(client.id);
        this.logger.log(`Player ${client.id} marked as inactive`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error marking player inactive: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * PLAYER ACTIVE - App returned to foreground
   */
  @SubscribeMessage('player_active')
  async handlePlayerActive(@ConnectedSocket() client: Socket) {
    try {
      const lobby = await this.lobbyService.getPlayerLobby(client.id);

      if (lobby) {
        await this.lobbyService.markPlayerActive(client.id);
        this.logger.log(`Player ${client.id} marked as active`);

        // Send current game state
        return this.handleRequestGameState({ lobbyId: lobby.id }, client);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error marking player active: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
