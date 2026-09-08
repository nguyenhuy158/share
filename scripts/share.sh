#!/usr/bin/env bash
set -euo pipefail

# share.sh — Quick upload utility for share.huyab.click
# Usage:
#   ./share.sh ./dist/index.html "My Dashboard"
#   ./share.sh ./mockup.html
# Environment variables:
#   SHARE_EMAIL: your account email (e.g. user@example.com)
#   SHARE_PASSWORD: your master password configured on share.huyab.click
#   SHARE_URL: host URL (defaults to https://share.huyab.click)

SHARE_URL="${SHARE_URL:-https://share.huyab.click}"

FILE="${1:-}"
TITLE="${2:-}"
SLUG="${3:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <path-to-file> [optional-title] [optional-slug]"
  echo "Example: $0 ./index.html 'Preview Landing Page' 'landing-page'"
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Error: File '$FILE' not found."
  exit 1
fi

EMAIL="${SHARE_EMAIL:-}"
PASSWORD="${SHARE_PASSWORD:-}"

if [[ -z "$EMAIL" ]]; then
  read -rp "Enter your email: " EMAIL
fi

if [[ -z "$PASSWORD" ]]; then
  read -rsp "Enter your master password: " PASSWORD
  echo ""
fi

echo "Uploading $FILE to $SHARE_URL..."

RESPONSE=$(curl -s -f -X POST "${SHARE_URL}/api/upload" \
  -F "email=${EMAIL}" \
  -F "password=${PASSWORD}" \
  -F "file=@${FILE}" \
  -F "title=${TITLE:-$(basename "$FILE")}" \
  -F "slug=${SLUG}")

URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*' | cut -d'"' -f4 || true)
VERSION=$(echo "$RESPONSE" | grep -o '"version":[0-9]*' | cut -d':' -f2 || true)
IS_NEW=$(echo "$RESPONSE" | grep -o '"isNew":[a-z]*' | cut -d':' -f2 || true)

if [[ -n "$URL" ]]; then
  if [[ "$IS_NEW" == "false" ]]; then
    echo "Successfully updated artifact to version ${VERSION:-2}!"
  else
    echo "Successfully published new artifact (v${VERSION:-1})!"
  fi
  echo "Public URL: $URL"
else
  echo "Server response: $RESPONSE"
fi
