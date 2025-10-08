import { Player } from './player.interface';
import { Question } from './question.interface';

export enum LobbyStatus {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
}

export interface Lobby {
  id: string;
  hostId: string;
  players: Map<string, Player>;
  status: LobbyStatus;
  currentRound: number;
  totalRounds: number;
  currentQuestion?: Question;
  questionStartTime?: number;
  createdAt: number;
}
