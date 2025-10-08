export interface GameHistory {
  id: string;
  lobbyId: string;
  players: PlayerGameResult[];
  questions: QuestionResult[];
  startedAt: number;
  endedAt: number;
  duration: number; // milliseconds
  winner: {
    userId: string;
    username: string;
    score: number;
  };
}

export interface PlayerGameResult {
  userId: string;
  username: string;
  finalScore: number;
  rank: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageResponseTime: number;
  bestStreak: number;
}

export interface QuestionResult {
  questionId: string;
  questionText: string;
  correctAnswer: number;
  answers: {
    userId: string;
    selectedOption: number;
    isCorrect: boolean;
    responseTime: number;
    pointsEarned: number;
  }[];
}
