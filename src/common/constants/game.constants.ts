export const GAME_CONFIG = {
  MAX_PLAYERS: 10,
  MIN_PLAYERS: 2,
  QUESTION_TIME_LIMIT: 15000, // 15 seconds in ms
  ROUND_COUNT: 5,
  LOBBY_START_DELAY: 3000, // 3 seconds countdown

  // Scoring
  BASE_POINTS: 100,
  SPEED_BONUS_MAX: 50,
  STREAK_MULTIPLIER: 1.2,

  // Events
  EVENTS: {
    // Client to Server
    CREATE_LOBBY: 'create_lobby',
    JOIN_LOBBY: 'join_lobby',
    LEAVE_LOBBY: 'leave_lobby',
    SUBMIT_ANSWER: 'submit_answer',
    PLAYER_READY: 'player_ready',

    // Server to Client
    LOBBY_CREATED: 'lobby_created',
    LOBBY_UPDATED: 'lobby_updated',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    GAME_STARTING: 'game_starting',
    QUESTION_START: 'question_start',
    ROUND_END: 'round_end',
    GAME_END: 'game_end',
    ERROR: 'error',
    ANSWER_SUBMITTED: 'answer_submitted',
  },
};
