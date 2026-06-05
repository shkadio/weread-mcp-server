/**
 * WeRead (微信读书) MCP Server
 *
 * Exposes WeRead Agent API as MCP tools for AI assistants.
 *
 * API Docs: https://i.weread.qq.com/api/agent/gateway (see weread_api_doc.md)
 * Auth: Bearer token via WEREAD_API_KEY environment variable
 */

// Load .env file before anything else (silent — no error if file missing)
import "dotenv/config";

import { createServer, IncomingMessage, ServerResponse } from "http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.3";

function getApiKey(): string {
  const key = process.env.WEREAD_API_KEY;
  if (!key) {
    throw new Error(
      "WEREAD_API_KEY environment variable is required.\n" +
        "Set it via:\n" +
        "  - Create a .env file in the project root with: WEREAD_API_KEY=wrk-xxxxxxxx\n" +
        "  - Or export it: export WEREAD_API_KEY=wrk-xxxxxxxx"
    );
  }
  if (!key.startsWith("wrk-")) {
    throw new Error("WEREAD_API_KEY must start with 'wrk-'");
  }
  return key;
}

// ---------------------------------------------------------------------------
// WeRead API client
// ---------------------------------------------------------------------------

interface WeReadResponse {
  [key: string]: unknown;
  upgrade_info?: { message: string };
}

async function callWeRead(
  apiName: string,
  params: Record<string, unknown> = {}
): Promise<WeReadResponse> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    api_name: apiName,
    skill_version: SKILL_VERSION,
    ...params,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      `WeRead API error: ${response.status} ${response.statusText}`
    );
  }

  const data: WeReadResponse = await response.json();

  // Handle version upgrade notification
  if (data.upgrade_info) {
    console.error(
      "[upgrade]",
      data.upgrade_info.message || "A new skill version is available."
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "weread_search",
    description:
      "Search WeRead book store. Searches for ebooks, web novels, audiobooks, authors, etc. Returns results grouped by type.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Search keyword, e.g. '三体', '百年孤独'",
        },
        scope: {
          type: "number",
          description:
            "Search scope: 0=all, 10=ebooks (default), 16=web novels, 14=audiobooks, 6=author, 12=full text, 13=booklists, 2=public accounts, 4=articles",
          default: 10,
        },
        count: {
          type: "number",
          description: "Results per page",
          default: 15,
        },
        maxIdx: {
          type: "number",
          description: "Pagination offset",
          default: 0,
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "weread_shelf_sync",
    description:
      "Get the current user's bookshelf. Returns ebooks, audiobooks/albums, and article collections with reading status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "weread_book_info",
    description:
      "Get detailed book information including title, author, publisher, ISBN, rating, word count, description, etc.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID (e.g. '3300045871')",
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_chapter_info",
    description:
      "Get the chapter directory structure of a book. Returns chapter UIDs, titles, word counts, and pricing info.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_reading_progress",
    description:
      "Get reading progress for a book. Returns progress percentage, current chapter, reading time, and completion status.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_notebooks",
    description:
      "Get overview of all books with notes/highlights. Returns total note count per book and pagination cursor.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Results per page (default 20)",
          default: 20,
        },
        lastSort: {
          type: "number",
          description:
            "Pagination cursor from the last item's 'sort' field. Omit for first page.",
        },
      },
    },
  },
  {
    name: "weread_bookmarks",
    description:
      "Get all highlights/bookmarks for a book. Returns highlighted text with chapter location and creation time.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_my_reviews",
    description:
      "Get the current user's personal notes and reviews for a specific book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID (sent as 'bookid' — lowercase)",
        },
        count: {
          type: "number",
          description: "Results per page (default 20)",
          default: 20,
        },
        synckey: {
          type: "number",
          description: "Pagination cursor (default 0)",
          default: 0,
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_best_bookmarks",
    description:
      "Get the most popular highlights for a book (with original text). Returns top 20 by popularity, sorted by heat.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
        chapterUid: {
          type: "number",
          description:
            "Chapter UID (0 for all chapters, default 0)",
          default: 0,
        },
        synckey: {
          type: "number",
          description: "Sync key (default 0)",
          default: 0,
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_underlines",
    description:
      "Get underline highlight heat statistics for a chapter. Shows how many people highlighted each passage (without original text).",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
        chapterUid: {
          type: "number",
          description: "Chapter UID from chapter info",
        },
        synckey: {
          type: "number",
          description: "Sync key (default 0)",
          default: 0,
        },
      },
      required: ["bookId", "chapterUid"],
    },
  },
  {
    name: "weread_read_reviews",
    description:
      "Get comments and thoughts on specific highlight passages in a book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
        chapterUid: {
          type: "number",
          description: "Chapter UID",
        },
        reviews: {
          type: "array",
          description:
            "Array of underline ranges to query comments for",
          items: {
            type: "object",
            properties: {
              range: {
                type: "string",
                description:
                  "Range string like '900-2004'",
              },
              maxIdx: {
                type: "number",
                description: "Pagination offset",
              },
              count: {
                type: "number",
                description: "Results per page (max 20)",
              },
            },
            required: ["range"],
          },
        },
      },
      required: ["bookId", "chapterUid", "reviews"],
    },
  },
  {
    name: "weread_review_detail",
    description:
      "Get details of a single review/thought, including comments and likes.",
    inputSchema: {
      type: "object",
      properties: {
        reviewId: {
          type: "string",
          description: "Review ID",
        },
        commentsCount: {
          type: "number",
          description: "Number of comments to return (default 10)",
          default: 10,
        },
        likesCount: {
          type: "number",
          description: "Number of likes to return (default 10)",
          default: 10,
        },
      },
      required: ["reviewId"],
    },
  },
  {
    name: "weread_public_reviews",
    description:
      "Get public reviews for a book. Can filter by rating type and supports pagination.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID",
        },
        reviewListType: {
          type: "number",
          description:
            "Filter: 0=all, 1=positive, 2=negative, 3=latest, 4=neutral (default 0)",
          default: 0,
        },
        count: {
          type: "number",
          description: "Results per page (default 20)",
          default: 20,
        },
        maxIdx: {
          type: "number",
          description: "Pagination offset (default 0)",
          default: 0,
        },
        synckey: {
          type: "number",
          description: "Pagination cursor (default 0)",
          default: 0,
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_reading_stats",
    description:
      "Get reading statistics for the current user. Supports weekly, monthly, yearly, or overall stats including reading time, days, rankings, category preferences, and more.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description:
            "Statistics dimension: 'weekly'=this week, 'monthly'=this month (default), 'annually'=this year, 'overall'=all time",
          default: "monthly",
          enum: ["weekly", "monthly", "annually", "overall"],
        },
        baseTime: {
          type: "number",
          description:
            "Base timestamp (Unix seconds). 0 = current period. For past periods, pass the period start timestamp. e.g. 1735689600 for 2025-01-01 00:00:00 UTC",
          default: 0,
        },
      },
    },
  },
  {
    name: "weread_recommend",
    description:
      "Get personalized book recommendations based on the user's reading history.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Results per page (default 12)",
          default: 12,
        },
        maxIdx: {
          type: "number",
          description: "Pagination offset (default 0)",
          default: 0,
        },
      },
    },
  },
  {
    name: "weread_similar_books",
    description:
      "Get similar book recommendations based on a specific book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          description: "Book ID to find similar books for",
        },
        count: {
          type: "number",
          description: "Results per page (default 12)",
          default: 12,
        },
        maxIdx: {
          type: "number",
          description: "Pagination offset",
        },
        sessionId: {
          type: "string",
          description: "Session ID for pagination",
        },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_url_schema",
    description:
      "Generate WeRead deep link URLs to open books, chapters, or highlights in the WeRead app. Does NOT make any API call — constructs URLs locally.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Link type: 'book' (open book), 'chapter' (open chapter), 'highlight' (open highlight location)",
          enum: ["book", "chapter", "highlight"],
        },
        bookId: {
          type: "string",
          description: "Book ID",
        },
        chapterUid: {
          type: "number",
          description: "Chapter UID (required for 'chapter' and 'highlight' type)",
        },
        rangeStart: {
          type: "number",
          description: "Range start number from highlight range (required for 'highlight' type)",
        },
        rangeEnd: {
          type: "number",
          description: "Range end number from highlight range (required for 'highlight' type)",
        },
        userVid: {
          type: "number",
          description: "User VID (optional, for 'highlight' type)",
        },
      },
      required: ["type", "bookId"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Maps user-facing parameter names to the actual API field names when they differ.
 * e.g. weread_my_reviews takes `bookId` but sends `bookid` to the API.
 */
const API_FIELD_ALIASES: Record<string, Record<string, string>> = {
  weread_my_reviews: { bookId: "bookid" },
};

function buildApiParams(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const aliases = API_FIELD_ALIASES[toolName];
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    params[aliases?.[key] ?? key] = value;
  }
  return params;
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: string; text: string }[] }> {
  let data: WeReadResponse;

  switch (name) {
    case "weread_search":
      data = await callWeRead("/store/search", {
        keyword: args.keyword,
        scope: args.scope ?? 10,
        count: args.count ?? 15,
        maxIdx: args.maxIdx ?? 0,
      });
      break;

    case "weread_shelf_sync":
      data = await callWeRead("/shelf/sync");
      break;

    case "weread_book_info":
      data = await callWeRead("/book/info", {
        bookId: args.bookId,
      });
      break;

    case "weread_chapter_info":
      data = await callWeRead("/book/chapterinfo", {
        bookId: args.bookId,
      });
      break;

    case "weread_reading_progress":
      data = await callWeRead("/book/getprogress", {
        bookId: args.bookId,
      });
      break;

    case "weread_notebooks": {
      const nbParams: Record<string, unknown> = {};
      if (args.count !== undefined) nbParams.count = args.count;
      if (args.lastSort !== undefined) nbParams.lastSort = args.lastSort;
      data = await callWeRead("/user/notebooks", nbParams);
      break;
    }

    case "weread_bookmarks":
      data = await callWeRead("/book/bookmarklist", {
        bookId: args.bookId,
      });
      break;

    case "weread_my_reviews": {
      const mrParams: Record<string, unknown> = {
        bookid: args.bookId,
      };
      if (args.count !== undefined) mrParams.count = args.count;
      if (args.synckey !== undefined) mrParams.synckey = args.synckey;
      data = await callWeRead("/review/list/mine", mrParams);
      break;
    }

    case "weread_best_bookmarks":
      data = await callWeRead("/book/bestbookmarks", {
        bookId: args.bookId,
        chapterUid: args.chapterUid ?? 0,
        synckey: args.synckey ?? 0,
      });
      break;

    case "weread_underlines":
      data = await callWeRead("/book/underlines", {
        bookId: args.bookId,
        chapterUid: args.chapterUid,
        synckey: args.synckey ?? 0,
      });
      break;

    case "weread_read_reviews":
      data = await callWeRead("/book/readreviews", {
        bookId: args.bookId,
        chapterUid: args.chapterUid,
        reviews: args.reviews,
      });
      break;

    case "weread_review_detail":
      data = await callWeRead("/review/single", {
        reviewId: args.reviewId,
        commentsCount: args.commentsCount ?? 10,
        likesCount: args.likesCount ?? 10,
      });
      break;

    case "weread_public_reviews":
      data = await callWeRead("/review/list", {
        bookId: args.bookId,
        reviewListType: args.reviewListType ?? 0,
        count: args.count ?? 20,
        maxIdx: args.maxIdx ?? 0,
        synckey: args.synckey ?? 0,
      });
      break;

    case "weread_reading_stats":
      data = await callWeRead("/readdata/detail", {
        mode: args.mode ?? "monthly",
        baseTime: args.baseTime ?? 0,
      });
      break;

    case "weread_recommend":
      data = await callWeRead("/book/recommend", {
        count: args.count ?? 12,
        maxIdx: args.maxIdx ?? 0,
      });
      break;

    case "weread_similar_books": {
      const sbParams: Record<string, unknown> = {
        bookId: args.bookId,
      };
      if (args.count !== undefined) sbParams.count = args.count;
      if (args.maxIdx !== undefined) sbParams.maxIdx = args.maxIdx;
      if (args.sessionId !== undefined) sbParams.sessionId = args.sessionId;
      data = await callWeRead("/book/similar", sbParams);
      break;
    }

    case "weread_url_schema": {
      // This tool does NOT call the API — it constructs deep-link URLs locally.
      const { type, bookId, chapterUid, rangeStart, rangeEnd, userVid } =
        args as Record<string, any>;
      let url = "";
      switch (type) {
        case "book":
          url = `weread://reading?bId=${bookId}`;
          break;
        case "chapter":
          url = `weread://reading?bId=${bookId}&chapterUid=${chapterUid}`;
          break;
        case "highlight":
          url =
            `weread://bestbookmark?bookId=${bookId}&chapterUid=${chapterUid}` +
            `&rangeStart=${rangeStart}&rangeEnd=${rangeEnd}` +
            (userVid !== undefined ? `&userVid=${userVid}` : "");
          break;
      }
      return {
        content: [{ type: "text", text: url }],
      };
    }

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
  }

  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// MCP Server factory
// ---------------------------------------------------------------------------

function createMcpServer(): Server {
  const server = new Server(
    {
      name: "weread-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments ?? {};

    // Validate that the tool exists
    const toolDef = TOOLS.find((t) => t.name === toolName);
    if (!toolDef) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${toolName}`
      );
    }

    return await handleToolCall(
      toolName,
      toolArgs as Record<string, unknown>
    );
  });

  return server;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments:
 *   --sse            start in HTTP SSE mode (default port 3100)
 *   --port <number>  port for SSE mode (implies --sse)
 *   (no args)        stdio mode (default, backward compatible)
 */
function parseArgs(): { mode: "stdio" | "sse"; port: number } {
  const args = process.argv.slice(2);
  let mode: "stdio" | "sse" = "stdio";
  let port = 3100;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--sse":
        mode = "sse";
        break;
      case "--port":
        mode = "sse";
        port = parseInt(args[++i], 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error("[weread-mcp-server] Invalid port:", args[i]);
          process.exit(1);
        }
        break;
      case "--help":
      case "-h":
        console.log(`
WeRead MCP Server — 微信读书 MCP 工具服务器

Usage:
  node dist/index.js              # stdio 模式（默认，用于 Claude Code / VS Code）
  node dist/index.js --sse        # SSE/HTTP 模式（用于 Dify 等 Web 端）
  node dist/index.js --port 8080  # 指定端口（隐含 --sse）

Environment:
  WEREAD_API_KEY    API Key（必填，也可放 .env 文件）
`);
        process.exit(0);
        break;
    }
  }

  return { mode, port };
}

async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[weread-mcp-server] ✅ Ready on stdio.");
}

async function startSSE(port: number): Promise<void> {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST") {
      res.writeHead(405); res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    try {
      const msg = JSON.parse(body);
      const result = await handleMcpMessage(msg);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message },
        id: null,
      }));
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, "0.0.0.0", () => {
      console.error(`[weread-mcp-server] ✅ HTTP server listening on http://0.0.0.0:${port}`);
      console.error(`[weread-mcp-server]    Dify MCP 地址: http://host.docker.internal:${port}/`);
      resolve();
    });
    httpServer.on("error", reject);
  });
}

/**
 * Handle an MCP JSON-RPC message directly, bypassing SDK transport layer.
 */
async function handleMcpMessage(msg: any): Promise<any> {
  const id = msg.id ?? null;
  const method = msg.method;
  const params = msg.params ?? {};

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "weread-mcp-server", version: "1.0.0" },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };

    case "tools/call": {
      try {
        const content = await handleToolCall(params.name, params.arguments ?? {});
        return { jsonrpc: "2.0", id, result: { content: content.content } };
      } catch (err: any) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: err.message },
        };
      }
    }

    case "notifications/initialized":
      return { jsonrpc: "2.0", id: null, result: null };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

async function main() {
  // Validate API key at startup
  try {
    getApiKey();
    console.error("[weread-mcp-server] WEREAD_API_KEY found.");
  } catch {
    console.error(
      "[weread-mcp-server] WEREAD_API_KEY not set. Tools will fail until it is configured."
    );
  }

  const { mode, port } = parseArgs();
  console.error(`[weread-mcp-server] Mode: ${mode}${mode === "sse" ? ` (port ${port})` : ""}`);

  if (mode === "sse") {
    await startSSE(port);
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error("[weread-mcp-server] Fatal:", err);
  process.exit(1);
});
