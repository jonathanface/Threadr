#!/bin/bash

# Script to stop mobile development environment
# This script:
# 1. Kills ngrok if running
# 2. Resets environment variables in .env to non-mobile defaults
# 3. Cleans up temporary files

set -e

NGROK_PID_FILE=".ngrok.pid"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping mobile development environment...${NC}"

# Kill ngrok if running
if [ -f $NGROK_PID_FILE ]; then
    NGROK_PID=$(cat $NGROK_PID_FILE)
    if kill -0 $NGROK_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping ngrok (PID: $NGROK_PID)...${NC}"
        kill $NGROK_PID
        echo -e "${GREEN}ngrok stopped${NC}"
    else
        echo -e "${YELLOW}ngrok PID file found but process not running${NC}"
    fi
    rm $NGROK_PID_FILE
else
    # Try to find and kill any ngrok process
    if pgrep -f "ngrok http" > /dev/null; then
        echo -e "${YELLOW}Stopping ngrok...${NC}"
        pkill -f "ngrok http"
        echo -e "${GREEN}ngrok stopped${NC}"
    else
        echo -e "${GREEN}ngrok is not running${NC}"
    fi
fi

# Reset environment variables in .env if file exists
if [ -f .env ]; then
    echo -e "${YELLOW}Resetting environment variables in .env...${NC}"

    # Create backup
    cp .env .env.mobile-backup

    # Reset mobile-specific variables to their default/local values
    # Comment out or set to false
    sed -i.bak "s|^USE_NGROK=true|USE_NGROK=false|" .env
    sed -i.bak "s|^USE_EXPO_GO=true|USE_EXPO_GO=false|" .env

    # If MODE was set to development for mobile testing, you might want to change it
    # Uncomment the line below if you want to reset MODE to staging
    # sed -i.bak "s|^MODE=development|MODE=staging|" .env

    # Remove backup files created by sed
    rm -f .env.bak

    echo -e "${GREEN}Environment variables reset${NC}"
fi

# Clean up any backup .env files from ngrok script
rm -f .env.bak

echo ""
echo -e "${GREEN}Mobile development environment stopped${NC}"
echo -e "${YELLOW}Ready to run in local/normal mode${NC}"
