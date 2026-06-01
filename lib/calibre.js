/**
 * Calibre CLI Wrapper
 * Manages Calibre library via calibredb and sends books via calibre-smtp.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

class CalibreClient {
  constructor(config) {
    this.calibrePath = config.calibre_path || 'C:\\Program Files\\Calibre2';
    this.libraryPath = config.calibre_library_path;
    this.kindleEmail = config.kindle_email;
    this.smtpServer = config.smtp_server;
    this.smtpPort = config.smtp_port || 587;
    this.smtpUser = config.smtp_user;
    this.smtpPassword = config.smtp_password;
    this.smtpEncryption = config.smtp_encryption || 'TLS';
  }

  /**
   * Get full path to a Calibre executable.
   */
  _exe(name) {
    const exeName = process.platform === 'win32' ? `${name}.exe` : name;
    return path.join(this.calibrePath, exeName);
  }

  /**
   * Run a Calibre CLI command.
   */
  _run(command, args = [], timeout = 120000) {
    return new Promise((resolve, reject) => {
      const cmd = this._exe(command);
      execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Import a book into the Calibre library.
   * @param {string} filePath - Path to the book file
   * @param {string} [libraryPath] - Override library path
   */
  async importBook(filePath, libraryPath) {
    const libPath = libraryPath || this.libraryPath;

    if (!libPath) {
      return { success: false, message: '请先配置 Calibre 书库路径 (calibre_library_path)' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, message: `文件不存在: ${filePath}` };
    }

    try {
      const output = await this._run('calibredb', [
        'add',
        '--library-path', libPath,
        filePath,
      ]);

      return {
        success: true,
        message: `已导入 Calibre 书库`,
        details: output,
        file_path: filePath,
        library_path: libPath,
      };
    } catch (err) {
      return { success: false, message: `导入失败: ${err.message}` };
    }
  }

  /**
   * Search Calibre library for a book.
   * @param {string} query - Search term
   * @param {string} [libraryPath] - Override library path
   */
  async searchLibrary(query, libraryPath) {
    const libPath = libraryPath || this.libraryPath;

    if (!libPath) {
      return { success: false, message: '请先配置 Calibre 书库路径' };
    }

    try {
      const output = await this._run('calibredb', [
        'search',
        '--library-path', libPath,
        query,
      ]);

      // Parse calibredb search output
      const ids = output.split('\n').filter(l => l.trim());

      if (ids.length === 0) {
        return { success: true, books: [], message: '未找到匹配的书籍' };
      }

      // Get detailed info for each book
      const books = [];
      for (const id of ids.slice(0, 20)) {
        try {
          const info = await this._run('calibredb', [
            'list',
            '--library-path', libPath,
            '--search', `id:${id}`,
            '--fields', 'id,title,authors,formats,tags',
            '--for-machine',
          ]);
          const parsed = JSON.parse(info);
          if (parsed && parsed.length > 0) books.push(...parsed);
        } catch {
          // Skip books that fail to parse
        }
      }

      return { success: true, count: books.length, books };
    } catch (err) {
      return { success: false, message: `搜索失败: ${err.message}` };
    }
  }

  /**
   * List available formats for a specific book in Calibre.
   * @param {number} bookId - Calibre book ID
   * @param {string} [libraryPath] - Override library path
   */
  async getBookFormats(bookId, libraryPath) {
    const libPath = libraryPath || this.libraryPath;
    try {
      const output = await this._run('calibredb', [
        'list',
        '--library-path', libPath,
        '--search', `id:${bookId}`,
        '--fields', 'id,title,formats',
        '--for-machine',
      ]);
      const parsed = JSON.parse(output);
      return { success: true, book: parsed[0] || null };
    } catch (err) {
      return { success: false, message: `获取格式失败: ${err.message}` };
    }
  }

  /**
   * Send a book to Kindle via Calibre's email feature (calibre-smtp).
   * @param {Object} params
   * @param {string} params.filePath - Path to book file (EPUB/PDF/MOBI)
   * @param {string} [params.kindleEmail] - Recipient Kindle email
   * @param {string} [params.subject] - Email subject (default: book filename)
   */
  async sendToKindle(params = {}) {
    const { filePath, kindleEmail, subject } = params;
    const recipient = kindleEmail || this.kindleEmail;

    if (!recipient) {
      return { success: false, message: '请配置 Kindle 邮箱地址 (kindle_email)' };
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, message: `文件不存在: ${filePath}` };
    }

    if (!this.smtpServer || !this.smtpUser || !this.smtpPassword) {
      return {
        success: false,
        message: '请配置 SMTP 服务器信息 (smtp_server, smtp_user, smtp_password)',
      };
    }

    try {
      const mailSubject = subject || path.basename(filePath, path.extname(filePath));

      await this._run('calibre-smtp', [
        '--relay', this.smtpServer,
        '--port', String(this.smtpPort),
        '--username', this.smtpUser,
        '--password', this.smtpPassword,
        '--encryption-method', this.smtpEncryption,
        '--subject', mailSubject,
        '--attachment', filePath,
        this.smtpUser,
        recipient,
        '',
      ], 120000);

      return {
        success: true,
        message: `已发送到 Kindle: ${recipient}`,
        file: path.basename(filePath),
        recipient,
      };
    } catch (err) {
      return { success: false, message: `发送失败: ${err.message}` };
    }
  }

  /**
   * Convert a book from one format to another using Calibre.
   * @param {string} filePath - Path to source file
   * @param {string} targetFormat - Target format (epub, mobi, pdf, azw3)
   */
  async convertBook(filePath, targetFormat) {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `文件不存在: ${filePath}` };
    }

    try {
      const parsed = path.parse(filePath);
      const outputPath = path.join(parsed.dir, `${parsed.name}.${targetFormat}`);

      await this._run('ebook-convert', [
        filePath,
        outputPath,
      ], 300000);

      return {
        success: true,
        message: `转换成功: ${targetFormat}`,
        output_path: outputPath,
        source_path: filePath,
      };
    } catch (err) {
      return { success: false, message: `格式转换失败: ${err.message}` };
    }
  }
}

module.exports = CalibreClient;
