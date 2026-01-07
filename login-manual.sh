#!/bin/bash
# Launch Chrome for Testing manually (no automation = no Cloudflare block)
# Usage: ./login-manual.sh [profile-name] [url]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="${1:-.test-profile}"
URL="${2:-https://chatgpt.com}"

# Find Chrome for Testing
find_chrome() {
  local chrome_dir="$SCRIPT_DIR/chrome"
  if [[ -d "$chrome_dir" ]]; then
    for version in "$chrome_dir"/*/; do
      local mac_arm="$version/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      local mac_x64="$version/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      [[ -f "$mac_arm" ]] && echo "$mac_arm" && return
      [[ -f "$mac_x64" ]] && echo "$mac_x64" && return
    done
  fi
  echo ""
}

CHROME=$(find_chrome)
if [[ -z "$CHROME" ]]; then
  echo "Chrome for Testing not found. Run: npm run install-chrome"
  exit 1
fi

# Clean stale locks
rm -f "$SCRIPT_DIR/$PROFILE/SingletonLock" "$SCRIPT_DIR/$PROFILE/SingletonCookie" "$SCRIPT_DIR/$PROFILE/SingletonSocket" 2>/dev/null

echo "Launching Chrome for Testing..."
echo "Profile: $PROFILE"
echo "URL: $URL"
echo ""
echo "Log in, then close the browser when done."

"$CHROME" \
  --user-data-dir="$SCRIPT_DIR/$PROFILE" \
  --load-extension="$SCRIPT_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "$URL"

echo "Session saved to $PROFILE"
