/**
 * Z-Library EAPI Client
 * Communicates directly with Z-Library's EAPI endpoints.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ZLibraryClient {
  constructor(config) {
    this.email = config.zlibrary_email;
    this.password = config.zlibrary_password;
    this.baseUrl = config.zlibrary_mirror || 'https://z-lib.gs';
    this.downloadDir = config.download_dir || path.join(process.cwd(), 'downloads');
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    this.cookies = null;
  }

  /**
   * Login to Z-Library and store session cookies.
   */
  async login() {
    try {
      const res = await this.client.post('/eapi/user/login', {
        email: this.email,
        password: this.password,
      });

      // EAPI returns set-cookie headers
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        this.cookies = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
        this.client.defaults.headers.Cookie = this.cookies;
      }

      // Some mirrors return a session cookie in the response body
      if (res.data && res.data.cookie) {
        this.cookies = res.data.cookie;
        this.client.defaults.headers.Cookie = this.cookies;
      }

      return { success: true, message: '登录成功' };
    } catch (err) {
      if (err.response && err.response.status === 401) {
        return { success: false, message: '账号或密码错误，请检查 Z-Library 凭据' };
      }
      return { success: false, message: `登录失败: ${err.message}` };
    }
  }

  /**
   * Ensure we have a valid session, re-login if needed.
   */
  async ensureAuth() {
    if (!this.cookies) {
      await this.login();
    }
  }

  /**
   * Search books on Z-Library.
   * @param {Object} params
   * @param {string} params.query - Search keyword (title, author, ISBN)
   * @param {string} [params.language] - Language filter (e.g. 'chinese', 'english')
   * @param {string} [params.format] - Format filter ('pdf', 'epub', 'mobi', 'azw3')
   * @param {string} [params.year] - Year filter
   * @param {number} [params.limit=10] - Max results
   * @param {number} [params.page=1] - Page number
   */
  async searchBooks(params = {}) {
    await this.ensureAuth();

    const { query, language, format, year, limit = 10, page = 1 } = params;

    if (!query) {
      return { success: false, message: '请提供搜索关键词（书名、作者或 ISBN）' };
    }

    try {
      const payload = {
        message: query,
        limit,
        page,
      };

      if (language) payload.languages = [language];
      if (format) payload.extensions = [format];
      if (year) payload.yearFrom = parseInt(year);

      const res = await this.client.post('/eapi/book/search', payload);

      if (!res.data || !res.data.books) {
        return { success: false, message: '搜索返回了空结果' };
      }

      const books = res.data.books.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        year: book.year,
        language: book.language,
        format: book.extension,
        size: book.filesize ? `${(book.filesize / 1024 / 1024).toFixed(1)}MB` : '未知',
        rating: book.rating || 'N/A',
        pages: book.pages || '未知',
        publisher: book.publisher || '未知',
      }));

      return {
        success: true,
        total: res.data.total || books.length,
        page,
        limit,
        books,
      };
    } catch (err) {
      // If unauthorized, try re-login once
      if (err.response && err.response.status === 401) {
        this.cookies = null;
        await this.login();
        return this.searchBooks(params);
      }
      return { success: false, message: `搜索失败: ${err.message}` };
    }
  }

  /**
   * Download a book from Z-Library.
   * @param {Object} params
   * @param {string} params.bookId - Book ID from search results
   * @param {string} params.format - Desired format ('epub', 'pdf', 'mobi', 'azw3')
   * @param {string} [params.filename] - Custom filename (without extension)
   */
  async downloadBook(params = {}) {
    await this.ensureAuth();

    const { bookId, format = 'epub', filename } = params;

    if (!bookId) {
      return { success: false, message: '请提供书籍 ID（从搜索结果中获取）' };
    }

    try {
      // First, get the download URL
      const res = await this.client.get(`/eapi/book/${bookId}/${format}`);

      if (res.data && res.data.file) {
        // EAPI returns a download URL or base64-encoded file
        const downloadUrl = res.data.file;
        let fileBuffer;

        if (downloadUrl.startsWith('http')) {
          const dlRes = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
          });
          fileBuffer = Buffer.from(dlRes.data);
        } else if (downloadUrl.startsWith('/')) {
          const dlRes = await this.client.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
          });
          fileBuffer = Buffer.from(dlRes.data);
        } else {
          // Assume it's base64
          fileBuffer = Buffer.from(downloadUrl, 'base64');
        }

        // Determine filename
        const safeFilename = filename || `book_${bookId}`;
        const ext = res.data.extension || format;
        const fullFilename = `${safeFilename}.${ext}`;

        // Ensure download directory exists
        if (!fs.existsSync(this.downloadDir)) {
          fs.mkdirSync(this.downloadDir, { recursive: true });
        }

        const filePath = path.join(this.downloadDir, fullFilename);
        fs.writeFileSync(filePath, fileBuffer);

        return {
          success: true,
          message: `下载成功`,
          file_path: filePath,
          filename: fullFilename,
          size: `${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB`,
          format: ext,
        };
      }

      return { success: false, message: '无法获取下载链接，可能该书不支持此格式' };
    } catch (err) {
      if (err.response && err.response.status === 401) {
        this.cookies = null;
        await this.login();
        return this.downloadBook(params);
      }
      return { success: false, message: `下载失败: ${err.message}` };
    }
  }

  /**
   * Get current download limits.
   */
  async getDownloadLimits() {
    await this.ensureAuth();
    try {
      const res = await this.client.get('/eapi/user/profile');
      return {
        success: true,
        downloads_today: res.data.downloads_today || '未知',
        downloads_limit: res.data.downloads_limit || '未知',
      };
    } catch (err) {
      return { success: false, message: `获取限制信息失败: ${err.message}` };
    }
  }
}

module.exports = ZLibraryClient;
