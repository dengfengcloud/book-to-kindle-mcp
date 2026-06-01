# Book-to-Kindle MCP Server

> 🎯 **"帮我把《三体》发到 Kindle"** —— 一句话搞定。

一个 MCP (Model Context Protocol) 服务器，自动化电子书全流程：Z-Library 搜索 → 下载 → 发送到 Kindle。支持 Claude Code、Claude Desktop、Trae 等 MCP 客户端。

[English Docs](README.md)

## ✨ 功能

- 🔍 **搜索 Z-Library** — 按书名/作者/ISBN 搜索，支持语言/格式/年份过滤
- 📥 **下载书籍** — EPUB、PDF、MOBI、AZW3
- 📚 **Calibre 集成** — 导入下载的书籍到 Calibre 书库
- 📧 **发送到 Kindle** — 通过邮件直接发送到 Kindle 设备
- 🎯 **一键流程** — `zlib_to_kindle` 一句话完成搜→下→发

## 📦 安装

### 环境要求

- **Node.js** ≥ 18
- **Calibre** 已安装（[calibre-ebook.com](https://calibre-ebook.com)）
- **Z-Library** 账号
- **SMTP 邮箱**（用于发送到 Kindle，如 QQ邮箱、Gmail 等）

### 方式一：npm 安装

```bash
npm install -g book-to-kindle-mcp
```

### 方式二：从源码安装

```bash
git clone https://github.com/YOUR_USERNAME/book-to-kindle-mcp.git
cd book-to-kindle-mcp
npm install
```

## ⚙️ 配置

在 MCP 客户端配置中设置以下环境变量：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ZLIBRARY_EMAIL` | ✅ | Z-Library 账号邮箱 |
| `ZLIBRARY_PASSWORD` | ✅ | Z-Library 账号密码 |
| `CALIBRE_LIBRARY_PATH` | | Calibre 书库路径（`import_to_calibre` 需要） |
| `KINDLE_EMAIL` | ✅* | Kindle 接收邮箱 |
| `SMTP_SERVER` | ✅* | SMTP 服务器地址 |
| `SMTP_PORT` | | SMTP 端口（默认 `587`） |
| `SMTP_USER` | ✅* | SMTP 用户名（发件邮箱） |
| `SMTP_PASSWORD` | ✅* | SMTP 密码或授权码 |
| `SMTP_ENCRYPTION` | | 加密方式 `TLS` 或 `SSL`（默认 `TLS`） |
| `DOWNLOAD_DIR` | | 下载目录（默认 `./downloads`） |
| `ZLIBRARY_MIRROR` | | 自定义 Z-Library 镜像地址 |

> 💡 **QQ邮箱用户**：设置 `SMTP_SERVER=smtp.qq.com`、`SMTP_PORT=587`，`SMTP_PASSWORD` 填 **QQ邮箱授权码**（不是 QQ 密码）。

## 🚀 MCP 客户端配置

### Claude Code

```bash
claude mcp add --scope user --transport stdio book-to-kindle -- \
  env \
  ZLIBRARY_EMAIL=你的邮箱 \
  ZLIBRARY_PASSWORD=你的密码 \
  CALIBRE_LIBRARY_PATH=D:/Calibre\ Library \
  KINDLE_EMAIL=你的kindle@kindle.com \
  SMTP_SERVER=smtp.qq.com \
  SMTP_PORT=587 \
  SMTP_USER=你的QQ邮箱@qq.com \
  SMTP_PASSWORD=你的授权码 \
  node C:/path/to/book-to-kindle-mcp/index.js
```

### Trae / Claude Desktop / 其他 MCP 客户端

```json
{
  "mcpServers": {
    "book-to-kindle": {
      "command": "node",
      "args": ["C:/path/to/book-to-kindle-mcp/index.js"],
      "env": {
        "ZLIBRARY_EMAIL": "你的邮箱",
        "ZLIBRARY_PASSWORD": "你的密码",
        "CALIBRE_LIBRARY_PATH": "D:/Calibre Library",
        "KINDLE_EMAIL": "你的kindle@kindle.com",
        "SMTP_SERVER": "smtp.qq.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "你的QQ邮箱@qq.com",
        "SMTP_PASSWORD": "你的授权码"
      }
    }
  }
}
```

## 🛠️ 工具说明

### `search_zlib` — 搜索书籍

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 书名/作者/ISBN |
| `language` | string | | 语言：`chinese`, `english` 等 |
| `format` | string | | 格式：`epub`, `pdf`, `mobi`, `azw3` |
| `year` | string | | 出版年份 |
| `limit` | number | | 返回数量（默认 10） |

### `download_book` — 下载书籍

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 搜索结果中的书籍 ID |
| `format` | string | | 格式（默认 `epub`） |
| `filename` | string | | 自定义文件名 |

### `import_to_calibre` — 导入 Calibre

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | ✅ | 书籍文件路径 |
| `library_path` | string | | 指定 Calibre 书库路径 |

### `send_to_kindle` — 发送到 Kindle

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | ✅ | 书籍文件路径 |
| `kindle_email` | string | | 指定 Kindle 邮箱 |
| `subject` | string | | 邮件主题 |

### `zlib_to_kindle` 🎯 — 一键全流程

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 书名或作者 |
| `format` | string | | 首选格式（默认 `epub`） |
| `language` | string | | 语言过滤 |
| `kindle_email` | string | | 指定 Kindle 邮箱 |

### `check_config` — 检查配置

无参数，返回当前各组件的配置状态。

## 📝 使用示例

```
你：帮我把《三体》发到Kindle
AI：[调用 zlib_to_kindle，query="三体", language="chinese"]
→ 🔍 搜索到"三体" - 刘慈欣
→ 📥 下载 EPUB (2.3MB)
→ 📧 发送到 xxx@kindle.com
→ ✅ 完成！打开 Kindle 同步即可看到。
```

```
你：搜索 Lord of the Rings 英文 EPUB 版
AI：[调用 search_zlib，query="Lord of the Rings", language="english", format="epub"]
→ 返回匹配的书籍列表和 ID
```

## 🔒 安全说明

- 所有凭据通过环境变量传递，不硬编码
- `config.json` 已加入 `.gitignore`，不会被提交
- Z-Library 凭据仅发送至 Z-Library EAPI
- SMTP 凭据仅用于 Kindle 投递

## ⚠️ 免责声明

本工具仅供**教育和研究目的**使用。用户有责任遵守所在地区关于版权材料下载和使用的法律法规。在某些地区访问 Z-Library 可能受限。

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)

## 🙏 致谢

- [Z-Library](https://z-lib.gs) — 书籍搜索 EAPI
- [Calibre](https://calibre-ebook.com) — 最好的电子书管理工具
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
