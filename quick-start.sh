#!/bin/bash

# Quick Start Script for Real-time Quiz Backend
# This script helps you get up and running quickly

echo "🎮 Real-time Quiz Backend - Quick Start"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
echo "Checking Node.js..."
if command_exists node; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js ${NODE_VERSION} installed"
else
    echo -e "${RED}✗${NC} Node.js not found. Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check yarn
echo "Checking yarn..."
if command_exists yarn; then
    yarn_VERSION=$(yarn -v)
    echo -e "${GREEN}✓${NC} yarn ${yarn_VERSION} installed"
else
    echo -e "${RED}✗${NC} yarn not found"
    exit 1
fi

# Check Redis
echo "Checking Redis..."
if command_exists redis-cli; then
    echo -e "${GREEN}✓${NC} Redis CLI installed"
    
    # Try to ping Redis
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Redis server is running"
    else
        echo -e "${YELLOW}!${NC} Redis is installed but not running"
        echo "Starting Redis..."
        
        # Try to start Redis based on OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            brew services start redis
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            sudo service redis-server start
        else
            echo -e "${RED}!${NC} Please start Redis manually"
            echo "macOS: brew services start redis"
            echo "Linux: sudo service redis-server start"
            echo "Windows: Use Docker - docker run -d -p 6379:6379 redis"
            exit 1
        fi
        
        # Check again
        sleep 2
        if redis-cli ping > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Redis started successfully"
        else
            echo -e "${RED}✗${NC} Failed to start Redis"
            exit 1
        fi
    fi
else
    echo -e "${RED}✗${NC} Redis not found. Please install Redis:"
    echo "macOS: brew install redis"
    echo "Linux: sudo apt-get install redis-server"
    echo "Windows: Use Docker - docker run -d -p 6379:6379 redis"
    exit 1
fi

echo ""
echo "========================================"
echo "All prerequisites met! 🎉"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
    echo -e "${GREEN}✓${NC} Dependencies installed"
else
    echo -e "${GREEN}✓${NC} Dependencies already installed"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGIN=*
MAX_PLAYERS_PER_LOBBY=10
QUESTION_TIME_LIMIT=15
ROUND_COUNT=5
EOF
    echo -e "${GREEN}✓${NC} .env file created"
else
    echo -e "${GREEN}✓${NC} .env file exists"
fi

echo ""
echo "========================================"
echo "🚀 Starting the server..."
echo "========================================"
echo ""
echo "Server will start on: http://localhost:3000"
echo "Open test-client.html in your browser to test"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
yarn run start:dev