#!/bin/bash
# Install Claude Code Sync native messaging host for Chrome/Brave

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.threadhub.claudecodesync"

# Detect browser and set paths
if [ -d "$HOME/Library/Application Support/Google/Chrome" ]; then
  CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
fi

if [ -d "$HOME/Library/Application Support/BraveSoftware/Brave-Browser" ]; then
  BRAVE_MANIFEST_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
fi

if [ -d "$HOME/Library/Application Support/Arc" ]; then
  ARC_MANIFEST_DIR="$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
fi

# Get extension ID
echo "Enter your Thread Hub extension ID (from chrome://extensions):"
read -r EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
  echo "Error: Extension ID is required"
  exit 1
fi

# Make script executable
chmod +x "$SCRIPT_DIR/claude-code-sync.js"

# Create manifest with correct path and extension ID
MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Claude Code session sync for Thread Hub",
  "path": "$SCRIPT_DIR/claude-code-sync.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

# Install for each browser found
installed=0

if [ -n "$CHROME_MANIFEST_DIR" ]; then
  mkdir -p "$CHROME_MANIFEST_DIR"
  echo "$MANIFEST_CONTENT" > "$CHROME_MANIFEST_DIR/$HOST_NAME.json"
  echo "Installed for Chrome: $CHROME_MANIFEST_DIR/$HOST_NAME.json"
  installed=1
fi

if [ -n "$BRAVE_MANIFEST_DIR" ]; then
  mkdir -p "$BRAVE_MANIFEST_DIR"
  echo "$MANIFEST_CONTENT" > "$BRAVE_MANIFEST_DIR/$HOST_NAME.json"
  echo "Installed for Brave: $BRAVE_MANIFEST_DIR/$HOST_NAME.json"
  installed=1
fi

if [ -n "$ARC_MANIFEST_DIR" ]; then
  mkdir -p "$ARC_MANIFEST_DIR"
  echo "$MANIFEST_CONTENT" > "$ARC_MANIFEST_DIR/$HOST_NAME.json"
  echo "Installed for Arc: $ARC_MANIFEST_DIR/$HOST_NAME.json"
  installed=1
fi

if [ $installed -eq 0 ]; then
  echo "No supported browser found. Creating manifest in current directory."
  echo "$MANIFEST_CONTENT" > "$SCRIPT_DIR/$HOST_NAME.json"
  echo "Manifest created: $SCRIPT_DIR/$HOST_NAME.json"
  echo "Manually copy to your browser's NativeMessagingHosts directory."
fi

echo ""
echo "Installation complete!"
echo ""
echo "To test, run: node $SCRIPT_DIR/claude-code-sync.js --status"
echo ""
echo "Add 'nativeMessaging' permission to your extension manifest.json"
