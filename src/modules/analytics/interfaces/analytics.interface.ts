export interface SystemMetrics {
  timestamp: number;
  activeConnections: number;
  activeLobbies: number;
  activePlayers: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
}

export interface GameMetrics {
  totalGamesPlayed: number;
  averageGameDuration: number;
  averagePlayersPerGame: number;
  mostPopularCategory: string;
  peakConcurrentGames: number;
}

export interface PlayerMetrics {
  totalPlayers: number;
  activePlayersToday: number;
  averageSessionDuration: number;
  retentionRate: {
    day1: number;
    day7: number;
    day30: number;
  };
}
