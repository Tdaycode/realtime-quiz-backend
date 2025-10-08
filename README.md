# Real-time Quiz Backend

A scalable, low-latency multiplayer quiz application backend built with NestJS, WebSockets, and Redis.

## 🎯 Project Overview

This is a real-time quiz challenge system where players can create lobbies, join games, answer questions competitively, and see live leaderboards. Built to handle 50k+ concurrent users with minimal latency.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Scaling Strategy](#scaling-strategy)

---

## ✨ Features

### Phase 1 & 2 (Completed)
- ✅ **Lobby Management**
  - Create lobbies with unique 6-character codes
  - Join/leave lobbies with validation
  - Player ready state management
  - Automatic host migration
  - Maximum player limits (10 per lobby)

- ✅ **Real-time Communication**
  - WebSocket-based instant updates
  - Room-based broadcasting
  - Connection state management
  - Graceful disconnection handling

- ✅ **State Management**
  - Redis-backed distributed state
  - Player-lobby mapping
  - TTL-based lobby expiration (1 hour)
  - Pub/Sub ready for multi-server deployment

### Phase 3 (Coming Next)
- 🔜 Question delivery system
- 🔜 Answer validation with speed tracking
- 🔜 Scoring algorithm (accuracy + speed + streak)
- 🔜 Real-time leaderboard updates
- 🔜 Round progression logic

---

## 🛠 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: NestJS
- **Language**: TypeScript
- **WebSocket**: Socket.IO
- **Database**: Redis (state management)
- **Validation**: class-validator, class-transformer

---

## 🏗 Architecture

### High-Level Design

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Clients   │◄───────►│  NestJS API  │◄───────►│    Redis    │
│ (WebSocket) │         │  + Socket.IO │         │   (State)   │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Game Engine  │
                        │   Service    │
                        └──────────────┘
```

### Key Components

1. **LobbyGateway**: WebSocket event handlers
2. **LobbyService**: Business logic for lobby management
3. **GameService**: Quiz game logic (Phase 3)
4. **RedisService**: Distributed state management

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and yarn
- Redis server

### Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd realtime-quiz-backend

# 2. Install dependencies
yarn install

# 3. Start Redis (if not already running)
# macOS:
brew services start redis

# Linux:
sudo service redis-server start

# Windows (Docker):
docker run -d -p 6379:6379 redis

# 4. Create .env file
cp .env.example .env
# Edit .env with your configuration

# 5. Start the development server
yarn run start:dev
```

The server will start on `http://localhost:3000`

### Using the Quick Start Script

```bash
# Make the script executable
chmod +x quick-start.sh

# Run it
./quick-start.sh
```

This script will:
- Check all prerequisites
- Install dependencies
- Create .env file
- Start Redis if needed
- Launch the server

---

## 📁 Project Structure

```
src/
├── common/
│   ├── interfaces/          # TypeScript interfaces
│   │   ├── lobby.interface.ts
│   │   ├── player.interface.ts
│   │   ├── question.interface.ts
│   │   └── game-state.interface.ts
│   ├── constants/           # Game configuration
│   │   └── game.constants.ts
│   └── dto/                 # Data transfer objects
│       └── create-lobby.dto.ts
├── modules/
│   ├── lobby/               # Lobby management
│   │   ├── lobby.gateway.ts
│   │   ├── lobby.service.ts
│   │   └── lobby.module.ts
│   ├── game/                # Game logic
│   │   ├── game.service.ts
│   │   └── game.module.ts
│   └── redis/               # Redis integration
│       ├── redis.service.ts
│       └── redis.module.ts
├── data/                    # Static data
│   └── questions.data.ts
├── app.module.ts
└── main.ts
```

---

## 📡 API Documentation

### WebSocket Events

#### Client → Server

**Create Lobby**
```javascript
socket.emit('create_lobby', {
  username: string  // 2-20 characters
});
```

**Join Lobby**
```javascript
socket.emit('join_lobby', {
  lobbyId: string,   // 6-character code
  username: string   // 2-20 characters
});
```

**Mark Ready**
```javascript
socket.emit('player_ready', {
  isReady: boolean
});
```

**Leave Lobby**
```javascript
socket.emit('leave_lobby');
```

#### Server → Client

**Lobby Created**
```javascript
socket.on('lobby_created', (data) => {
  // data.lobbyId: string
  // data.gameState: GameState
});
```

**Player Joined**
```javascript
socket.on('player_joined', (data) => {
  // data.username: string
  // data.playerId: string
  // data.gameState: GameState
});
```

**Lobby Updated**
```javascript
socket.on('lobby_updated', (gameState) => {
  // gameState.players: Player[]
  // gameState.status: LobbyStatus
  // gameState.leaderboard: LeaderboardEntry[]
});
```

**Game Starting**
```javascript
socket.on('game_starting', (data) => {
  // data.countdown: number (seconds)
  // data.message: string
});
```

**Error**
```javascript
socket.on('error', (data) => {
  // data.message: string
});
```

---

## 🧪 Testing

### Using the Test Client

1. Open `test-client.html` in multiple browser windows
2. Create a lobby in one window
3. Join from other windows using the lobby code
4. Test ready states and game start

See [TESTING.md](./TESTING.md) for detailed test scenarios.

### Manual Testing with curl

```bash
# Check server health
curl http://localhost:3000

# Check Redis connection
redis-cli ping
```

### Running Unit Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn run test:watch

# Generate coverage report
yarn run test:cov
```

---

## 📈 Scaling Strategy

### Horizontal Scaling (50k+ Users)

**Current Architecture Supports:**

1. **Multiple Server Instances**
   - Stateless NestJS servers
   - Redis for shared state
   - Load balancer distributes connections

2. **Redis Pub/Sub**
   - Cross-server event broadcasting
   - Lobby state synchronization
   - Player presence management

3. **Regional Deployment**
   - Deploy servers in multiple regions
   - Redis Cluster for geo-distribution
   - Route players to nearest server

### Scaling Diagram

```
                    ┌─────────────┐
                    │Load Balancer│
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐    ┌──────────┐
    │ Server 1 │     │ Server 2 │    │ Server 3 │
    └────┬─────┘     └────┬─────┘    └────┬─────┘
         │                │               │
         └────────────────┼───────────────┘
                          ▼
                   ┌─────────────┐
                   │Redis Cluster│
                   └─────────────┘
```

### Performance Optimizations

1. **Connection Pooling**: Reuse Redis connections
2. **Message Batching**: Combine updates when possible
3. **Room-based Broadcasting**: Only send to relevant players
4. **TTL Management**: Auto-cleanup expired lobbies
5. **Compression**: Enable Socket.IO compression for large payloads

---

## 🔧 Configuration

### Environment Variables

```env
# Server
PORT=3000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS
CORS_ORIGIN=*

# Game Settings
MAX_PLAYERS_PER_LOBBY=10
QUESTION_TIME_LIMIT=15    # seconds
ROUND_COUNT=5
```

---

## 📊 Monitoring

### Key Metrics to Track

- Active WebSocket connections
- Redis memory usage
- Average lobby size
- Message latency
- Error rates
- Connection/disconnection frequency

### Logging

Server logs include:
- Connection events
- Lobby creation/joins
- Game state transitions
- Error details with stack traces

---

## 🐛 Troubleshooting

### Common Issues

**Redis Connection Failed**
```bash
# Check if Redis is running
redis-cli ping

# Start Redis
brew services start redis  # macOS
sudo service redis-server start  # Linux
```

**WebSocket Connection Refused**
- Verify server is running on correct port
- Check CORS configuration in .env
- Ensure firewall allows WebSocket connections

**Players Not Seeing Updates**
- Confirm all players are in same lobby
- Check server logs for errors
- Verify Redis is connected

---

## 🗺 Roadmap

### Phase 3: Game Engine (Next)
- [ ] Question delivery system
- [ ] Answer validation
- [ ] Scoring algorithm
- [ ] Leaderboard updates
- [ ] Round progression

### Phase 4: Advanced Features
- [ ] Power-ups and bonuses
- [ ] Custom question sets
- [ ] Tournament mode
- [ ] Replay system
- [ ] Analytics dashboard

---

## 📝 License

MIT

---

## 👥 Contributors

Built for Buildprize Backend Engineer Assessment

---

## 📞 Support

For issues and questions, please open an issue in the repository.

---

**Status**: Phase 2 Complete ✅  
**Next**: Phase 3 - Game Engine 🎮