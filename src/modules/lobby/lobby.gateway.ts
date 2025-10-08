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
})
@UsePipes(new ValidationPipe())
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LobbyGateway.name);

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

  /**
   * Handle client disconnections
   */
  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    try {
      const result = await this.lobbyService.leaveLobby(client.id);

      if (result.lobby && result.lobbyId) {
        // Notify remaining players
        const gameState = this.lobbyService.toGameState(result.lobby);
        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.PLAYER_LEFT, {
          playerId: client.id,
          gameState,
        });
        this.server
          .to(result.lobbyId)
          .emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, gameState);
      } else if (result.lobbyId) {
        // Lobby was deleted
        this.server.to(result.lobbyId).emit(GAME_CONFIG.EVENTS.LOBBY_UPDATED, {
          message: 'Lobby closed',
        });
      }
    } catch (error) {
      this.logger.error(`Error handling disconnect: ${error.message}`);
    }
  }

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
}
