export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number; // index of correct option
  points: number;
  category?: string;
}

export interface Answer {
  playerId: string;
  questionId: string;
  selectedOption: number;
  submittedAt: number;
}
