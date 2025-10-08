export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  createdAt: number;
  lastLogin?: number;
  stats: UserStats;
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  averageScore: number;
  bestStreak: number;
  fastestAnswer: number; // milliseconds
}
