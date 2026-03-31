#!/bin/bash

# Script to set up and run local mobile development environment
# This script:
# 1. Starts ngrok if not already running
# 2. Gets the ngrok public URL
# 3. Updates .env with ngrok URLs
# 4. Runs the backend with mobile development settings

set -e

PORT=${PORT:-8443}
NGROK_PID_FILE=".ngrok.pid"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting local mobile development environment...${NC}"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}Error: ngrok is not installed${NC}"
    echo "Please install ngrok from https://ngrok.com/download"
    exit 1
fi

# Function to get ngrok URL from API
get_ngrok_url() {
    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        # Try to get the ngrok URL from the local API
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.dev' | head -1)

        if [ ! -z "$NGROK_URL" ]; then
            echo "$NGROK_URL"
            return 0
        fi

        echo -e "${YELLOW}Waiting for ngrok to be ready (attempt $attempt/$max_attempts)...${NC}"
        sleep 1
        attempt=$((attempt + 1))
    done

    echo -e "${RED}Error: Could not get ngrok URL${NC}"
    return 1
}

# Check if ngrok is already running
if pgrep -f "ngrok http $PORT" > /dev/null; then
    echo -e "${GREEN}ngrok is already running${NC}"
else
    echo -e "${YELLOW}Starting ngrok on port $PORT...${NC}"
    ngrok http $PORT --log=stdout > /dev/null 2>&1 &
    NGROK_PID=$!
    echo $NGROK_PID > $NGROK_PID_FILE
    echo -e "${GREEN}ngrok started (PID: $NGROK_PID)${NC}"
    sleep 2
fi

# Get ngrok URL
echo -e "${YELLOW}Getting ngrok URL...${NC}"
NGROK_URL=$(get_ngrok_url)

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}Failed to get ngrok URL${NC}"
    exit 1
fi

echo -e "${GREEN}ngrok URL: $NGROK_URL${NC}"

# Update .env file with ngrok URLs if it exists
if [ -f .env ]; then
    echo -e "${YELLOW}Updating .env with ngrok URLs...${NC}"

    # Use sed to update or add the ngrok URLs
    sed -i.bak "s|^GOOGLE_OAUTH_REDIRECT_URL_NGROK=.*|GOOGLE_OAUTH_REDIRECT_URL_NGROK=$NGROK_URL/auth/google/callback|" .env
    sed -i.bak "s|^AMAZON_OAUTH_REDIRECT_URL_NGROK=.*|AMAZON_OAUTH_REDIRECT_URL_NGROK=$NGROK_URL/auth/amazon/callback|" .env

    echo -e "${GREEN}.env updated with ngrok URLs${NC}"
fi

# Display important information
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Mobile Development Setup Complete${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}ngrok URL:${NC} $NGROK_URL"
echo ""
echo -e "${YELLOW}OAuth Callback URLs (add these to your OAuth provider):${NC}"
echo "  Google: $NGROK_URL/auth/google/callback"
echo "  Amazon: $NGROK_URL/auth/amazon/callback"
echo ""
echo -e "${YELLOW}Mobile App Configuration:${NC}"
echo "  Update your mobile .env with:"
echo "  EXPO_PUBLIC_API_BASE_URL=$NGROK_URL/api"
echo ""
echo -e "${GREEN}Starting backend server...${NC}"
echo ""

# Set environment variables for mobile development
export MODE=development
export USE_NGROK=true
export USE_EXPO_GO=true

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    if [ -f $NGROK_PID_FILE ]; then
        NGROK_PID=$(cat $NGROK_PID_FILE)
        if kill -0 $NGROK_PID 2>/dev/null; then
            echo -e "${YELLOW}Stopping ngrok (PID: $NGROK_PID)...${NC}"
            kill $NGROK_PID
        fi
        rm $NGROK_PID_FILE
    fi
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

# Run the backend
./bin/threadr
