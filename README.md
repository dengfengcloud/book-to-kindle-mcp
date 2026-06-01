# Book-to-Kindle MCP Server

> 🎯 **"Download *Three-Body Problem* and send to my Kindle"** — one sentence, done.

A Model Context Protocol (MCP) server that automates the entire ebook workflow: search Z-Library → download → send to Kindle. Works with Claude Code, Claude Desktop, Trae, and other MCP clients.

[中文文档](README_zh.md)

## ✨ Features

- 🔍 **Search Z-Library** — by title, author, ISBN, with language/format/year filters
- 📥 **Download books** — EPUB, PDF, MOBI, AZW3
- 📚 **Calibre integration** — import downloaded books into your Calibre library
- 📧 **Send to Kindle** — email books directly to your Kindle device
- 🎯 **One-shot pipeline** — `zlib_to_kindle` does search → download → send in one go

## 📦 Installation

### Prerequisites

- **Node.js** ≥ 18
- **Calibre** installed ([calibre-ebook.com](https://calibre-ebook.com))
- **Z-Library** account (free or premium)
- **SMTP** credentials (for sending to Kindle — QQ邮箱, Gmail, etc.)

### Option A: npm (Recommended)

```bash
npm install -g book-to-kindle-mcp
```

### Option B: From Source

```bash
git clone https://github.com/YOUR_USERNAME/book-to-kindle-mcp.git
cd book-to-kindle-mcp
npm install
```

## ⚙️ Configuration

Set these environment variables in your MCP client config:

| Variable | Required | Description |
|----------|----------|-------------|
| `ZLIBRARY_EMAIL` | ✅ | Z-Library account email |
| `ZLIBRARY_PASSWORD` | ✅ | Z-Library account password |
| `CALIBRE_LIBRARY_PATH` | | Path to Calibre library (for `import_to_calibre`) |
| `KINDLE_EMAIL` | ✅* | Your Kindle's Send-to-Kindle email |
| `SMTP_SERVER` | ✅* | SMTP server (e.g. `smtp.qq.com`) |
| `SMTP_PORT` | | SMTP port (default: `587`) |
| `SMTP_USER` | ✅* | SMTP username |
| `SMTP_PASSWORD` | ✅* | SMTP password / auth code |
| `SMTP_ENCRYPTION` | | `TLS` or `SSL` (default: `TLS`) |
| `DOWNLOAD_DIR` | | Download directory (default: `./downloads`) |
| `ZLIBRARY_MIRROR` | | Custom Z-Library mirror URL |

\* Required for `send_to_kindle` and `zlib_to_kindle`.

> 💡 **QQ Email users**: Set `SMTP_SERVER=smtp.qq.com`, `SMTP_PORT=587`, and use your QQ email **authorization code** (not password) as `SMTP_PASSWORD`.

## 🚀 MCP Client Setup

### Claude Code

```bash
claude mcp add --scope user --transport stdio book-to-kindle -- \
  env \
  ZLIBRARY_EMAIL=your@email.com \
  ZLIBRARY_PASSWORD=yourpass \
  CALIBRE_LIBRARY_PATH=D:/Calibre\ Library \
  KINDLE_EMAIL=yourname@kindle.com \
  SMTP_SERVER=smtp.qq.com \
  SMTP_PORT=587 \
  SMTP_USER=your@qq.com \
  SMTP_PASSWORD=your_auth_code \
  node C:/Users/YOU/book-to-kindle-mcp/index.js
```

Or use environment variables in `.claude.json`:

```json
{
  "mcpServers": {
    "book-to-kindle": {
      "command": "node",
      "args": ["C:/path/to/book-to-kindle-mcp/index.js"],
      "env": {
        "ZLIBRARY_EMAIL": "your@email.com",
        "ZLIBRARY_PASSWORD": "yourpass",
        "CALIBRE_LIBRARY_PATH": "D:/Calibre Library",
        "KINDLE_EMAIL": "yourname@kindle.com",
        "SMTP_SERVER": "smtp.qq.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "your@qq.com",
        "SMTP_PASSWORD": "your_auth_code"
      }
    }
  }
}
```

### Claude Desktop / Trae / Other MCP Clients

```json
{
  "mcpServers": {
    "book-to-kindle": {
      "command": "node",
      "args": ["C:/path/to/book-to-kindle-mcp/index.js"],
      "env": {
        "ZLIBRARY_EMAIL": "your@email.com",
        "ZLIBRARY_PASSWORD": "yourpass",
        "CALIBRE_LIBRARY_PATH": "D:/Calibre Library",
        "KINDLE_EMAIL": "yourname@kindle.com",
        "SMTP_SERVER": "smtp.qq.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "your@qq.com",
        "SMTP_PASSWORD": "your_auth_code"
      }
    }
  }
}
```

## 🛠️ Tools

### `search_zlib`
Search Z-Library for books.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Title, author, or ISBN |
| `language` | string | | Filter: `chinese`, `english`, etc. |
| `format` | string | | Filter: `epub`, `pdf`, `mobi`, `azw3` |
| `year` | string | | Publication year |
| `limit` | number | | Results count (default: 10) |

### `download_book`
Download a book to local storage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `book_id` | string | ✅ | Book ID from search results |
| `format` | string | | Format (default: `epub`) |
| `filename` | string | | Custom filename |

### `import_to_calibre`
Import a downloaded book into Calibre.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | ✅ | Path to the book file |
| `library_path` | string | | Override Calibre library path |

### `send_to_kindle`
Email a book to your Kindle device. **Shows preview before sending.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | ✅ | Path to the book file |
| `kindle_email` | string | | Override Kindle email |
| `subject` | string | | Email subject |

### `zlib_to_kindle` 🎯
**One-shot pipeline**: search → download → send. Just say the book name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Book name or author |
| `format` | string | | Preferred format (default: `epub`) |
| `language` | string | | Language filter |
| `kindle_email` | string | | Override Kindle email |

### `check_config`
Verify your configuration is correct.

## 📝 Example Usage

```
User: "帮我把《三体》发到Kindle"
Claude: [calls zlib_to_kindle with query="三体", language="chinese"]
→ Search finds "三体" by 刘慈欣
→ Downloads EPUB (2.3MB)
→ Sends to your-kindle@kindle.com
→ ✅ Done! Sync your Kindle to see the book.
```

```
User: "Search for Lord of the Rings in English EPUB"
Claude: [calls search_zlib with query="Lord of the Rings", language="english", format="epub"]
→ Returns matching books with IDs
```

## 🔒 Security

- All credentials are passed via environment variables — never hardcoded
- `config.json` is in `.gitignore` — won't be committed
- Z-Library credentials are only sent to Z-Library EAPI
- SMTP credentials are only used for Kindle delivery

## ⚠️ Disclaimer

This tool is provided for **educational and research purposes only**. Users are responsible for complying with all applicable laws and regulations regarding the downloading and use of copyrighted materials. Access to Z-Library may be restricted in certain jurisdictions.

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🙏 Acknowledgments

- [Z-Library](https://z-lib.gs) — EAPI for book search
- [Calibre](https://calibre-ebook.com) — The ultimate ebook management tool
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
