export interface Player {
  id: string;
  socketId: string;
  username: string;
  score: number;
  currentStreak: number;
  joinedAt: number;
  isReady: boolean;
  answeredQuestions: Set<string>;
  streak: number;
  isDisconnected?: boolean;
  disconnectedAt?: number;
  isActive?: boolean;
  lastActiveAt?: number;
}
