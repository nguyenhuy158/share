#!/usr/bin/env node

/**
 * Share MCP Server
 * Zero-dependency Model Context Protocol (MCP) server over stdio for share.huyab.click.
 *
 * Exposes two tools:
 * 1. `share_artifact`: Uploads a file (or raw content) to share.huyab.click and returns an instant preview URL.
 * 2. `list_artifacts`: Lists all your published artifacts and links.
 *
 * Config in Claude Desktop / Cursor / Windsurf (.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "share": {
 *       "command": "node",
 *       "args": ["/path/to/share/mcp/index.mjs"],
 *       "env": {
 *         "SHARE_EMAIL": "your-email@example.com",
 *         "SHARE_PASSWORD": "your-master-password"
 *       }
 *     }
 *   }
 * }
 */

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const SERVER_NAME = "share-mcp";
const SERVER_VERSION = "1.0.0";
const DEFAULT_URL = "https://share.huyab.click";

const TOOLS = [
  {
    name: "share_artifact",
    description:
      "Upload and publish an HTML mockup, single-page app, SVG, or artifact to share.huyab.click and receive an instant live preview URL.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the local file to share (e.g. ./index.html or ./dist/index.html)",
        },
        content: {
          type: "string",
          description: "Raw string content (HTML, SVG, text) if not reading from a file path",
        },
        title: {
          type: "string",
          description: "Display title for the artifact (e.g. 'Hero Banner Prototype')",
        },
        filename: {
          type: "string",
          description: "Filename with extension (e.g. 'index.html', 'chart.svg'). Defaults to index.html",
        },
        slug: {
          type: "string",
          description: "Optional stable slug identifier (e.g. 'debt-transfer-flow'). Re-uploading with the same slug or filename updates the existing artifact to a new version without changing its public URL.",
        },
        fresh: {
          type: "boolean",
          description: "Set to true if you explicitly want a brand new URL instead of updating an existing artifact.",
        },
        email: {
          type: "string",
          description: "Your Share account email (defaults to SHARE_EMAIL env var)",
        },
        password: {
          type: "string",
          description: "Your Share master password (defaults to SHARE_PASSWORD env var)",
        },
      },
    },
  },
  {
    name: "list_artifacts",
    description: "List your previously uploaded artifacts and their public preview links on share.huyab.click.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Your Share account email (defaults to SHARE_EMAIL env var)",
        },
        password: {
          type: "string",
          description: "Your Share master password (defaults to SHARE_PASSWORD env var)",
        },
      },
    },
  },
];

async function handleShareArtifact(args) {
  const email = (args.email || process.env.SHARE_EMAIL || "").trim();
  const password = (args.password || process.env.SHARE_PASSWORD || "").trim();
  const baseUrl = (process.env.SHARE_URL || DEFAULT_URL).replace(/\/$/, "");

  if (!email || !password) {
    throw new Error(
      "Missing credentials: email and master password are required. Set SHARE_EMAIL and SHARE_PASSWORD env vars or pass them as tool arguments."
    );
  }

  let content = args.content;
  let filename = args.filename || "index.html";

  if (args.filePath) {
    const resolvedPath = path.resolve(process.cwd(), args.filePath);
    content = await fs.readFile(resolvedPath, "utf-8");
    if (!args.filename) {
      filename = path.basename(resolvedPath);
    }
  }

  if (!content) {
    throw new Error("Either 'filePath' or 'content' must be provided to share an artifact.");
  }

  const title = args.title || filename;

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${password}`,
      "X-Email": email,
    },
    body: JSON.stringify({
      email,
      password,
      content,
      filename,
      title,
      slug: args.slug,
      fresh: args.fresh,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Upload failed with status ${response.status}`);
  }

  return {
    message: data.isNew ? "Artifact successfully published!" : `Artifact updated to version ${data.version}!`,
    id: data.id,
    version: data.version,
    isNew: data.isNew,
    previewUrl: data.url,
    rawUrl: data.rawUrl,
    title: data.title,
    filename: data.filename,
    size: data.size,
  };
}

async function handleListArtifacts(args) {
  const email = (args.email || process.env.SHARE_EMAIL || "").trim();
  const password = (args.password || process.env.SHARE_PASSWORD || "").trim();
  const baseUrl = (process.env.SHARE_URL || DEFAULT_URL).replace(/\/$/, "");

  if (!email || !password) {
    throw new Error("Missing credentials: set SHARE_EMAIL and SHARE_PASSWORD env vars or pass them as tool arguments.");
  }

  const response = await fetch(`${baseUrl}/api/artifacts`, {
    headers: {
      Authorization: `Bearer ${password}`,
      "X-Email": email,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch artifacts: ${response.status}`);
  }

  return (data.artifacts || []).map((art) => ({
    id: art.id,
    title: art.title,
    filename: art.filename,
    previewUrl: `${baseUrl}/artifact/${art.id}`,
    views: art.views,
    size: art.size,
    createdAt: art.created_at,
  }));
}

function sendResponse(id, result, error = null) {
  const message = {
    jsonrpc: "2.0",
    id,
  };

  if (error) {
    message.error = {
      code: error.code || -32603,
      message: error.message || "Internal error",
    };
  } else {
    message.result = result;
  }

  const output = JSON.stringify(message);
  process.stdout.write(`${output}\n`);
}

async function handleMessage(line) {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    sendResponse(null, null, { code: -32700, message: "Parse error" });
    return;
  }

  const { id, method, params } = request;

  if (method === "initialize") {
    sendResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Notification only, no response required
    return;
  }

  if (method === "ping") {
    sendResponse(id, {});
    return;
  }

  if (method === "tools/list") {
    sendResponse(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs = {} } = params || {};

    try {
      let result;
      if (name === "share_artifact") {
        result = await handleShareArtifact(toolArgs);
      } else if (name === "list_artifacts") {
        result = await handleListArtifacts(toolArgs);
      } else {
        sendResponse(id, null, { code: -32601, message: `Tool not found: ${name}` });
        return;
      }

      sendResponse(id, {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (err) {
      sendResponse(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${err.message}`,
          },
        ],
      });
    }
    return;
  }

  // Unknown method
  if (id !== undefined) {
    sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  handleMessage(line).catch((err) => {
    console.error("Error processing message:", err);
  });
});
