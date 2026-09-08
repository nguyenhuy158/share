#!/usr/bin/env bash
set -euo pipefail

# install-skill.sh — Install the Share Artifact skill for Claude Code, Cursor, and MCP

SKILL_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skills/share-artifact" && pwd)"
MCP_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../mcp" && pwd)/index.mjs"

echo "=== Share (share.huyab.click) Agent Setup ==="
echo ""

# 1. Claude Code / Codex skill
CLAUDE_SKILL_DIR="${HOME}/.claude/skills/share-artifact"
mkdir -p "$CLAUDE_SKILL_DIR"
cp "$SKILL_SRC/SKILL.md" "$CLAUDE_SKILL_DIR/SKILL.md"
echo "✅ Installed Claude Code Skill to: $CLAUDE_SKILL_DIR/SKILL.md"

# 2. OMP skill
OMP_SKILL_DIR="${HOME}/.omp/agent/skills/share-artifact"
mkdir -p "$OMP_SKILL_DIR"
cp "$SKILL_SRC/SKILL.md" "$OMP_SKILL_DIR/SKILL.md"
echo "✅ Installed OMP / OpenCode Skill to: $OMP_SKILL_DIR/SKILL.md"

echo ""
echo "=== Cursor & Claude Desktop MCP Configuration ==="
echo "Add this to your .cursor/mcp.json or Claude Desktop configuration:"
echo ""
cat <<EOF
{
  "mcpServers": {
    "share": {
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": {
        "SHARE_EMAIL": "your-email@example.com",
        "SHARE_PASSWORD": "your-master-password"
      }
    }
  }
}
EOF
echo ""
echo "Setup complete! Make sure you set your Master Password on https://share.huyab.click first."
