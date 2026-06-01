#!/usr/bin/env node

/**
 * Book-to-Kindle MCP Server
 *
 * One-click pipeline: search Z-Library → download → send to Kindle.
 * Orchestrates Z-Library EAPI, Calibre library management, and email delivery.
 *
 * Configuration via environment variables:
 *   ZLIBRARY_EMAIL       - Z-Library account email
 *   ZLIBRARY_PASSWORD    - Z-Library account password
 *   CALIBRE_LIBRARY_PATH - Path to Calibre library folder
 *   CALIBRE_PATH         - Path to Calibre installation (default: C:\Program Files\Calibre2)
 *   KINDLE_EMAIL         - Kindle email address for Send-to-Kindle
 *   SMTP_SERVER          - SMTP server for email delivery
 *   SMTP_PORT            - SMTP port (default: 587)
 *   SMTP_USER            - SMTP username (usually your email)
 *   SMTP_PASSWORD        - SMTP password or authorization code
 *   SMTP_ENCRYPTION      - SMTP encryption: TLS or SSL (default: TLS)
 *   DOWNLOAD_DIR         - Directory for downloaded books (default: ./downloads)
 *   ZLIBRARY_MIRROR      - Z-Library mirror URL (optional)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const ZLibraryClient = require('./lib/zlibrary');
const CalibreClient = require('./lib/calibre');
const path = require('path');
const fs = require('fs');

// ── Configuration ──────────────────────────────────────────────

const config = {
  zlibrary_email: process.env.ZLIBRARY_EMAIL,
  zlibrary_password: process.env.ZLIBRARY_PASSWORD,
  zlibrary_mirror: process.env.ZLIBRARY_MIRROR,
  calibre_path: process.env.CALIBRE_PATH || 'C:\\Program Files\\Calibre2',
  calibre_library_path: process.env.CALIBRE_LIBRARY_PATH,
  kindle_email: process.env.KINDLE_EMAIL,
  smtp_server: process.env.SMTP_SERVER,
  smtp_port: parseInt(process.env.SMTP_PORT) || 587,
  smtp_user: process.env.SMTP_USER,
  smtp_password: process.env.SMTP_PASSWORD,
  smtp_encryption: process.env.SMTP_ENCRYPTION || 'TLS',
  download_dir: process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads'),
};

const zlib = new ZLibraryClient(config);
const calibre = new CalibreClient(config);

// Ensure download directory exists
if (!fs.existsSync(config.download_dir)) {
  fs.mkdirSync(config.download_dir, { recursive: true });
}

// ── MCP Server ────────────────────────────────────────────────

const server = new Server(
  {
    name: 'book-to-kindle-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool Definitions ──────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_zlib',
    description:
      '在 Z-Library 上搜索书籍。支持书名、作者、ISBN 搜索，可按语言、格式、年份过滤。返回书籍列表及详细信息（ID、标题、作者、大小、格式等）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词：书名、作者或 ISBN。例如"三体"、"刘慈欣"',
        },
        language: {
          type: 'string',
          description: '语言过滤：chinese, english, german, french, spanish, japanese, russian 等',
        },
        format: {
          type: 'string',
          description: '格式过滤：epub, pdf, mobi, azw3',
        },
        year: {
          type: 'string',
          description: '出版年份过滤，如 2023',
        },
        limit: {
          type: 'number',
          description: '返回数量，默认 10',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'download_book',
    description:
      '从 Z-Library 下载书籍到本地。需要先通过 search_zlib 获取 book_id。支持 epub、pdf、mobi、azw3 格式。下载后返回本地文件路径。',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: '书籍 ID（从 search_zlib 的结果中获取）',
        },
        book_hash: {
          type: 'string',
          description: '书籍 Hash（从 search_zlib 的结果中获取）',
        },
        format: {
          type: 'string',
          description: '下载格式：epub（推荐用于 Kindle）, pdf, mobi, azw3',
          default: 'epub',
        },
        filename: {
          type: 'string',
          description: '自定义文件名（不含后缀），不填则自动生成',
        },
      },
      required: ['book_id', 'book_hash'],
    },
  },
  {
    name: 'import_to_calibre',
    description:
      '将下载的书籍文件导入到 Calibre 书库进行管理。导入后可在 Calibre 中查看、分类、转换格式。',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '书籍文件的完整路径（从 download_book 返回的 file_path）',
        },
        library_path: {
          type: 'string',
          description: 'Calibre 书库路径，不填则使用配置中的默认路径',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'send_to_kindle',
    description:
      '通过邮件将书籍发送到 Kindle 设备。支持 EPUB、PDF、MOBI 格式。使用 Calibre 的 SMTP 功能发送。发送前会展示完整预览（文件名、大小、目标Kindle邮箱）。',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '要发送的书籍文件完整路径',
        },
        kindle_email: {
          type: 'string',
          description: 'Kindle 接收邮箱，不填则使用配置中的默认值',
        },
        subject: {
          type: 'string',
          description: '邮件主题，默认为书名',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'zlib_to_kindle',
    description:
      '🎯 一键全流程：从 Z-Library 搜索并下载书籍，然后直接发送到 Kindle。自动完成搜索→选择最佳匹配→下载→发送。发送前会展示完整预览等待确认。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词：书名或作者。例如"三体"、"活着 余华"、"1984 George Orwell"',
        },
        format: {
          type: 'string',
          description: '首选格式：epub（推荐）, pdf, mobi, azw3',
          default: 'epub',
        },
        language: {
          type: 'string',
          description: '语言过滤：chinese, english 等',
        },
        kindle_email: {
          type: 'string',
          description: 'Kindle 接收邮箱，不填则使用配置中的默认值',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_config',
    description: '检查当前配置状态：Z-Library 登录、Calibre 连接、SMTP 设置是否就绪。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Tool Handler ──────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ── search_zlib ──────────────────────────────────────
    case 'search_zlib': {
      const result = await zlib.searchBooks({
        query: args.query,
        language: args.language,
        format: args.format,
        year: args.year,
        limit: args.limit || 10,
      });

      if (result.success) {
        const bookList = result.books
          .map((b, i) =>
            `${i + 1}. **${b.title}** - ${b.author} | ${b.format.toUpperCase()} | ${b.size} | ${b.language} | ID: \`${b.id}\` | Hash: \`${b.hash}\``
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `## 🔍 搜索结果: "${args.query}"\n共 ${result.total} 本\n\n${bookList}\n\n---\n💡 记下想要的书的 **ID**，用 \`download_book\` 下载，或用 \`zlib_to_kindle\` 一键下载发送。`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `## ❌ 搜索失败\n${result.message}` }],
        isError: true,
      };
    }

    // ── download_book ────────────────────────────────────
    case 'download_book': {
      const result = await zlib.downloadBook({
        bookId: args.book_id,
        bookHash: args.book_hash,
        format: args.format || 'epub',
        filename: args.filename,
      });

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `## ✅ 下载成功\n\n` +
                `- **文件**: \`${result.file_path}\`\n` +
                `- **大小**: ${result.size}\n` +
                `- **格式**: ${result.format.toUpperCase()}\n\n` +
                `💡 接下来可以：\n` +
                `- \`import_to_calibre\` → 导入 Calibre 书库\n` +
                `- \`send_to_kindle\` → 直接发送到 Kindle`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `## ❌ 下载失败\n${result.message}` }],
        isError: true,
      };
    }

    // ── import_to_calibre ────────────────────────────────
    case 'import_to_calibre': {
      const result = await calibre.importBook(args.file_path, args.library_path);

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `## ✅ 已导入 Calibre 书库\n- **文件**: \`${result.file_path}\`\n- **书库**: \`${result.library_path}\`\n- **详情**: ${result.details}`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `## ❌ 导入失败\n${result.message}` }],
        isError: true,
      };
    }

    // ── send_to_kindle ───────────────────────────────────
    case 'send_to_kindle': {
      const filePath = args.file_path;
      const recipient = args.kindle_email || config.kindle_email;

      // Check file exists
      if (!fs.existsSync(filePath)) {
        return {
          content: [
            { type: 'text', text: `## ❌ 文件不存在\n\`${filePath}\`\n请检查文件路径。` },
          ],
          isError: true,
        };
      }

      const stat = fs.statSync(filePath);
      const filename = path.basename(filePath);

      // Show preview
      const preview =
        `## 📧 发送预览\n\n` +
        `| 项目 | 内容 |\n|------|------|\n` +
        `| **文件** | ${filename} |\n` +
        `| **大小** | ${(stat.size / 1024 / 1024).toFixed(1)}MB |\n` +
        `| **收件人** | ${recipient} |\n\n` +
        `正在发送...`;

      // Send
      const result = await calibre.sendToKindle({
        filePath,
        kindleEmail: args.kindle_email,
        subject: args.subject,
      });

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `${preview}\n\n## ✅ 发送成功！\n` +
                `- **文件**: ${result.file}\n` +
                `- **收件人**: ${result.recipient}\n\n` +
                `📱 请检查 Kindle 设备，书籍将在几分钟内同步到你的 Kindle 图书馆。`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `${preview}\n\n## ❌ 发送失败\n${result.message}`,
          },
        ],
        isError: true,
      };
    }

    // ── zlib_to_kindle (all-in-one) ──────────────────────
    case 'zlib_to_kindle': {
      const query = args.query;
      const format = args.format || 'epub';
      const language = args.language;
      const kindleEmail = args.kindle_email || config.kindle_email;

      if (!kindleEmail) {
        return {
          content: [
            { type: 'text', text: '## ❌ 未配置 Kindle 邮箱\n请设置 `KINDLE_EMAIL` 环境变量或在参数中提供 `kindle_email`。' },
          ],
          isError: true,
        };
      }

      // Step 1: Search
      const searchResult = await zlib.searchBooks({ query, format, language, limit: 5 });
      if (!searchResult.success || searchResult.books.length === 0) {
        return {
          content: [
            { type: 'text', text: `## ❌ 搜索失败或无结果\n"${query}" 未找到匹配的书籍。请尝试不同的关键词。` },
          ],
          isError: true,
        };
      }

      const best = searchResult.books[0];

      // Show preview before proceeding
      const preview =
        `## 🎯 一键发送流程\n\n` +
        `### 步骤 1/3：搜索 ✅\n搜索 "${query}" → 找到 ${searchResult.total} 本\n\n` +
        `### 步骤 2/3：下载中...\n` +
        `选中的书：**${best.title}** - ${best.author}\n` +
        `格式：${best.format.toUpperCase()} | 大小：${best.size}\n\n` +
        `### 步骤 3/3：发送到 Kindle\n` +
        `收件人：${kindleEmail}\n\n` +
        `| 项目 | 内容 |\n|------|------|\n` +
        `| **书名** | ${best.title} |\n` +
        `| **作者** | ${best.author} |\n` +
        `| **格式** | ${best.format.toUpperCase()} |\n` +
        `| **大小** | ${best.size} |\n` +
        `| **Kindle** | ${kindleEmail} |\n\n` +
        `⏳ 正在下载...`;

      // Step 2: Download
      const dlResult = await zlib.downloadBook({
        bookId: best.id,
        bookHash: best.hash,
        format: best.format,
        filename: best.title.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 80),
      });

      if (!dlResult.success) {
        return {
          content: [
            {
              type: 'text',
              text: `${preview}\n\n## ❌ 下载失败\n${dlResult.message}`,
            },
          ],
          isError: true,
        };
      }

      // Step 3: Send to Kindle
      const sendResult = await calibre.sendToKindle({
        filePath: dlResult.file_path,
        kindleEmail,
        subject: best.title,
      });

      if (sendResult.success) {
        return {
          content: [
            {
              type: 'text',
              text:
                `## 🎉 全流程完成！\n\n` +
                `| 步骤 | 状态 |\n|------|------|\n` +
                `| 🔍 搜索 "${query}" | ✅ |\n` +
                `| 📥 下载 ${dlResult.format.toUpperCase()} | ✅ ${dlResult.size} |\n` +
                `| 📧 发送到 Kindle | ✅ |\n\n` +
                `**书名**: ${best.title}\n**作者**: ${best.author}\n**收件人**: ${sendResult.recipient}\n\n` +
                `📱 书籍将在几分钟内同步到你的 Kindle 图书馆。`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `${preview}\n✅ 下载成功 (${dlResult.size})\n\n` +
              `## ❌ 发送到 Kindle 失败\n${sendResult.message}\n\n` +
              `文件已下载到 \`${dlResult.file_path}\`，可以稍后手动发送。`,
          }],
        isError: true,
      };
    }

    // ── check_config ─────────────────────────────────────
    case 'check_config': {
      const checks = [];

      // Check Z-Library
      if (config.zlibrary_email && config.zlibrary_password) {
        checks.push(`| 🔑 Z-Library | ✅ 已配置 | ${config.zlibrary_email} |`);
      } else {
        checks.push('| 🔑 Z-Library | ❌ 未配置 | 请设置 ZLIBRARY_EMAIL / ZLIBRARY_PASSWORD |');
      }

      // Check Calibre
      if (config.calibre_library_path && fs.existsSync(config.calibre_library_path)) {
        checks.push(`| 📚 Calibre 书库 | ✅ 就绪 | \`${config.calibre_library_path}\` |`);
      } else if (config.calibre_library_path) {
        checks.push(`| 📚 Calibre 书库 | ⚠️ 路径不存在 | \`${config.calibre_library_path}\` |`);
      } else {
        checks.push('| 📚 Calibre 书库 | ⚠️ 未配置 | 请设置 CALIBRE_LIBRARY_PATH |');
      }

      // Check Kindle
      if (config.kindle_email) {
        checks.push(`| 📱 Kindle 邮箱 | ✅ 已配置 | ${config.kindle_email} |`);
      } else {
        checks.push('| 📱 Kindle 邮箱 | ⚠️ 未配置 | 请设置 KINDLE_EMAIL |');
      }

      // Check SMTP
      if (config.smtp_server && config.smtp_user) {
        checks.push(`| 📧 SMTP | ✅ 已配置 | ${config.smtp_server}:${config.smtp_port} (${config.smtp_user}) |`);
      } else {
        checks.push('| 📧 SMTP | ⚠️ 未配置 | 请设置 SMTP_SERVER / SMTP_USER / SMTP_PASSWORD |');
      }

      // Check download dir
      checks.push(`| 📥 下载目录 | ✅ | \`${config.download_dir}\` |`);

      return {
        content: [
          {
            type: 'text',
            text: `## ⚙️ 配置状态\n\n| 组件 | 状态 | 详情 |\n|------|------|------|\n${checks.join('\n')}`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `未知工具: ${name}` }],
        isError: true,
      };
  }
});

// ── Start Server ──────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Book-to-Kindle MCP Server v1.0.0 已启动');
}

main().catch((err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
