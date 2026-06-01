/**
 * Z-Library EAPI Client
 * Uses form-urlencoded requests, remix cookie auth, and HTTPS proxy agent.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ZLibraryClient {
  constructor(config) {
    this.email = config.zlibrary_email;
    this.password = config.zlibrary_password;
    this.baseUrl = config.zlibrary_mirror
      || process.env.ZLIBRARY_MIRROR
      || process.env.ZLIBRARY_EAPI_DOMAIN
      || 'https://z-library.sk';
    this.downloadDir = config.download_dir || path.join(process.cwd(), 'downloads');

    // Proxy setup
    const proxyUrl = config.proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY
                  || process.env.http_proxy || process.env.https_proxy;

    const clientOpts = {
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (proxyUrl) {
      clientOpts.httpsAgent = new HttpsProxyAgent(proxyUrl);
    }

    this.proxyUrl = proxyUrl;
    this.client = axios.create(clientOpts);
    this.remix_userid = null;
    this.remix_userkey = null;
  }

  /**
   * Login to Z-Library EAPI and store remix cookies.
   */
  async login() {
    try {
      const params = new URLSearchParams();
      params.append('email', this.email);
      params.append('password', this.password);

      const res = await this.client.post('/eapi/user/login', params.toString());

      const data = res.data;
      if (data.success === 1 && data.user) {
        this.remix_userid = String(data.user.id);
        this.remix_userkey = String(data.user.remix_userkey);

        // Set cookies for subsequent requests
        this.client.defaults.headers.Cookie =
          `siteLanguageV2=en; remix_userid=${this.remix_userid}; remix_userkey=${this.remix_userkey}`;

        return { success: true, message: `登录成功 (用户: ${data.user.name || data.user.id})` };
      }

      return { success: false, message: '登录响应异常' };
    } catch (err) {
      if (err.response?.status === 401) {
        return { success: false, message: '账号或密码错误' };
      }
      return { success: false, message: `登录失败: ${err.message}` };
    }
  }

  async ensureAuth() {
    if (!this.remix_userid || !this.remix_userkey) {
      return await this.login();
    }
    return { success: true };
  }

  /**
   * Search books on Z-Library.
   */
  async searchBooks(params = {}) {
    await this.ensureAuth();

    const { query, language, format, year, limit = 10, page = 1 } = params;

    if (!query) {
      return { success: false, message: '请提供搜索关键词' };
    }

    try {
      const form = new URLSearchParams();
      form.append('message', query);
      form.append('limit', String(limit));
      form.append('page', String(page));
      if (language) form.append('languages', language);
      if (format) form.append('extensions', format);
      if (year) form.append('yearFrom', String(year));

      const res = await this.client.post('/eapi/book/search', form.toString());
      const data = res.data;

      if (data.success !== 1) {
        return { success: false, message: data.error || '搜索失败' };
      }

      if (!data.books || data.books.length === 0) {
        return { success: true, total: 0, books: [], message: '未找到匹配的书籍' };
      }

      const books = data.books.map(book => ({
        id: book.id,
        hash: book.hash || '',
        title: book.title,
        author: book.author,
        year: book.year,
        language: book.language,
        format: book.extension,
        size: book.filesize ? `${(book.filesize / 1024 / 1024).toFixed(1)}MB` : '未知',
        rating: book.rating || 'N/A',
        pages: book.pages || '未知',
        publisher: book.publisher || '未知',
        cover: book.cover || null,
      }));

      return { success: true, total: data.total || books.length, page, limit, books };
    } catch (err) {
      if (err.response?.status === 401) {
        this.remix_userid = null;
        this.remix_userkey = null;
        await this.login();
        return this.searchBooks(params);
      }
      return { success: false, message: `搜索失败: ${err.message}` };
    }
  }

  /**
   * Download a book using EAPI download link.
   * Requires book hash from search results.
   */
  async downloadBook(params = {}) {
    await this.ensureAuth();

    const { bookId, bookHash, format = 'epub', filename } = params;

    if (!bookId) {
      return { success: false, message: '请提供书籍 ID' };
    }

    if (!bookHash) {
      return { success: false, message: '缺少 book_hash（从搜索结果中获取）' };
    }

    try {
      // Step 1: Get book info (includes available formats)
      const infoRes = await this.client.get(`/eapi/book/${bookId}/${bookHash}`);
      const info = infoRes.data;

      if (info.success !== 1) {
        return { success: false, message: info.error || '无法获取书籍信息' };
      }

      // Select best format - prefer requested format, fallback to first available
      let selectedFormat = format;
      if (info.formats && info.formats.length > 0) {
        const available = info.formats.map(f => f.toLowerCase());
        if (!available.includes(format.toLowerCase())) {
          selectedFormat = available[0];
        }
      }

      // Step 2: Get download link
      const dlLinkRes = await this.client.get(`/eapi/book/${bookId}/${bookHash}/file`);
      const dlData = dlLinkRes.data;

      if (dlData.success !== 1) {
        // Try format-specific download
        const fmtRes = await this.client.get(`/eapi/book/${bookId}/${bookHash}/${selectedFormat}/file`);
        if (fmtRes.data.success !== 1) {
          return { success: false, message: '无法获取下载链接' };
        }
        dlData.file = fmtRes.data.file || fmtRes.data;
      }

      let downloadUrl =
        (dlData.file && dlData.file.downloadLink) ||
        dlData.downloadLink ||
        dlData.url ||
        dlData.link;

      if (!downloadUrl) {
        return { success: false, message: '下载链接为空，请尝试其他格式' };
      }

      // Make URL absolute
      if (downloadUrl.startsWith('/')) {
        downloadUrl = `${this.client.defaults.baseURL}${downloadUrl}`;
      }

      // Step 3: Download the file
      const dlOpts = { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5 };
      if (this.proxyUrl) dlOpts.httpsAgent = new HttpsProxyAgent(this.proxyUrl);

      const dlRes = await axios.get(downloadUrl, dlOpts);
      const fileBuffer = Buffer.from(dlRes.data);

      if (!fileBuffer || fileBuffer.length === 0) {
        return { success: false, message: '下载内容为空' };
      }

      // Determine filename from Content-Disposition or use provided
      let ext = selectedFormat;
      const disposition = dlRes.headers['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
        if (match) {
          const serverFilename = decodeURIComponent(match[1]);
          ext = serverFilename.split('.').pop() || ext;
        }
      }

      const safeFilename = (filename || `book_${bookId}`)
        .replace(/[/\\?%*:|"<>]/g, '_').substring(0, 80);
      const fullFilename = `${safeFilename}.${ext}`;

      if (!fs.existsSync(this.downloadDir)) {
        fs.mkdirSync(this.downloadDir, { recursive: true });
      }

      const filePath = path.join(this.downloadDir, fullFilename);
      fs.writeFileSync(filePath, fileBuffer);

      return {
        success: true,
        file_path: filePath,
        filename: fullFilename,
        size: `${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB`,
        format: ext,
      };
    } catch (err) {
      if (err.response?.status === 401) {
        this.remix_userid = null;
        this.remix_userkey = null;
        await this.login();
        return this.downloadBook(params);
      }
      return { success: false, message: `下载失败: ${err.message}` };
    }
  }

  async getDownloadLimits() {
    await this.ensureAuth();
    try {
      const res = await this.client.get('/eapi/user/profile');
      const data = res.data;
      return {
        success: true,
        downloads_today: data.downloads_today || '未知',
        downloads_limit: data.downloads_limit || '未知',
      };
    } catch (err) {
      return { success: false, message: `获取限制失败: ${err.message}` };
    }
  }
}

module.exports = ZLibraryClient;
