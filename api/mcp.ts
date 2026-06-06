/**
 * WeRead MCP Server — Vercel Serverless Function
 *
 * 部署说明：
 * 1. 在 Vercel Dashboard 中设置 WEREAD_API_KEY 环境变量
 * 2. 部署后 MCP URL 为：https://<你的域名>.vercel.app/api/mcp
 * 3. 在 Dify 中配置 MCP HTTP 为此 URL
 *
 * 本地测试：vercel dev
 */

// ---------------------------------------------------------------------------
// WeRead API client
// ---------------------------------------------------------------------------
const WR_API_URL = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.3";

function getApiKey(): string {
  const key = process.env.WEREAD_API_KEY;
  if (!key) {
    throw new Error("WEREAD_API_KEY environment variable is not set in Vercel");
  }
  return key;
}

async function callWeRead(
  apiName: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    api_name: apiName,
    skill_version: SKILL_VERSION,
    ...params,
  };

  const response = await fetch(WR_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`WeRead API error: ${response.status}`);
  }

  return await response.json();
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
        keyword: { type: "string", description: "Search keyword, e.g. '三体', '百年孤独'" },
        scope: { type: "number", description: "Search scope: 0=all, 10=ebooks, 16=web novels, 14=audiobooks", default: 10 },
        count: { type: "number", description: "Results per page", default: 15 },
        maxIdx: { type: "number", description: "Pagination offset", default: 0 },
      },
      required: ["keyword"],
    },
  },
  {
    name: "weread_shelf_sync",
    description:
      "Get the current user's bookshelf. Returns ebooks, audiobooks/albums, and article collections with reading status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "weread_book_info",
    description:
      "Get detailed book information including title, author, publisher, ISBN, rating, word count, description, etc.",
    inputSchema: {
      type: "object",
      properties: { bookId: { type: "string", description: "Book ID (e.g. '3300045871')" } },
      required: ["bookId"],
    },
  },
  {
    name: "weread_chapter_info",
    description: "Get the chapter directory structure of a book.",
    inputSchema: {
      type: "object",
      properties: { bookId: { type: "string", description: "Book ID" } },
      required: ["bookId"],
    },
  },
  {
    name: "weread_reading_progress",
    description: "Get reading progress for a book.",
    inputSchema: {
      type: "object",
      properties: { bookId: { type: "string", description: "Book ID" } },
      required: ["bookId"],
    },
  },
  {
    name: "weread_notebooks",
    description: "Get overview of all books with notes/highlights.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Results per page", default: 20 },
        lastSort: { type: "number", description: "Pagination cursor" },
      },
    },
  },
  {
    name: "weread_bookmarks",
    description: "Get all highlights/bookmarks for a book.",
    inputSchema: {
      type: "object",
      properties: { bookId: { type: "string", description: "Book ID" } },
      required: ["bookId"],
    },
  },
  {
    name: "weread_my_reviews",
    description: "Get the current user's personal notes and reviews for a specific book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        count: { type: "number", description: "Results per page", default: 20 },
        synckey: { type: "number", description: "Pagination cursor", default: 0 },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_best_bookmarks",
    description: "Get the most popular highlights for a book (with original text).",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        chapterUid: { type: "number", description: "Chapter UID (0=all)", default: 0 },
        synckey: { type: "number", description: "Sync key", default: 0 },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_underlines",
    description: "Get underline highlight heat statistics for a chapter (without original text).",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        chapterUid: { type: "number", description: "Chapter UID" },
        synckey: { type: "number", description: "Sync key", default: 0 },
      },
      required: ["bookId", "chapterUid"],
    },
  },
  {
    name: "weread_read_reviews",
    description: "Get comments and thoughts on specific highlight passages in a book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        chapterUid: { type: "number", description: "Chapter UID" },
        reviews: {
          type: "array",
          description: "Array of underline ranges to query comments for",
          items: {
            type: "object",
            properties: {
              range: { type: "string", description: "Range string like '900-2004'" },
              maxIdx: { type: "number", description: "Pagination offset" },
              count: { type: "number", description: "Results per page (max 20)" },
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
    description: "Get details of a single review/thought, including comments and likes.",
    inputSchema: {
      type: "object",
      properties: {
        reviewId: { type: "string", description: "Review ID" },
        commentsCount: { type: "number", description: "Comments count", default: 10 },
        likesCount: { type: "number", description: "Likes count", default: 10 },
      },
      required: ["reviewId"],
    },
  },
  {
    name: "weread_public_reviews",
    description: "Get public reviews for a book. Can filter by rating type and supports pagination.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        reviewListType: { type: "number", description: "0=all, 1=positive, 2=negative, 3=latest", default: 0 },
        count: { type: "number", description: "Results per page", default: 20 },
        maxIdx: { type: "number", description: "Pagination offset", default: 0 },
        synckey: { type: "number", description: "Pagination cursor", default: 0 },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_reading_stats",
    description: "Get reading statistics for the current user.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", description: "weekly, monthly, annually, overall", default: "monthly", enum: ["weekly", "monthly", "annually", "overall"] },
        baseTime: { type: "number", description: "Base timestamp (Unix seconds)", default: 0 },
      },
    },
  },
  {
    name: "weread_recommend",
    description: "Get personalized book recommendations based on the user's reading history.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Results per page", default: 12 },
        maxIdx: { type: "number", description: "Pagination offset", default: 0 },
      },
    },
  },
  {
    name: "weread_similar_books",
    description: "Get similar book recommendations based on a specific book.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "Book ID" },
        count: { type: "number", description: "Results per page", default: 12 },
        maxIdx: { type: "number", description: "Pagination offset" },
        sessionId: { type: "string", description: "Session ID for pagination" },
      },
      required: ["bookId"],
    },
  },
  {
    name: "weread_url_schema",
    description: "Generate WeRead deep link URLs to open books, chapters, or highlights in the WeRead app.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "book, chapter, highlight", enum: ["book", "chapter", "highlight"] },
        bookId: { type: "string", description: "Book ID" },
        chapterUid: { type: "number", description: "Chapter UID" },
        rangeStart: { type: "number", description: "Range start" },
        rangeEnd: { type: "number", description: "Range end" },
        userVid: { type: "number", description: "User VID" },
      },
      required: ["type", "bookId"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: string; text: string }[] }> {
  let data: Record<string, unknown>;

  switch (name) {
    case "weread_search":
      data = await callWeRead("/store/search", { keyword: args.keyword, scope: args.scope ?? 10, count: args.count ?? 15, maxIdx: args.maxIdx ?? 0 });
      break;
    case "weread_shelf_sync":
      data = await callWeRead("/shelf/sync");
      break;
    case "weread_book_info":
      data = await callWeRead("/book/info", { bookId: args.bookId });
      break;
    case "weread_chapter_info":
      data = await callWeRead("/book/chapterinfo", { bookId: args.bookId });
      break;
    case "weread_reading_progress":
      data = await callWeRead("/book/getprogress", { bookId: args.bookId });
      break;
    case "weread_notebooks": {
      const nb: Record<string, unknown> = {};
      if (args.count !== undefined) nb.count = args.count;
      if (args.lastSort !== undefined) nb.lastSort = args.lastSort;
      data = await callWeRead("/user/notebooks", nb);
      break;
    }
    case "weread_bookmarks":
      data = await callWeRead("/book/bookmarklist", { bookId: args.bookId });
      break;
    case "weread_my_reviews":
      data = await callWeRead("/review/list/mine", { bookid: args.bookId, count: args.count ?? 20, synckey: args.synckey ?? 0 });
      break;
    case "weread_best_bookmarks":
      data = await callWeRead("/book/bestbookmarks", { bookId: args.bookId, chapterUid: args.chapterUid ?? 0, synckey: args.synckey ?? 0 });
      break;
    case "weread_underlines":
      data = await callWeRead("/book/underlines", { bookId: args.bookId, chapterUid: args.chapterUid, synckey: args.synckey ?? 0 });
      break;
    case "weread_read_reviews":
      data = await callWeRead("/book/readreviews", { bookId: args.bookId, chapterUid: args.chapterUid, reviews: args.reviews });
      break;
    case "weread_review_detail":
      data = await callWeRead("/review/single", { reviewId: args.reviewId, commentsCount: args.commentsCount ?? 10, likesCount: args.likesCount ?? 10 });
      break;
    case "weread_public_reviews":
      data = await callWeRead("/review/list", { bookId: args.bookId, reviewListType: args.reviewListType ?? 0, count: args.count ?? 20, maxIdx: args.maxIdx ?? 0, synckey: args.synckey ?? 0 });
      break;
    case "weread_reading_stats":
      data = await callWeRead("/readdata/detail", { mode: args.mode ?? "monthly", baseTime: args.baseTime ?? 0 });
      break;
    case "weread_recommend":
      data = await callWeRead("/book/recommend", { count: args.count ?? 12, maxIdx: args.maxIdx ?? 0 });
      break;
    case "weread_similar_books": {
      const sb: Record<string, unknown> = {
        bookId: args.bookId,
        maxIdx: args.maxIdx ?? 0,
        count: args.count ?? 12,
      };
      if (args.sessionId !== undefined) sb.sessionId = args.sessionId;
      data = await callWeRead("/book/similar", sb);
      break;
    }
    case "weread_url_schema": {
      const { type, bookId, chapterUid, rangeStart, rangeEnd, userVid } = args as Record<string, any>;
      let url = "";
      if (type === "book") url = `weread://reading?bId=${bookId}`;
      else if (type === "chapter") url = `weread://reading?bId=${bookId}&chapterUid=${chapterUid}`;
      else if (type === "highlight") url = `weread://bestbookmark?bookId=${bookId}&chapterUid=${chapterUid}&rangeStart=${rangeStart}&rangeEnd=${rangeEnd}${userVid !== undefined ? `&userVid=${userVid}` : ""}`;
      return { content: [{ type: "text", text: url }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ---------------------------------------------------------------------------
// MCP message handler
// ---------------------------------------------------------------------------
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
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call":
      try {
        const content = await handleToolCall(params.name, params.arguments ?? {});
        return { jsonrpc: "2.0", id, result: { content: content.content } };
      } catch (err: any) {
        return { jsonrpc: "2.0", id, error: { code: -32603, message: err.message } };
      }

    case "notifications/initialized":
      return { jsonrpc: "2.0", id: null, result: null };

    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // GET — 欢迎页面
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end(`
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>WeRead MCP Server</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; }
  h1 { color: #07c160; }
  .status { background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 20px; margin: 20px 0; }
  .url { background: #f5f5f5; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 14px; }
</style></head>
<body>
  <h1>✅ 部署成功</h1>
  <div class="status">
    <p>WeRead MCP 服务器运行正常</p>
    <p>🛠 共 17 个工具可用</p>
  </div>
  <p>在 Dify 中配置 MCP：</p>
  <div class="url">https://${req.headers.host}/api/mcp</div>
  <p style="color:#888;margin-top:40px;font-size:14px">类型选 HTTP，不需要认证</p>
</body>
</html>`);
    return;
  }

  try {
    const result = await handleMcpMessage(req.body);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: err.message },
      id: null,
    });
  }
}
