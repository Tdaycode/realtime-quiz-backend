export interface Player {
  id: string;
  socketId: string;
  username: string;
  score: number;
  currentStreak: number;
  joinedAt: number;
  isReady: boolean;
}
