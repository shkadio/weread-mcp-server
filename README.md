# WeRead (微信读书) MCP Server

MCP server that wraps the WeRead Agent API, providing AI assistants with the ability to search books, manage shelves, view notes/highlights, reading statistics, and more.

## Prerequisites

- Node.js 18+
- A WeRead API Key (`wrk-xxxxxxxx`) — obtain from WeRead official channel

## Installation

```bash
cd weread-mcp-server
npm install
npm run build
```

## Configuration

### 方式一：.env 文件（推荐）

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```bash
# 复制模板后编辑
cp .env.example .env
# 写入你的 API Key
echo 'WEREAD_API_KEY=wrk-xxxxxxxx' > .env
```

MCP 服务器启动时会自动加载 `.env` 文件，无需手动 export。

### 方式二：环境变量

```bash
export WEREAD_API_KEY=wrk-xxxxxxxx
```

### VS Code / Claude Desktop Integration（Stdio 模式）

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "weread": {
      "command": "node",
      "args": ["path/to/weread-mcp-server/dist/index.js"],
      "env": {
        "WEREAD_API_KEY": "wrk-xxxxxxxx"
      }
    }
  }
}
```

### Dify Web 集成（SSE/HTTP 模式）

**启动 MCP 服务器（HTTP 模式）：**

```bash
cd weread-mcp-server

# 默认端口 3100
node dist/index.js --sse

# 指定端口
node dist/index.js --sse --port 8080

# 或者 --port 隐含 --sse
node dist/index.js --port 3100
```

**在 Dify 中配置：**

1. 在 Dify 的 **Agent / Workflow** 编辑器中，添加 **MCP Client** 节点
2. 配置类型为 **Remote MCP Server**
3. 填入地址：`http://<你的IP>:3100/`（如果 Dify 和服务器在同一台机器，用 `http://localhost:3100/`）
4. 保存并连接

> ⚠️ 注意：Dify 在 Docker 中运行时，`localhost` 指向容器内部。如果 MCP 服务器在宿主机上，需用 `host.docker.internal` 代替 `localhost`，或在 `--network host` 模式下使用 `localhost`。

## Tools

### Search & Discovery

| Tool | Description |
|------|-------------|
| **weread_search** | Search book store — ebooks, web novels, audiobooks, authors |
| **weread_recommend** | Personalized recommendations based on reading history |
| **weread_similar_books** | Find similar books to a given book |

### Library & Reading

| Tool | Description |
|------|-------------|
| **weread_shelf_sync** | Get user's bookshelf (ebooks + audiobooks) |
| **weread_book_info** | Book details (title, author, rating, ISBN, etc.) |
| **weread_chapter_info** | Chapter directory structure |
| **weread_reading_progress** | Reading progress for a book |

### Notes & Highlights

| Tool | Description |
|------|-------------|
| **weread_notebooks** | Overview of all books with notes |
| **weread_bookmarks** | All highlights for a book |
| **weread_my_reviews** | Personal notes and reviews for a book |
| **weread_best_bookmarks** | Most popular highlights (with text) |
| **weread_underlines** | Highlight heat statistics per chapter |
| **weread_read_reviews** | Comments on specific highlights |
| **weread_review_detail** | Single review with comments and likes |
| **weread_public_reviews** | Public reviews for a book |

### Statistics

| Tool | Description |
|------|-------------|
| **weread_reading_stats** | Reading statistics (weekly/monthly/yearly/overall) |

### Utilities

| Tool | Description |
|------|-------------|
| **weread_url_schema** | Generate WeRead app deep links (no API call) |

## API Reference

All tools call the unified gateway endpoint: `POST https://i.weread.qq.com/api/agent/gateway`

Authentication: Bearer token via `Authorization` header.

See [weread_api_doc.md](../weread_api_doc.md) for the full API specification.

## Usage Examples

### Search for books

```typescript
// Call via MCP client:
const result = await client.callTool({
  name: "weread_search",
  arguments: {
    keyword: "三体",
    scope: 10,
    count: 5
  }
});
```

### Get reading statistics

```typescript
const stats = await client.callTool({
  name: "weread_reading_stats",
  arguments: {
    mode: "monthly",
    baseTime: 0
  }
});
```

### Generate deep link

```typescript
const link = await client.callTool({
  name: "weread_url_schema",
  arguments: {
    type: "book",
    bookId: "3300045871"
  }
});
// Returns: weread://reading?bId=3300045871
```

## CLI 选项

```
node dist/index.js              # Stdio 模式（默认，用于 Claude Code / VS Code 等）
node dist/index.js --sse        # SSE/HTTP 模式（用于 Dify 等 Web 端）
node dist/index.js --port 8080  # 指定 HTTP 端口（隐含 --sse）
node dist/index.js --help       # 帮助信息
```

## Development

```bash
npm run dev    # Watch mode with tsx
npm run build  # Compile TypeScript
npm start      # Run compiled version (stdio mode)
```
