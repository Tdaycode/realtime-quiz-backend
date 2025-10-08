const io = require('socket.io-client');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  SERVER_URL: 'http://localhost:3000',
  TOTAL_USERS: 1000, // Start small, increase gradually: 100 → 1000 → 5000 → 10000
  USERS_PER_SECOND: 50, // Ramp up rate
  LOBBIES: 10, // Number of concurrent lobbies
  PLAYERS_PER_LOBBY: 6, // Average players per lobby
  TEST_DURATION_MINUTES: 5,
};

// Metrics
const metrics = {
  connected: 0,
  disconnected: 0,
  lobbiesCreated: 0,
  playersJoined: 0,
  questionsAnswered: 0,
  gamesCompleted: 0,
  errors: 0,
  latencies: [],
  startTime: Date.now(),
};

// Active connections
const connections = [];
const lobbyCodes = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${color}[${new Date().toLocaleTimeString()}]${colors.reset} ${message}`);
}

// Create a simulated user
function createUser(userId, delayMs = 0) {
  setTimeout(() => {
    const startConnect = performance.now();
    
    const socket = io(CONFIG.SERVER_URL, {
      transports: ['websocket'],
      reconnection: false, // Don't auto-reconnect for load testing
    });

    const user = {
      id: userId,
      socket,
      username: `User${userId}`,
      lobbyId: null,
      currentQuestion: null,
    };

    // Connection successful
    socket.on('connect', () => {
      const latency = performance.now() - startConnect;
      metrics.connected++;
      metrics.latencies.push(latency);
      
      log(colors.green, `✓ User${userId} connected (${latency.toFixed(0)}ms)`);
      
      // Decide if this user creates or joins a lobby
      if (lobbyCodes.length < CONFIG.LOBBIES || Math.random() < 0.3) {
        createLobby(user);
      } else {
        joinRandomLobby(user);
      }
    });

    // Connection error
    socket.on('connect_error', (error) => {
      metrics.errors++;
      log(colors.red, `✗ User${userId} connection failed: ${error.message}`);
    });

    // Lobby created
    socket.on('lobby_created', (data) => {
      user.lobbyId = data.lobbyId;
      lobbyCodes.push(data.lobbyId);
      metrics.lobbiesCreated++;
      log(colors.cyan, `✓ User${userId} created lobby ${data.lobbyId}`);
      
      // Auto-ready after 1-2 seconds
      setTimeout(() => {
        socket.emit('player_ready', { isReady: true });
      }, 1000 + Math.random() * 1000);
    });

    // Player joined
    socket.on('player_joined', () => {
      metrics.playersJoined++;
    });

    // Question received
    socket.on('question_start', (data) => {
      user.currentQuestion = data.question;
      
      // Simulate thinking time (1-10 seconds)
      const thinkTime = 1000 + Math.random() * 9000;
      
      setTimeout(() => {
        if (user.currentQuestion) {
          // Submit random answer
          const randomOption = Math.floor(Math.random() * 4);
          socket.emit('submit_answer', {
            questionId: user.currentQuestion.id,
            selectedOption: randomOption,
          });
          metrics.questionsAnswered++;
          user.currentQuestion = null;
        }
      }, thinkTime);
    });

    // Game ended
    socket.on('game_end', () => {
      metrics.gamesCompleted++;
      log(colors.blue, `✓ User${userId} completed game in lobby ${user.lobbyId}`);
      
      // Disconnect after game
      setTimeout(() => {
        socket.disconnect();
      }, 2000);
    });

    // Error handling
    socket.on('error', (data) => {
      metrics.errors++;
      log(colors.red, `✗ User${userId} error: ${data.message}`);
    });

    // Disconnection
    socket.on('disconnect', () => {
      metrics.disconnected++;
    });

    connections.push(user);
  }, delayMs);
}

// Create a lobby
function createLobby(user) {
  user.socket.emit('create_lobby', {
    username: user.username,
  });
}

// Join a random existing lobby
function joinRandomLobby(user) {
  if (lobbyCodes.length === 0) {
    createLobby(user);
    return;
  }

  const randomLobby = lobbyCodes[Math.floor(Math.random() * lobbyCodes.length)];
  user.socket.emit('join_lobby', {
    lobbyId: randomLobby,
    username: user.username,
  });
  
  // Auto-ready after 1-2 seconds
  setTimeout(() => {
    user.socket.emit('player_ready', { isReady: true });
  }, 1000 + Math.random() * 1000);
}

// Display metrics periodically
function displayMetrics() {
  console.clear();
  
  const runningTime = ((Date.now() - metrics.startTime) / 1000).toFixed(0);
  const avgLatency = metrics.latencies.length > 0 
    ? (metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length).toFixed(2)
    : 0;
  const maxLatency = metrics.latencies.length > 0
    ? Math.max(...metrics.latencies).toFixed(2)
    : 0;
  const minLatency = metrics.latencies.length > 0
    ? Math.min(...metrics.latencies).toFixed(2)
    : 0;

  console.log('\n' + '='.repeat(70));
  console.log('  🎮 REAL-TIME QUIZ BACKEND - LOAD TEST DASHBOARD');
  console.log('='.repeat(70));
  console.log(`\n⏱️  Running Time: ${runningTime}s / ${CONFIG.TEST_DURATION_MINUTES * 60}s`);
  console.log(`\n📊 CONNECTION STATS:`);
  console.log(`  • Target Users:      ${CONFIG.TOTAL_USERS.toLocaleString()}`);
  console.log(`  • Connected:         ${colors.green}${metrics.connected.toLocaleString()}${colors.reset}`);
  console.log(`  • Disconnected:      ${metrics.disconnected.toLocaleString()}`);
  console.log(`  • Active:            ${colors.cyan}${(metrics.connected - metrics.disconnected).toLocaleString()}${colors.reset}`);
  console.log(`  • Errors:            ${metrics.errors > 0 ? colors.red : colors.green}${metrics.errors}${colors.reset}`);
  
  console.log(`\n🎯 GAME STATS:`);
  console.log(`  • Lobbies Created:   ${metrics.lobbiesCreated}`);
  console.log(`  • Players Joined:    ${metrics.playersJoined.toLocaleString()}`);
  console.log(`  • Questions Answered: ${metrics.questionsAnswered.toLocaleString()}`);
  console.log(`  • Games Completed:   ${metrics.gamesCompleted}`);
  
  console.log(`\n⚡ PERFORMANCE:`);
  console.log(`  • Avg Latency:       ${avgLatency}ms`);
  console.log(`  • Min Latency:       ${minLatency}ms`);
  console.log(`  • Max Latency:       ${maxLatency}ms`);
  console.log(`  • Messages/sec:      ${(metrics.questionsAnswered / (runningTime || 1)).toFixed(2)}`);
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// Main execution
async function runLoadTest() {
  log(colors.blue, `🚀 Starting load test with ${CONFIG.TOTAL_USERS} users...`);
  log(colors.yellow, `📈 Ramping up at ${CONFIG.USERS_PER_SECOND} users/second`);
  log(colors.yellow, `⏱️  Test duration: ${CONFIG.TEST_DURATION_MINUTES} minutes\n`);

  // Display metrics every 2 seconds
  const metricsInterval = setInterval(displayMetrics, 2000);

  // Ramp up users gradually
  const delayBetweenUsers = 1000 / CONFIG.USERS_PER_SECOND;
  
  for (let i = 1; i <= CONFIG.TOTAL_USERS; i++) {
    createUser(i, i * delayBetweenUsers);
  }

  // Run for specified duration
  setTimeout(() => {
    log(colors.blue, '\n🏁 Test completed! Disconnecting all users...');
    
    // Disconnect all users
    connections.forEach((user) => {
      if (user.socket.connected) {
        user.socket.disconnect();
      }
    });

    clearInterval(metricsInterval);
    
    // Final report
    setTimeout(() => {
      displayMetrics();
      displayFinalReport();
      process.exit(0);
    }, 3000);
  }, CONFIG.TEST_DURATION_MINUTES * 60 * 1000);
}

// Final report
function displayFinalReport() {
  console.log('\n' + '='.repeat(70));
  console.log('  📋 FINAL REPORT');
  console.log('='.repeat(70));
  
  const totalTime = ((Date.now() - metrics.startTime) / 1000).toFixed(2);
  const successRate = ((metrics.connected / CONFIG.TOTAL_USERS) * 100).toFixed(2);
  const errorRate = ((metrics.errors / CONFIG.TOTAL_USERS) * 100).toFixed(2);
  
  console.log(`\n✅ SUCCESS METRICS:`);
  console.log(`  • Connection Success Rate: ${successRate}%`);
  console.log(`  • Total Connections:       ${metrics.connected.toLocaleString()}`);
  console.log(`  • Games Completed:         ${metrics.gamesCompleted}`);
  console.log(`  • Total Questions Answered: ${metrics.questionsAnswered.toLocaleString()}`);
  
  console.log(`\n❌ ERROR METRICS:`);
  console.log(`  • Error Rate:              ${errorRate}%`);
  console.log(`  • Total Errors:            ${metrics.errors}`);
  
  console.log(`\n⚡ PERFORMANCE SUMMARY:`);
  const avgLatency = (metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length).toFixed(2);
  console.log(`  • Average Latency:         ${avgLatency}ms`);
  console.log(`  • Peak Concurrent Users:   ${metrics.connected - metrics.disconnected}`);
  console.log(`  • Messages/sec (avg):      ${(metrics.questionsAnswered / totalTime).toFixed(2)}`);
  console.log(`  • Total Test Duration:     ${totalTime}s`);
  
  // Pass/Fail criteria
  console.log(`\n🎯 TEST CRITERIA:`);
  const latencyPass = avgLatency < 100;
  const successPass = successRate > 95;
  const errorPass = errorRate < 5;
  
  console.log(`  • Latency < 100ms:         ${latencyPass ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset} (${avgLatency}ms)`);
  console.log(`  • Success Rate > 95%:      ${successPass ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset} (${successRate}%)`);
  console.log(`  • Error Rate < 5%:         ${errorPass ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset} (${errorRate}%)`);
  
  const overallPass = latencyPass && successPass && errorPass;
  console.log(`\n  ${overallPass ? colors.green + '✓✓✓ OVERALL: PASS' : colors.red + '✗✗✗ OVERALL: FAIL'}${colors.reset}`);
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log(colors.yellow, '\n⚠️  Interrupted! Disconnecting users...');
  connections.forEach((user) => {
    if (user.socket.connected) {
      user.socket.disconnect();
    }
  });
  displayFinalReport();
  process.exit(0);
});

// Start the test
runLoadTest();