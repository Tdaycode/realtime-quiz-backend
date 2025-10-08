import { LobbyStatus } from './lobby.interface';
import { Player } from './player.interface';

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  score: number;
  streak: number;
  rank: number;
}

export interface RoundResult {
  questionId: string;
  correctAnswer: number;
  leaderboard: LeaderboardEntry[];
  roundNumber: number;
}

export interface GameState {
  lobbyId: string;
  status: LobbyStatus;
  currentRound: number;
  totalRounds: number;
  players: Player[];
  leaderboard: LeaderboardEntry[];
}
