/*
 * 纸页工作台
 * 纯浏览器实现：PDF.js 只在当前会话内解析，配置存 localStorage，文件从不上传。
 *
 * 结构：
 *   01 常量与默认配置      02 运行时状态        03 通用工具
 *   04 画布绘制工具        05 任务与进度        06 PDF 与页面渲染
 *   07 排版预览与页列表    08 复制 / 下载       09 头图与封面
 *   10 配置导入导出        11 外壳与初始化
 */
(function () {
  'use strict';

  /* ================= 01 常量与默认配置 ================= */
  // 存储键保留 v3 前缀：改名会让老用户的已保存配置失效。
  // 结构版本走 exportConfig 里的 version 字段，由 migrateSettings 兼容旧结构。
  const SETTINGS_KEY = 'paper-workbench-settings-v3';
  const RATIO = 2.35;              // 封面比例（头图比例可选，见 HEADER_RATIOS）
  // 结构版本：migrateSettings 依据它决定要不要跑老版本升级逻辑。
  // 只增不减；加迁移规则时同步 +1。
  const CONFIG_VERSION = 6;
  const PREVIEW_WIDTH = 880;
  const MAX_OUTPUT_PIXELS = 40_000_000;
  const STAGE_WIDTH = 677;         // 公众号正文宽度

  const DEFAULTS = {
    article: {
      header: {
        enabled: true,
        title: '七年级数学 · 期中模拟卷',
        date: '2026.09',
        difficulty: '中等',
        pages: '共 8 页',
        hint: '需要完整电子版？评论区留言获取链接'
      },
      watermark: {
        enabled: true,
        text: '内部资料 · 请勿外传',
        size: 8,
        opacity: 16,
        color: '#202522'
      },
      output: {
        scale: 4,
        format: 'png',
        quality: 94
      }
    },
    header: {
      width: 1200,
      ratio: '4:5',
      bgMode: 'gradient',
      colorA: '#06372e',
      colorB: '#0f8a68',
      dim: 40,
      font: 'serif',
      textColor: '#f0fdf8',
      accent: '#7ff0c4'
    },
    cover: {
      title: '手写笔记',
      subtitle: '阅读、摘录与思考',
      bgMode: 'color',
      colorA: '#e7ece5',
      colorB: '#c7d9cf',
      dim: 32,
      font: 'serif',
      width: 900,
      textColor: '#202522'
    }
  };

  /* ================= 02 运行时状态 ================= */
  const state = {
    docs: new Map(),
    pages: [],
    pageSeed: 0,
    previewRevision: 0,
    previewQueue: [],
    queuedPreviewIds: new Set(),
    previewRunning: false,
    previewObserver: null,
    currentJob: null,
    draggedPageId: null,
    posterImages: {},        // { header: Image, cover: Image }
    posterImageUrls: {},     // { header: blob: url, ... }
    toastTimer: null,
    posterFrames: {}
  };

  let settings = readSettings();
  const pdfjsLib = window.pdfjsLib;

  /* ================= 03 通用工具 ================= */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const deferred = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function makeId(prefix) {
    state.pageSeed += 1;
    return `${prefix}-${Date.now().toString(36)}-${state.pageSeed}`;
  }

  function stamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function filenameSafe(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 58) || 'page';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function toast(message, isError) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
    element.classList.add('is-showing');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('is-showing'), 3300);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('浏览器无法生成图片'));
      }, type, quality);
    });
  }

  /** 超大页面被自动降采样时，给用户的提示后缀。 */
  const capNote = (job) => (job.cappedPages ? `；${job.cappedPages} 页因超大尺寸已自动保护` : '');

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('图片编码失败'));
      reader.readAsDataURL(blob);
    });
  }

  /* ================= 04 画布绘制工具 ================= */
  const TYPEFACES = {
    serif: '"Songti SC", "STSong", "SimSun", serif',
    sans: '"PingFang SC", "Microsoft YaHei", sans-serif'
  };

  function hexToRgba(hex, alpha) {
    const raw = hex.replace('#', '');
    const rgb = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    const number = Number.parseInt(rgb, 16);
    return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  }

  /** 与 background-size: cover 一致：等比放大至铺满后居中。 */
  function coverPlacement(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
  }

  /** 铺背景：纯色 / 渐变 / 图片 + 遮罩。返回是否使用了深色底。 */
  function paintBackdrop(context, config, width, height, image) {
    if (config.bgMode === 'image' && image) {
      const fit = coverPlacement(image.naturalWidth, image.naturalHeight, width, height);
      context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
      context.fillStyle = `rgba(0, 0, 0, ${Number(config.dim) / 100})`;
      context.fillRect(0, 0, width, height);
    } else if (config.bgMode === 'gradient') {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, config.colorA);
      gradient.addColorStop(1, config.colorB);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    } else {
      context.fillStyle = config.colorA;
      context.fillRect(0, 0, width, height);
    }
  }

  function trackedWidth(context, text, tracking) {
    if (!text) return 0;
    let width = 0;
    for (const char of text) width += context.measureText(char).width;
    return width + Math.max(0, text.length - 1) * tracking;
  }

  function drawTrackedText(context, text, x, y, tracking, align) {
    let cursor = align === 'center' ? x - trackedWidth(context, text, tracking) / 2 : x;
    context.textAlign = 'left';
    for (const char of text) {
      context.fillText(char, cursor, y);
      cursor += context.measureText(char).width + tracking;
    }
  }

  function wrapTrackedText(context, text, maxWidth, tracking) {
    const lines = [];
    String(text || '').split(/\n+/).forEach((paragraph) => {
      let line = '';
      for (const char of paragraph) {
        const candidate = line + char;
        if (line && trackedWidth(context, candidate, tracking) > maxWidth) {
          lines.push(line);
          line = char;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    });
    return lines.length ? lines : [''];
  }

  /**
   * 字号自适应：从 maxSize 逐步缩小，直到文本排进 maxLines 行。
   * 手动换行与自动换行共用同一套规则。
   */
  function fitTitle(context, text, options) {
    const { family, weight, tracking, maxWidth, maxSize, minSize, maxLines } = options;
    let size = maxSize;
    let lines = [];
    do {
      context.font = `${weight} ${size}px ${family}`;
      lines = wrapTrackedText(context, text, maxWidth, tracking);
      if (lines.length <= maxLines || size <= minSize) break;
      size -= Math.max(1, Math.round(size * 0.04));
    } while (size > 12);
    context.font = `${weight} ${size}px ${family}`;
    return { size, lines: lines.slice(0, maxLines), overflow: lines.length > maxLines };
  }

  /* ================= 05 任务与进度 ================= */
  function setArticleActionsDisabled(disabled) {
    ['copy-all-button', 'download-images-button', 'clear-pages-button', 'pdf-input'].forEach((id) => {
      $('#' + id).disabled = disabled;
    });
    [
      'watermark-enabled', 'watermark-text', 'watermark-size', 'watermark-opacity', 'watermark-color',
      'output-scale', 'output-format', 'output-quality',
      'header-enabled', 'header-title', 'header-date', 'header-difficulty', 'header-pages', 'header-hint'
    ].forEach((id) => { $('#' + id).disabled = disabled; });
    $('#upload-zone').classList.toggle('is-disabled', disabled);
    if (!disabled) syncWatermarkControls();
  }

  function startJob(title) {
    if (state.currentJob) {
      toast('已有任务正在处理', true);
      return null;
    }
    const job = {
      id: makeId('job'),
      cancelled: false,
      renderTask: null,
      loadingTask: null,
      title,
      cappedPages: 0
    };
    state.currentJob = job;
    $('#job-title').textContent = title;
    $('#job-detail').textContent = '准备中';
    $('#job-overlay').hidden = false;
    setArticleActionsDisabled(true);
    return job;
  }

  function setJobDetail(job, detail) {
    if (state.currentJob === job) $('#job-detail').textContent = detail;
  }

  function finishJob(job) {
    if (state.currentJob !== job) return;
    state.currentJob = null;
    $('#job-overlay').hidden = true;
    setArticleActionsDisabled(false);
    drainPreviewQueue();
  }

  const jobWasCancelled = (job) => !job || job.cancelled || state.currentJob !== job;

  function assertJob(job) {
    if (jobWasCancelled(job)) {
      const error = new Error('任务已取消');
      error.code = 'CANCELLED';
      throw error;
    }
  }

  function isCancellation(error) {
    return Boolean(error) && (error.code === 'CANCELLED'
      || error.name === 'RenderingCancelledException'
      || /cancel/i.test(error.message || ''));
  }

  function cancelCurrentJob() {
    const job = state.currentJob;
    if (!job) return;
    job.cancelled = true;
    $('#job-title').textContent = '正在取消';
    $('#job-detail').textContent = '等待当前页面停止';
    try { if (job.renderTask) job.renderTask.cancel(); } catch (_) { /* PDF.js 可能已经结束 */ }
    try { if (job.loadingTask) job.loadingTask.destroy(); } catch (_) { /* 同上 */ }
  }

  /* ================= 06 PDF 与页面渲染 ================= */
  function configurePdfJs() {
    if (!pdfjsLib) {
      updateArticleStatus('PDF 引擎未加载', '');
      return false;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_SRC || 'vendor/pdf.worker.min.js';
    return true;
  }

  function drawWatermark(canvas) {
    const config = settings.article.watermark;
    const text = config.text.trim();
    if (!config.enabled || !text) return;

    const context = canvas.getContext('2d');
    const fontSize = Math.max(24, Math.round(canvas.height * Number(config.size) / 100));
    context.save();
    context.globalAlpha = Number(config.opacity) / 100;
    context.fillStyle = config.color;
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 4);
    context.fillText(text, 0, 0);
    context.restore();
  }

  async function renderPageToBlob(pageRecord, purpose, job) {
    const documentRecord = state.docs.get(pageRecord.docId);
    if (!documentRecord) throw new Error('PDF 页面已不存在');
    if (job) assertJob(job);

    const pdfPage = await documentRecord.pdf.getPage(pageRecord.pageNumber);
    const one = pdfPage.getViewport({ scale: 1 });
    const isPreview = purpose === 'preview';
    let scale = isPreview ? Math.max(0.4, PREVIEW_WIDTH / one.width) : Number(settings.article.output.scale);

    let viewport = pdfPage.getViewport({ scale });
    let capped = false;
    if (!isPreview && viewport.width * viewport.height > MAX_OUTPUT_PIXELS) {
      scale *= Math.sqrt(MAX_OUTPUT_PIXELS / (viewport.width * viewport.height));
      viewport = pdfPage.getViewport({ scale });
      capped = true;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = pdfPage.render({ canvasContext: context, viewport, background: '#ffffff' });
    if (job) job.renderTask = renderTask;
    try {
      await renderTask.promise;
      if (job) assertJob(job);
      drawWatermark(canvas);
      const format = isPreview || settings.article.output.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = isPreview ? 0.82 : Number(settings.article.output.quality || 94) / 100;
      const blob = await canvasToBlob(canvas, format, quality);
      return { blob, width: canvas.width, height: canvas.height, capped };
    } finally {
      if (job && job.renderTask === renderTask) job.renderTask = null;
      pdfPage.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  /* ================= 07 排版预览与页列表 ================= */
  function updateArticleStatus(text, mode) {
    const status = $('#article-status');
    status.textContent = text;
    status.classList.toggle('is-working', mode === 'working');
    status.classList.toggle('is-ready', mode === 'ready');
  }

  function ensurePreviewObserver() {
    if (state.previewObserver) return;
    const root = $('#article-preview-scroll');
    state.previewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = state.pages.find((page) => page.id === entry.target.dataset.pageId);
        if (!record) return;
        record.inView = entry.isIntersecting;
        if (entry.isIntersecting) queuePreview(record);
      });
    }, { root, rootMargin: '500px 0px' });
  }

  function releasePreview(record) {
    if (record.previewUrl) URL.revokeObjectURL(record.previewUrl);
    record.previewUrl = null;
    record.previewStatus = 'idle';
    record.previewRevision = -1;
  }

  function updatePreviewNode(record) {
    const node = record.previewNode;
    if (!node) return;
    const isReady = record.previewStatus === 'ready' && record.previewUrl;
    node.classList.toggle('is-loading', !isReady && record.previewStatus !== 'error');
    node.classList.toggle('is-error', record.previewStatus === 'error');
    let image = $('img', node);
    if (isReady) {
      if (!image) {
        image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        node.appendChild(image);
      }
      if (image.src !== record.previewUrl) image.src = record.previewUrl;
    } else if (image) {
      image.remove();
    }

    const thumbHost = record.thumbNode;
    if (!thumbHost) return;
    thumbHost.replaceChildren();
    if (isReady) {
      const thumb = document.createElement('img');
      thumb.className = 'page-thumb';
      thumb.src = record.previewUrl;
      thumb.alt = '';
      thumbHost.appendChild(thumb);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'page-thumb-placeholder';
      placeholder.textContent = record.pageNumber;
      thumbHost.appendChild(placeholder);
    }
  }

  function queuePreview(record) {
    if (!record || state.currentJob) return;
    if (record.previewStatus === 'ready' && record.previewRevision === state.previewRevision) return;
    if (state.queuedPreviewIds.has(record.id)) return;
    state.queuedPreviewIds.add(record.id);
    state.previewQueue.push({ id: record.id, revision: state.previewRevision });
    drainPreviewQueue();
  }

  async function drainPreviewQueue() {
    if (state.previewRunning || state.currentJob) return;
    state.previewRunning = true;
    while (state.previewQueue.length && !state.currentJob) {
      const request = state.previewQueue.shift();
      state.queuedPreviewIds.delete(request.id);
      const record = state.pages.find((page) => page.id === request.id);
      if (!record || request.revision !== state.previewRevision) continue;
      if (!record.inView && state.pages.length > 4) continue;

      record.previewStatus = 'loading';
      updatePreviewNode(record);
      try {
        const result = await renderPageToBlob(record, 'preview');
        if (request.revision !== state.previewRevision || !state.pages.includes(record)) continue;
        if (record.previewUrl) URL.revokeObjectURL(record.previewUrl);
        record.previewUrl = URL.createObjectURL(result.blob);
        record.previewStatus = 'ready';
        record.previewRevision = request.revision;
      } catch (error) {
        if (request.revision !== state.previewRevision) continue;
        console.warn('预览渲染失败', error);
        record.previewStatus = 'error';
      }
      updatePreviewNode(record);
      await nextFrame();
    }
    state.previewRunning = false;
    if (state.previewQueue.length && !state.currentJob) deferred(20).then(drainPreviewQueue);
  }

  function queueVisiblePreviews() {
    const scroll = $('#article-preview-scroll');
    const bounds = scroll.getBoundingClientRect();
    state.pages.forEach((record, index) => {
      const node = record.previewNode;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      record.inView = rect.bottom >= bounds.top - 500 && rect.top <= bounds.bottom + 500;
      if (record.inView || state.pages.length <= 4 || index < 2) queuePreview(record);
    });
  }

  function rebuildArticlePreview() {
    const container = $('#article-preview');
    if (state.previewObserver) state.previewObserver.disconnect();
    container.replaceChildren();

    if (settings.article.header.enabled) container.appendChild(createHeaderPreviewNode());

    if (!state.pages.length) {
      const empty = document.createElement('div');
      empty.className = 'article-empty';
      empty.innerHTML = '<div class="empty-glyph">PDF</div><p>导入手写 PDF 后在这里预览</p>';
      container.appendChild(empty);
      return;
    }

    ensurePreviewObserver();
    state.pages.forEach((record) => {
      const figure = document.createElement('figure');
      figure.className = 'preview-page';
      figure.dataset.pageId = record.id;
      figure.style.setProperty('--page-aspect', `${Math.max(.2, record.aspect) * 100}%`);
      record.previewNode = figure;
      container.appendChild(figure);
      updatePreviewNode(record);
      state.previewObserver.observe(figure);
    });
    requestAnimationFrame(queueVisiblePreviews);
  }

  function createHeaderPreviewNode() {
    const figure = document.createElement('figure');
    figure.className = 'preview-page preview-header';
    figure.id = 'header-preview';
    syncHeaderPreviewAspect(figure);
    return figure;
  }

  /** 预览占位的高度跟着头图比例走。 */
  function syncHeaderPreviewAspect(node) {
    const target = node || $('#header-preview');
    if (target) target.style.setProperty('--page-aspect', `${100 / headerRatio()}%`);
  }

  function updateHeaderPreview() {
    const node = $('#header-preview');
    if (!node) return;
    node.classList.add('is-loading');
    const image = new Image();
    image.alt = '';
    image.onload = () => {
      node.replaceChildren(image);
      node.classList.remove('is-loading');
    };
    image.onerror = () => node.classList.remove('is-loading');
    image.src = headerCanvas().toDataURL('image/png');
  }

  function rebuildPageList() {
    const list = $('#page-list');
    list.replaceChildren();
    state.pages.forEach((record, index) => {
      const row = document.createElement('div');
      row.className = 'page-row';
      row.draggable = true;
      row.dataset.pageId = record.id;
      row.tabIndex = 0;
      row.title = '点击跳转到此页预览';

      const grip = document.createElement('span');
      grip.className = 'page-grip';
      grip.textContent = '···';
      grip.title = '拖动排序';

      const thumb = document.createElement('span');
      record.thumbNode = thumb;

      const meta = document.createElement('span');
      meta.className = 'page-meta';
      const name = document.createElement('span');
      name.className = 'page-name';
      name.textContent = record.name;
      name.title = record.name;
      const sub = document.createElement('span');
      sub.className = 'page-sub';
      sub.textContent = `第 ${record.pageNumber} 页 · ${index + 1}`;
      meta.append(name, sub);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'row-icon-button';
      remove.title = '删除此页';
      remove.setAttribute('aria-label', '删除此页');
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removePage(record.id);
      });

      row.append(grip, thumb, meta, remove);
      bindPageRow(row, record, list);
      list.appendChild(row);
      updatePreviewNode(record);
    });
    $('#page-count').textContent = state.pages.length;
  }

  function bindPageRow(row, record, list) {
    row.addEventListener('click', () => scrollToPage(record));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        scrollToPage(record);
      }
    });
    row.addEventListener('dragstart', (event) => {
      state.draggedPageId = record.id;
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', record.id);
    });
    row.addEventListener('dragend', () => {
      state.draggedPageId = null;
      $$('.page-row', list).forEach((item) => item.classList.remove('is-dragging', 'is-drop-target'));
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!state.draggedPageId || state.draggedPageId === record.id) return;
      row.classList.add('is-drop-target');
      event.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('is-drop-target');
      const dragged = state.draggedPageId || event.dataTransfer.getData('text/plain');
      if (!dragged || dragged === record.id) return;
      const rect = row.getBoundingClientRect();
      movePage(dragged, record.id, event.clientY < rect.top + rect.height / 2);
    });
  }

  function movePage(fromId, targetId, before) {
    const fromIndex = state.pages.findIndex((page) => page.id === fromId);
    const targetIndex = state.pages.findIndex((page) => page.id === targetId);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;
    const [record] = state.pages.splice(fromIndex, 1);
    let insertAt = targetIndex;
    if (fromIndex < targetIndex) insertAt -= 1;
    if (!before) insertAt += 1;
    state.pages.splice(insertAt, 0, record);
    refreshArticleView();
  }

  function removePage(id) {
    if (state.currentJob) return;
    const index = state.pages.findIndex((page) => page.id === id);
    if (index < 0) return;
    const [record] = state.pages.splice(index, 1);
    if (state.previewObserver && record.previewNode) state.previewObserver.unobserve(record.previewNode);
    releasePreview(record);
    refreshArticleView();
  }

  function scrollToPage(record) {
    if (!record || !record.previewNode) return;
    record.previewNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    record.inView = true;
    queuePreview(record);
  }

  function updateArticleSummary() {
    const count = state.pages.length;
    const summary = $('#publish-summary');
    if (!count) {
      summary.textContent = '图片会以 HTML 富文本形式复制。';
      updateArticleStatus('等待 PDF', '');
    } else {
      const header = settings.article.header.enabled ? '头图 + ' : '';
      summary.textContent = `${header}${count} 页将按当前顺序转为高清图片。`;
      updateArticleStatus(`${count} 页已就绪`, 'ready');
    }
    $('#page-count').textContent = count;
  }

  function refreshArticleView() {
    rebuildPageList();
    rebuildArticlePreview();
    updateArticleSummary();
  }

  function invalidatePreviews() {
    state.previewRevision += 1;
    state.previewQueue = [];
    state.queuedPreviewIds.clear();
    state.pages.forEach((record) => {
      releasePreview(record);
      updatePreviewNode(record);
    });
    queueVisiblePreviews();
  }

  const schedulePreviewInvalidation = debounce(invalidatePreviews, 210);

  /* ================= 08 导入 / 复制 / 下载 ================= */
  async function importPdfs(fileList) {
    const selectedFiles = Array.from(fileList || []);
    const files = selectedFiles.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    $('#pdf-input').value = '';
    if (!files.length) {
      toast('请选择 PDF 文件', true);
      return;
    }
    if (!configurePdfJs()) {
      toast('PDF 引擎未加载，请检查 vendor 文件夹', true);
      return;
    }

    const job = startJob('正在导入 PDF');
    if (!job) return;
    let added = 0;
    try {
      for (const file of files) {
        assertJob(job);
        setJobDetail(job, `读取 ${file.name}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        assertJob(job);
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        job.loadingTask = loadingTask;
        const pdf = await loadingTask.promise;
        job.loadingTask = null;
        assertJob(job);

        const docId = makeId('pdf');
        state.docs.set(docId, { id: docId, name: file.name, pdf });
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          assertJob(job);
          setJobDetail(job, `${file.name} · 第 ${pageNumber}/${pdf.numPages} 页`);
          const pdfPage = await pdf.getPage(pageNumber);
          const viewport = pdfPage.getViewport({ scale: 1 });
          pdfPage.cleanup();
          state.pages.push({
            id: makeId('page'),
            docId,
            name: file.name,
            pageNumber,
            aspect: viewport.height / viewport.width,
            previewUrl: null,
            previewStatus: 'idle',
            previewRevision: -1,
            previewNode: null,
            thumbNode: null,
            inView: false
          });
          added += 1;
        }
        await nextFrame();
      }
      refreshArticleView();
      const ignored = selectedFiles.length - files.length;
      toast(`已导入 ${added} 页 PDF${ignored ? `，已忽略 ${ignored} 个非 PDF 文件` : ''}`);
    } catch (error) {
      if (isCancellation(error)) toast('已取消导入');
      else {
        console.error('导入 PDF 失败', error);
        toast(`PDF 读取失败：${error.message || '请检查文件'}`, true);
      }
      refreshArticleView();
    } finally {
      finishJob(job);
    }
  }

  function clearAllPages() {
    if (state.currentJob || !state.pages.length) return;
    if (!window.confirm(`清空当前 ${state.pages.length} 页 PDF？此操作不会影响已保存的配置。`)) return;
    state.pages.forEach((record) => releasePreview(record));
    state.docs.forEach((record) => {
      try { record.pdf.destroy(); } catch (_) { /* 可能已被销毁 */ }
    });
    state.docs.clear();
    state.pages = [];
    state.previewQueue = [];
    state.queuedPreviewIds.clear();
    refreshArticleView();
  }

  /** 当前设置下的头图 PNG（导出前先重绘，确保与界面一致）。 */
  async function headerPngBlob() {
    drawHeader();
    return canvasToBlob(headerCanvas(), 'image/png');
  }

  /** 头图 + 所有页面 → 一段可直接粘贴进公众号的 HTML。 */
  async function createArticleHtml(pageSnapshot, job) {
    const parts = [`<section style="margin:0;padding:0;width:100%;max-width:${STAGE_WIDTH}px;">`];
    if (settings.article.header.enabled) {
      setJobDetail(job, '生成头图');
      const dataUrl = await blobToDataUrl(await headerPngBlob());
      parts.push(`<p style="margin:0 0 18px;line-height:0;"><img src="${dataUrl}" alt="试卷信息头图" style="display:block;width:100%;height:auto;border:0;"></p>`);
    }
    for (let index = 0; index < pageSnapshot.length; index += 1) {
      assertJob(job);
      setJobDetail(job, `生成高清图片 ${index + 1} / ${pageSnapshot.length}`);
      const result = await renderPageToBlob(pageSnapshot[index], 'output', job);
      if (result.capped) job.cappedPages += 1;
      const dataUrl = await blobToDataUrl(result.blob);
      parts.push(`<p style="margin:0 0 16px;line-height:0;"><img src="${dataUrl}" alt="${escapeHtml(`第 ${index + 1} 页`)}" style="display:block;width:100%;height:auto;border:0;"></p>`);
      await nextFrame();
    }
    parts.push('</section>');
    return parts.join('');
  }

  function legacyCopyHtml(html) {
    const host = document.createElement('div');
    host.contentEditable = 'true';
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${STAGE_WIDTH}px;opacity:0;pointer-events:none;`;
    host.innerHTML = html;
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
    selection.removeAllRanges();
    host.remove();
    return copied;
  }

  async function copyAllPages() {
    if (!state.pages.length) {
      toast('请先导入 PDF', true);
      return;
    }
    const snapshot = state.pages.slice();
    const job = startJob('正在准备公众号内容');
    if (!job) return;
    try {
      // Chromium 支持把 Promise 放进 ClipboardItem：点击瞬间申请剪贴板权限，
      // 再串行生成大图，避免长时间渲染后失去用户激活状态。
      const htmlPromise = createArticleHtml(snapshot, job);
      let copied = false;
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({
            'text/html': htmlPromise.then((html) => new Blob([html], { type: 'text/html' })),
            'text/plain': htmlPromise.then(() => new Blob([`${snapshot.length} 张公众号图片`], { type: 'text/plain' }))
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (clipboardError) {
          console.info('系统剪贴板不可用，改用兼容复制', clipboardError);
        }
      }
      if (!copied) copied = legacyCopyHtml(await htmlPromise);
      if (!copied) throw new Error('浏览器拒绝了剪贴板访问，请使用 Chrome 并通过 localhost 打开页面');
      toast(`已复制 ${snapshot.length} 页图片${capNote(job)}`);
    } catch (error) {
      if (isCancellation(error)) toast('已取消复制');
      else {
        console.error('复制失败', error);
        toast(error.message || '复制失败', true);
      }
    } finally {
      finishJob(job);
    }
  }

  async function downloadImages() {
    if (!state.pages.length) {
      toast('请先导入 PDF', true);
      return;
    }
    if (!window.JSZip) {
      toast('图片打包组件未加载', true);
      return;
    }
    const snapshot = state.pages.slice();
    const job = startJob('正在打包高清图片');
    if (!job) return;
    try {
      const zip = new JSZip();
      const extension = settings.article.output.format === 'jpeg' ? 'jpg' : 'png';
      if (settings.article.header.enabled) {
        setJobDetail(job, '生成头图');
        zip.file('00-头图.png', await headerPngBlob());
      }
      for (let index = 0; index < snapshot.length; index += 1) {
        assertJob(job);
        setJobDetail(job, `生成高清图片 ${index + 1} / ${snapshot.length}`);
        const result = await renderPageToBlob(snapshot[index], 'output', job);
        if (result.capped) job.cappedPages += 1;
        zip.file(`${String(index + 1).padStart(2, '0')}-${filenameSafe(snapshot[index].name)}.${extension}`, result.blob);
        await nextFrame();
      }
      setJobDetail(job, '正在压缩图片包');
      const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        assertJob(job);
        setJobDetail(job, `正在压缩图片包 ${Math.round(meta.percent)}%`);
      });
      assertJob(job);
      downloadBlob(blob, `公众号图片-${stamp()}.zip`);
      toast(`已下载 ${snapshot.length} 张图片${capNote(job)}`);
    } catch (error) {
      if (isCancellation(error)) toast('已取消下载');
      else {
        console.error('下载失败', error);
        toast(error.message || '图片打包失败', true);
      }
    } finally {
      finishJob(job);
    }
  }

  /* ================= 09 头图与封面 ================= */

  /**
   * 多色系色板：每组含渐变两端、正文色与强调色。
   * 头图整组切换，封面用同一份色板随机换色，两边色系保持一致。
   */
  const POSTER_PALETTES = [
    { name: '青竹', colorA: '#06372e', colorB: '#0f8a68', textColor: '#f0fdf8', accent: '#7ff0c4' },
    { name: '朱砂', colorA: '#4a0b16', colorB: '#b31f3f', textColor: '#fff4f1', accent: '#ffb07a' },
    { name: '靛蓝', colorA: '#101a4d', colorB: '#2f4bd6', textColor: '#f2f5ff', accent: '#8fd0ff' },
    { name: '琥珀', colorA: '#4a2405', colorB: '#d97706', textColor: '#fffaf0', accent: '#ffd88a' },
    { name: '紫罗兰', colorA: '#2b0a4d', colorB: '#7c3aed', textColor: '#faf5ff', accent: '#e0b4ff' },
    { name: '松墨', colorA: '#14181c', colorB: '#39424c', textColor: '#f5f7f8', accent: '#9fb3c8' },
    { name: '海蓝', colorA: '#04283f', colorB: '#0284c7', textColor: '#f0f9ff', accent: '#7dd3fc' },
    { name: '苔绿', colorA: '#1c2f0a', colorB: '#4d7c0f', textColor: '#f7fde8', accent: '#c6f06a' },
    { name: '蜜桃', colorA: '#701a3c', colorB: '#ec4899', textColor: '#fff5fa', accent: '#ffd1e6' },
    { name: '砖红', colorA: '#4a1006', colorB: '#c2410c', textColor: '#fff6f0', accent: '#fdba74' },
    { name: '素纸', colorA: '#f7f3ea', colorB: '#e3d7bd', textColor: '#231f19', accent: '#b45309' },
    { name: '初雪', colorA: '#f5f8fc', colorB: '#d7e4f3', textColor: '#16222f', accent: '#2563eb' }
  ];

  // 头图比例：竖版给足纵向空间，版式就不用为了塞进画面而缩字号。
  const HEADER_RATIOS = {
    '4:5': 4 / 5,
    '3:4': 3 / 4,
    '1:1': 1,
    '4:3': 4 / 3,
    '3:2': 3 / 2,
    '16:9': 16 / 9
  };
  const headerRatio = () => HEADER_RATIOS[settings.header.ratio] || 4 / 5;

  const poster = (kind) => (kind === 'header' ? settings.header : settings.cover);

  const headerCanvas = () => $('#header-canvas');
  const coverCanvas = () => $('#cover-canvas');

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (context.roundRect) context.roundRect(x, y, width, height, radius);
    else context.rect(x, y, width, height);
  }

  /** 单行文本按可用宽度缩号，返回最终字号。 */
  function fitOneLine(context, text, family, weight, maxSize, minSize, maxWidth) {
    let size = maxSize;
    context.font = `${weight} ${size}px ${family}`;
    while (size > minSize && context.measureText(text).width > maxWidth) {
      size -= 1;
      context.font = `${weight} ${size}px ${family}`;
    }
    return size;
  }

  /** 装饰圆：给大片背景一点呼吸，颜色跟着强调色走。 */
  function paintDecor(context, config, width, height) {
    context.save();
    context.globalAlpha = 0.08;
    context.fillStyle = config.accent || config.textColor;
    context.beginPath();
    context.arc(width * 0.95, height * 0.03, Math.min(width, height) * 0.55, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /**
   * 头图排版计算。
   *
   * 手机上图片会被压到屏幕宽度（约 350px），所以每块字号都按画布宽度的
   * 百分比给，而不是固定像素——缩到手机上才还看得清：
   *   标题 9.5%，信息值 6.2%，信息标签 4%，获取提示 4.5%。
   * 换算到 350px 宽的手机上分别约 33 / 22 / 14 / 16 px。
   *
   * 纵向排布先量出各块高度，再把剩余空间平摊到块与块之间，
   * 所以画布越高、内容越少，留白越大，而不会挤在中间。
   * 内容超出可用高度时由调用方按 scale 整体缩号。
   */
  function measureHeader(context, config, info, pageCount, width, height, scale) {
    const family = TYPEFACES[config.font] || TYPEFACES.serif;
    const px = (ratio, floor) => Math.max(floor || 1, Math.round(width * ratio * scale));
    const pad = Math.round(width * 0.07);
    const inner = width - pad * 2;
    const tracking = Math.round(width * 0.004);

    // —— 标题：最多两行，右侧留出安全区 ——
    const titleText = info.title.trim() || '试卷标题';
    const titleFit = fitTitle(context, titleText, {
      family, weight: 700, tracking, maxWidth: inner * 0.92,
      maxSize: px(0.095), minSize: px(0.05, 24), maxLines: 2
    });
    // 已经缩到最小字号还放不下时，宁可多排一行，也不把标题截掉。
    const titleLines = titleFit.overflow
      ? wrapTrackedText(context, titleText, inner * 0.92, tracking).slice(0, 3)
      : titleFit.lines;
    const titleLineHeight = Math.round(titleFit.size * 1.26);
    const titleHeight = titleFit.size + titleLineHeight * (titleLines.length - 1);

    // —— 信息组：时间 / 难度 / 页数，各占一列，数值尽量大 ——
    const fields = [
      { label: '时间', value: info.date.trim() },
      { label: '难度', value: info.difficulty.trim() },
      { label: '页数', value: info.pages.trim() || (pageCount > 0 ? `共 ${pageCount} 页` : '') }
    ].filter((field) => field.value);
    const labelSize = Math.max(Math.round(width * 0.0355), px(0.04, 13));
    // 数值不能盖过标题，否则层级就反了。
    const valueSize = Math.min(px(0.062, 18), Math.round(titleFit.size * 0.85));
    const fieldWidth = fields.length ? inner / fields.length : 0;
    const fieldSizes = fields.map((field) => fitOneLine(
      context, field.value, family, 700, valueSize, px(0.036, 12), fieldWidth * 0.88
    ));
    const labelGap = Math.round(width * 0.024 * scale);
    const metaHeight = fields.length ? labelSize + labelGap + valueSize : 0;

    // —— 获取提示：做成胶囊 ——
    // 标签和提示带一个不随 scale 下降的下限：扁比例 + 超长文案时宁可标题小一点，
    // 也不能把这两行缩到手机上读不出来（0.0355 ≈ 350px 手机上的 12.4px）。
    const hintBase = Math.max(Math.round(width * 0.039), px(0.045, 14));
    const hintPadX = Math.round(width * 0.042 * scale);
    const hintPadY = Math.round(width * 0.028 * scale);
    const hintText = info.hint.trim();
    const hintMaxWidth = inner - hintPadX * 2;
    const hintFit = hintText
      ? fitTitle(context, hintText, {
        family, weight: 600, tracking: 0, maxWidth: hintMaxWidth,
        maxSize: hintBase, minSize: Math.round(width * 0.032), maxLines: 2
      })
      : { size: hintBase, lines: [], overflow: false };
    // 同上：缩到最小还放不下就多排一行，不做截断。
    const hintLines = hintFit.overflow
      ? wrapTrackedText(context, hintText, hintMaxWidth, 0).slice(0, 3)
      : hintFit.lines;
    const hintSize = hintFit.size;
    const hintLineHeight = Math.round(hintSize * 1.4);
    const hintHeight = hintLines.length ? hintLineHeight * hintLines.length + hintPadY * 2 : 0;
    const hintWidth = hintLines.length
      ? Math.min(inner, Math.max(...hintLines.map((line) => context.measureText(line).width)) + hintPadX * 2)
      : 0;

    // —— 纵向排布：块之间尽量撑开，块数少时留白更大 ——
    const rows = [{ kind: 'bar', height: px(0.013, 4) }, { kind: 'title', height: titleHeight }];
    if (metaHeight) rows.push({ kind: 'meta', height: metaHeight });
    if (hintHeight) rows.push({ kind: 'hint', height: hintHeight });

    const available = height - pad * 2;
    const contentHeight = rows.reduce((sum, row) => sum + row.height, 0);
    const gapCount = rows.length - 1;
    const minGap = Math.round(height * 0.025);
    let gap = Math.round(height * 0.05);
    if (gapCount > 0 && available > contentHeight) {
      // 上限 18%：竖版画布上空间够就尽量铺开，但内容很少时也不至于散架。
      // 向下取整：宁可少留 1px，也不要因为进位而排不下、白白触发缩号。
      gap = Math.max(minGap, Math.min(Math.round(height * 0.18), Math.floor((available - contentHeight) / gapCount)));
    }
    const total = contentHeight + gap * gapCount;
    let cursor = pad + Math.max(0, Math.round((available - total) / 2));
    rows.forEach((row, index) => {
      row.top = cursor;
      cursor += row.height + (index < gapCount ? gap : 0);
    });

    return {
      family, pad, inner, tracking, total, fits: total <= available,
      titleSize: titleFit.size, titleLines, titleLineHeight,
      fields, fieldWidth, fieldSizes,
      labelSize, labelGap, valueSize, hintSize, hintPadX, hintPadY,
      hintLines, hintLineHeight, hintWidth, rows
    };
  }

  function drawHeader() {
    const canvas = headerCanvas();
    const config = settings.header;
    const info = settings.article.header;
    const width = Number(config.width);
    const height = Math.round(width / headerRatio());
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    paintBackdrop(context, config, width, height, state.posterImages.header);
    paintDecor(context, config, width, height);

    // 内容排不下时（超长文案 + 扁比例）整体缩号，最多缩到 7 成。
    let layout = null;
    for (let scale = 1; scale >= 0.7; scale -= 0.05) {
      layout = measureHeader(context, config, info, state.pages.length, width, height, scale);
      if (layout.fits) break;
    }

    const ink = config.textColor;
    const accent = config.accent || config.textColor;
    const row = (kind) => layout.rows.find((item) => item.kind === kind);

    // 强调条
    const bar = row('bar');
    context.fillStyle = accent;
    roundedRect(context, layout.pad, bar.top, Math.round(width * 0.09), bar.height, bar.height / 2);
    context.fill();

    // 标题
    const titleRow = row('title');
    context.fillStyle = ink;
    context.font = `700 ${layout.titleSize}px ${layout.family}`;
    layout.titleLines.forEach((line, index) => {
      drawTrackedText(context, line, layout.pad, titleRow.top + layout.titleSize * 0.82 + layout.titleLineHeight * index, layout.tracking, 'left');
    });

    // 信息组：小标签 + 大数值
    const metaRow = row('meta');
    if (metaRow) {
      layout.fields.forEach((field, index) => {
        const x = layout.pad + layout.fieldWidth * index;
        context.fillStyle = hexToRgba(ink, .55);
        context.font = `600 ${layout.labelSize}px ${layout.family}`;
        context.fillText(field.label, x, metaRow.top + layout.labelSize * 0.82);
        context.fillStyle = ink;
        context.font = `700 ${layout.fieldSizes[index]}px ${layout.family}`;
        context.fillText(field.value, x, metaRow.top + metaRow.height - layout.valueSize * 0.18);
      });
    }

    // 获取提示胶囊
    const hintRow = row('hint');
    if (hintRow) {
      context.fillStyle = hexToRgba(accent, .16);
      roundedRect(context, layout.pad, hintRow.top, layout.hintWidth, hintRow.height, Math.round(layout.hintSize * 0.5));
      context.fill();
      context.fillStyle = accent;
      context.font = `600 ${layout.hintSize}px ${layout.family}`;
      layout.hintLines.forEach((line, index) => {
        context.fillText(line, layout.pad + layout.hintPadX, hintRow.top + layout.hintPadY + layout.hintSize * 0.82 + layout.hintLineHeight * index);
      });
    }

    $('#header-status').textContent = `${width} × ${height} px · ${config.ratio}`;
  }

  function drawCover() {
    const canvas = coverCanvas();
    const config = settings.cover;
    const width = Number(config.width);
    const height = Math.round(width / RATIO);
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    paintBackdrop(context, config, width, height, state.posterImages.cover);

    const family = TYPEFACES[config.font] || TYPEFACES.serif;
    const anchor = width / 2;
    const tracking = Math.max(0, width * 0.004);

    // 主标题稳定容纳两行，手动换行和自动换行使用同一套规则。
    const titleFit = fitTitle(context, config.title.trim() || '手写笔记', {
      family, weight: 700, tracking, maxWidth: width * 0.84,
      maxSize: Math.round(width * 0.108), minSize: Math.max(26, Math.round(width * 0.04)), maxLines: 2
    });
    const titleSize = titleFit.size;
    const titleLines = titleFit.lines;
    const lineHeight = Math.round(titleSize * 1.18);

    const subtitle = config.subtitle.trim();
    const subtitleSize = Math.max(14, Math.round(width * 0.028));
    const subtitleGap = subtitle ? Math.round(titleSize * 0.52) : 0;
    const titleBlockHeight = titleSize + lineHeight * Math.max(0, titleLines.length - 1);
    const blockHeight = titleBlockHeight + (subtitle ? subtitleSize + subtitleGap : 0);
    const firstBaseline = (height - blockHeight) / 2 + titleSize * 0.82;

    context.fillStyle = config.textColor;
    context.font = `700 ${titleSize}px ${family}`;
    titleLines.forEach((line, index) => drawTrackedText(context, line, anchor, firstBaseline + lineHeight * index, tracking, 'center'));

    if (subtitle) {
      const lastBaseline = firstBaseline + lineHeight * (titleLines.length - 1);
      context.fillStyle = hexToRgba(config.textColor, .62);
      context.font = `500 ${subtitleSize}px ${family}`;
      drawTrackedText(context, subtitle, anchor, lastBaseline + titleSize * 0.18 + subtitleGap + subtitleSize * 0.78, Math.max(1, width * 0.001), 'center');
    }

    $('#cover-status').textContent = `${width} × ${height} px`;
  }

  const DRAWERS = { header: drawHeader, cover: drawCover };

  /** 合并同一帧内的多次重绘请求。 */
  function schedulePosterDraw(kind) {
    if (state.posterFrames[kind]) cancelAnimationFrame(state.posterFrames[kind]);
    state.posterFrames[kind] = requestAnimationFrame(() => {
      state.posterFrames[kind] = null;
      DRAWERS[kind]();
    });
  }

  const scheduleCoverDraw = () => schedulePosterDraw('cover');
  const scheduleHeaderDraw = () => schedulePosterDraw('header');

  function syncPosterSegments(kind) {
    $$(`[data-${kind}-bg]`).forEach((button) => {
      button.classList.toggle('is-active', button.dataset[`${kind}Bg`] === poster(kind).bgMode);
    });
  }

  function syncPosterVisibility(kind) {
    const mode = poster(kind).bgMode;
    $(`#${kind}-color-b-field`).classList.toggle('is-hidden', mode !== 'gradient');
    $(`#${kind}-image-field`).classList.toggle('is-hidden', mode !== 'image');
    $(`#${kind}-dim-field`).classList.toggle('is-hidden', mode !== 'image');
  }

  function randomPalette(kind) {
    const candidates = POSTER_PALETTES.filter((item) => item.colorA !== poster(kind).colorA);
    return candidates[Math.floor(Math.random() * candidates.length)] || POSTER_PALETTES[0];
  }

  /**
   * 头图 / 封面共用一套控件绑定。
   * suffix 拼出 #<kind>-<suffix>，key 是配置字段；kinds 限定只给某个面板用。
   */
  const POSTER_CONTROLS = [
    { suffix: 'width', key: 'width', read: Number },
    { suffix: 'color-a', key: 'colorA' },
    { suffix: 'color-b', key: 'colorB' },
    { suffix: 'dim', key: 'dim', read: Number },
    { suffix: 'font', key: 'font' },
    { suffix: 'text-color', key: 'textColor' },
    { suffix: 'accent', key: 'accent', kinds: ['header'] },
    { suffix: 'ratio', key: 'ratio', kinds: ['header'], after: syncHeaderPreviewAspect }
  ];

  const controlsFor = (kind) => POSTER_CONTROLS.filter((control) => !control.kinds || control.kinds.includes(kind));

  /** 各面板独有的控件：头图用色板格子换色，封面用「换一组配色」按钮。 */
  const POSTER_PANELS = {
    header: { paletteButton: false },
    cover: { paletteButton: true }
  };

  function bindPosterPanel(kind) {
    const draw = () => schedulePosterDraw(kind);
    const apply = (control) => (event) => {
      const read = control.read || String;
      patchSettings({ [kind]: { [control.key]: read(event.target.value) } });
      if (control.key === 'dim') $(`#${kind}-dim-output`).textContent = `${poster(kind).dim}%`;
      if (control.after) control.after();
      if (kind === 'header') refreshArticlePreviewHeader();
      draw();
    };

    controlsFor(kind).forEach((control) => {
      const element = $(`#${kind}-${control.suffix}`);
      // <select> 只需 change；range / color / text 用 input 才能实时预览。
      element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', apply(control));
    });

    $$(`[data-${kind}-bg]`).forEach((button) => button.addEventListener('click', () => {
      patchSettings({ [kind]: { bgMode: button.dataset[`${kind}Bg`] } });
      syncPosterSegments(kind);
      syncPosterVisibility(kind);
      if (kind === 'header') refreshArticlePreviewHeader();
      draw();
    }));

    $(`#${kind}-image`).addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        if (state.posterImageUrls[kind]) URL.revokeObjectURL(state.posterImageUrls[kind]);
        state.posterImages[kind] = image;
        state.posterImageUrls[kind] = url;
        draw();
        toast('背景图片已载入');
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        toast('背景图片无法读取', true);
      };
      image.src = url;
    });

    // 头图用色板格子整组换色，封面保留「换一组配色」按钮。
    if (POSTER_PANELS[kind].paletteButton) $(`#${kind}-palette-button`).addEventListener('click', () => {
      patchSettings({ [kind]: randomPalette(kind) });
      hydratePosterPanel(kind);
      draw();
    });

    $(`#download-${kind}-button`).addEventListener('click', () => downloadPoster(kind));
    $(`#copy-${kind}-button`).addEventListener('click', () => copyPoster(kind));
  }

  /** 把头图色板渲染成一排可点的色系格子。 */
  function renderHeaderPalettes() {
    const host = $('#header-palette-list');
    host.replaceChildren();
    POSTER_PALETTES.forEach((palette) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'palette-chip';
      chip.title = palette.name;
      chip.setAttribute('aria-label', `配色：${palette.name}`);
      chip.style.setProperty('--chip-a', palette.colorA);
      chip.style.setProperty('--chip-b', palette.colorB);
      chip.style.setProperty('--chip-accent', palette.accent);
      chip.addEventListener('click', () => {
        patchSettings({
          header: {
            colorA: palette.colorA,
            colorB: palette.colorB,
            textColor: palette.textColor,
            accent: palette.accent
          }
        });
        hydratePosterPanel('header');
        scheduleHeaderDraw();
        refreshArticlePreviewHeader();
      });
      host.appendChild(chip);
    });
  }

  /** 头图改动后同步到排版里的头部占位块。 */
  let headerPreviewTimer = null;
  function refreshArticlePreviewHeader() {
    clearTimeout(headerPreviewTimer);
    headerPreviewTimer = setTimeout(updateHeaderPreview, 180);
  }

  function hydrateHeaderCopyControls() {
    const info = settings.article.header;
    $('#header-enabled').checked = info.enabled;
    $('#header-title').value = info.title;
    $('#header-date').value = info.date;
    $('#header-difficulty').value = info.difficulty;
    $('#header-pages').value = info.pages;
    $('#header-hint').value = info.hint;
  }

  function bindHeaderCopyControls() {
    const fields = [
      ['header-title', 'title'],
      ['header-date', 'date'],
      ['header-difficulty', 'difficulty'],
      ['header-pages', 'pages'],
      ['header-hint', 'hint']
    ];
    fields.forEach(([id, key]) => {
      $('#' + id).addEventListener('input', (event) => {
        patchSettings({ article: { header: { [key]: event.target.value } } });
        scheduleHeaderDraw();
        refreshArticlePreviewHeader();
      });
    });
    $('#header-enabled').addEventListener('change', (event) => {
      patchSettings({ article: { header: { enabled: event.target.checked } } });
      $('#header-preview')?.remove();
      rebuildArticlePreview();
      updateArticleSummary();
    });
    $('#header-sync-button').addEventListener('click', () => {
      const { colorA, colorB, textColor } = settings.cover;
      patchSettings({ header: { colorA, colorB, textColor } });
      hydratePosterPanel('header');
      scheduleHeaderDraw();
      toast('已同步封面配色');
    });
  }

  function hydratePosterPanel(kind) {
    const config = poster(kind);
    controlsFor(kind).forEach((control) => {
      const element = $(`#${kind}-${control.suffix}`);
      if (element) element.value = String(config[control.key]);
    });
    $(`#${kind}-dim-output`).textContent = `${config.dim}%`;
    syncPosterVisibility(kind);
    syncPosterSegments(kind);
  }

  function hydrateCoverControls() {
    const config = settings.cover;
    $('#cover-title').value = config.title;
    $('#cover-subtitle').value = config.subtitle;
    hydratePosterPanel('cover');
  }

  function bindCoverControls() {
    const fields = [['cover-title', 'title'], ['cover-subtitle', 'subtitle']];
    fields.forEach(([id, key]) => {
      $('#' + id).addEventListener('input', (event) => {
        patchSettings({ cover: { [key]: event.target.value } });
        scheduleCoverDraw();
      });
    });
    bindPosterPanel('cover');
  }

  async function posterBlob(kind) {
    DRAWERS[kind]();
    return canvasToBlob(kind === 'header' ? headerCanvas() : coverCanvas(), 'image/png');
  }

  async function downloadPoster(kind) {
    try {
      downloadBlob(await posterBlob(kind), `公众号${kind === 'header' ? '头图' : '封面'}-${stamp()}.png`);
      toast(kind === 'header' ? '已下载头图' : '已下载封面');
    } catch (error) {
      console.error('导出失败', error);
      toast('导出失败', true);
    }
  }

  async function copyPoster(kind) {
    const label = kind === 'header' ? '头图' : '封面';
    try {
      const blob = await posterBlob(kind);
      let copied = false;
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copied = true;
        } catch (_) { /* 走兼容复制 */ }
      }
      if (!copied) copied = legacyCopyHtml(`<img src="${await blobToDataUrl(blob)}" alt="${label}" style="display:block;max-width:100%;">`);
      if (!copied) throw new Error('浏览器拒绝了剪贴板访问');
      toast(`已复制${label}`);
    } catch (error) {
      console.error('复制失败', error);
      toast(error.message || `复制${label}失败`, true);
    }
  }

  /* ================= 10 配置导入导出 ================= */
  function merge(base, incoming) {
    if (!incoming || typeof incoming !== 'object') return clone(base);
    const result = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(incoming).forEach((key) => {
      const left = result[key];
      const right = incoming[key];
      // 导入的配置可能缺少新版本字段，避免 undefined 覆盖默认值。
      if (right === undefined) return;
      if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
        result[key] = merge(left, right);
      } else {
        result[key] = right;
      }
    });
    return result;
  }

  function migrateSettings(value) {
    const payload = value && value.settings ? value.settings : (value && value.config ? value.config : value);
    const version = value && typeof value.version === 'number' ? value.version : 0;
    if (!payload || typeof payload !== 'object') return clone(DEFAULTS);

    // 兼容旧版导出（水印 / 导出设置平铺在顶层），导入后即保存为新版结构。
    if (payload.watermark || payload.export) {
      const oldWatermark = payload.watermark || {};
      const oldExport = payload.export || {};
      return merge(DEFAULTS, {
        article: {
          watermark: {
            enabled: oldWatermark.enabled,
            text: oldWatermark.text,
            size: oldWatermark.size,
            opacity: oldWatermark.alpha,
            color: oldWatermark.color
          },
          output: { scale: oldExport.scale, format: oldExport.format }
        },
        cover: payload.cover || {}
      });
    }

    const merged = merge(DEFAULTS, payload);

    // v6：头图改版。只在从更早版本升级时跑一次——否则用户每次重新打开都会
    // 被打回默认值，连自己选的 4:3 都存不住。
    if (version < 6) {
      // 没有 accent 字段的是旧版柔和纸色，整组换成新的多色系默认值。
      if (!payload.header || payload.header.accent === undefined) {
        ['bgMode', 'colorA', 'colorB', 'textColor', 'accent'].forEach((key) => {
          merged.header[key] = DEFAULTS.header[key];
        });
      }
      // 4:3 是旧版默认比例，偏扁、留白不够，跟随新默认换成竖版。
      if (merged.header.ratio === '4:3') merged.header.ratio = DEFAULTS.header.ratio;
    }
    return merged;
  }

  function readSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? migrateSettings(JSON.parse(raw)) : clone(DEFAULTS);
    } catch (_) {
      return clone(DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      // 带上结构版本，迁移逻辑才知道下次要不要跑（否则会反复重置用户选择）。
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: CONFIG_VERSION, settings }));
    } catch (error) {
      console.warn('配置保存失败', error);
    }
  }

  function patchSettings(next) {
    settings = merge(settings, next);
    saveSettings();
  }

  function exportConfig() {
    const payload = { version: CONFIG_VERSION, exportedAt: new Date().toISOString(), settings };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `纸页工作台配置-${stamp()}.json`);
    toast('已导出配置');
  }

  async function importConfig(file) {
    if (!file) return;
    try {
      settings = migrateSettings(JSON.parse(await file.text()));
      saveSettings();
      hydrateAll();
      invalidatePreviews();
      rebuildArticlePreview();
      updateArticleSummary();
      scheduleCoverDraw();
      scheduleHeaderDraw();
      toast('已导入配置');
    } catch (error) {
      console.error('配置导入失败', error);
      toast('配置文件无法读取', true);
    } finally {
      $('#config-input').value = '';
    }
  }

  function resetConfig() {
    if (state.currentJob) {
      toast('任务处理中，请完成后再恢复配置', true);
      return;
    }
    if (!window.confirm('恢复默认配置？当前水印、导出、头图和封面设置会被覆盖。')) return;
    settings = clone(DEFAULTS);
    saveSettings();
    hydrateAll();
    invalidatePreviews();
    rebuildArticlePreview();
    updateArticleSummary();
    scheduleCoverDraw();
    scheduleHeaderDraw();
    toast('已恢复默认配置');
  }

  /* ================= 11 外壳与初始化 ================= */
  function syncWatermarkControls() {
    const enabled = $('#watermark-enabled').checked;
    ['watermark-text', 'watermark-size', 'watermark-opacity', 'watermark-color'].forEach((id) => {
      $('#' + id).disabled = !enabled;
    });
  }

  function syncOutputControls() {
    $('#output-quality-field').classList.toggle('is-hidden', settings.article.output.format !== 'jpeg');
  }

  function updateWatermarkOutputs() {
    const watermark = settings.article.watermark;
    $('#watermark-size-output').textContent = `${Number(watermark.size).toFixed(1).replace('.0', '')}%`;
    $('#watermark-opacity-output').textContent = `${watermark.opacity}%`;
  }

  function hydrateArticleControls() {
    const watermark = settings.article.watermark;
    $('#watermark-enabled').checked = watermark.enabled;
    $('#watermark-text').value = watermark.text;
    $('#watermark-size').value = watermark.size;
    $('#watermark-opacity').value = watermark.opacity;
    $('#watermark-color').value = watermark.color;
    $('#output-scale').value = String(settings.article.output.scale);
    $('#output-format').value = settings.article.output.format;
    $('#output-quality').value = String(settings.article.output.quality);
    $('#output-quality-output').textContent = `${settings.article.output.quality}%`;
    syncWatermarkControls();
    updateWatermarkOutputs();
    syncOutputControls();
    hydrateHeaderCopyControls();
  }

  function hydrateAll() {
    hydrateArticleControls();
    hydrateCoverControls();
    hydratePosterPanel('header');
    hydrateHeaderCopyControls();
  }

  function bindArticleControls() {
    $('#watermark-enabled').addEventListener('change', (event) => {
      patchSettings({ article: { watermark: { enabled: event.target.checked } } });
      syncWatermarkControls();
      invalidatePreviews();
    });
    const watermarkInputs = [
      ['watermark-text', 'text', String, updateWatermarkOutputs],
      ['watermark-size', 'size', Number, updateWatermarkOutputs],
      ['watermark-opacity', 'opacity', Number, updateWatermarkOutputs],
      ['watermark-color', 'color', String, null]
    ];
    watermarkInputs.forEach(([id, key, transform, after]) => {
      $('#' + id).addEventListener('input', (event) => {
        patchSettings({ article: { watermark: { [key]: transform(event.target.value) } } });
        if (after) after();
        schedulePreviewInvalidation();
      });
    });
    [['output-scale', 'scale', Number], ['output-format', 'format', String], ['output-quality', 'quality', Number]]
      .forEach(([id, key, transform]) => {
        $('#' + id).addEventListener('change', (event) => patchSettings({ article: { output: { [key]: transform(event.target.value) } } }));
        $('#' + id).addEventListener('input', (event) => {
          patchSettings({ article: { output: { [key]: transform(event.target.value) } } });
          if (key === 'quality') $('#output-quality-output').textContent = `${settings.article.output.quality}%`;
          if (key === 'format') syncOutputControls();
        });
      });

    $('#pdf-input').addEventListener('change', (event) => importPdfs(event.target.files));
    $('#clear-pages-button').addEventListener('click', clearAllPages);
    $('#copy-all-button').addEventListener('click', copyAllPages);
    $('#download-images-button').addEventListener('click', downloadImages);

    const zone = $('#upload-zone');
    ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
      event.preventDefault();
      if (!state.currentJob) zone.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
      event.preventDefault();
      zone.classList.remove('is-dragover');
    }));
    zone.addEventListener('drop', (event) => {
      if (!state.currentJob) importPdfs(event.dataTransfer.files);
    });
  }

  function bindAppShell() {
    $$('.mode-tab').forEach((button) => button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      $$('.mode-tab').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
      });
      $$('.tool-view').forEach((view) => view.classList.toggle('is-active', view.id === `${mode}-view`));
      if (mode === 'article') requestAnimationFrame(queueVisiblePreviews);
      else if (mode === 'header') {
        scheduleHeaderDraw();
        updateHeaderPreview();
      } else scheduleCoverDraw();
    }));

    $('#export-config-button').addEventListener('click', exportConfig);
    $('#reset-config-button').addEventListener('click', resetConfig);
    $('#import-config-button').addEventListener('click', () => $('#config-input').click());
    $('#config-input').addEventListener('change', (event) => importConfig(event.target.files && event.target.files[0]));
    $('#job-cancel').addEventListener('click', cancelCurrentJob);
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && state.currentJob) {
      event.preventDefault();
      cancelCurrentJob();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const editing = event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if (event.key.toLowerCase() === 'o' && !editing) {
      event.preventDefault();
      if (!state.currentJob) $('#pdf-input').click();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if ($('#article-view').classList.contains('is-active')) copyAllPages();
      else if ($('#header-view').classList.contains('is-active')) downloadPoster('header');
      else downloadPoster('cover');
    }
  }

  function cleanup() {
    state.pages.forEach(releasePreview);
    state.docs.forEach((record) => {
      try { record.pdf.destroy(); } catch (_) { /* 可能已被销毁 */ }
    });
    Object.values(state.posterImageUrls).forEach((url) => URL.revokeObjectURL(url));
  }

  function boot() {
    configurePdfJs();
    hydrateAll();
    ensurePreviewObserver();
    renderHeaderPalettes();
    bindArticleControls();
    bindHeaderCopyControls();
    bindPosterPanel('header');
    bindCoverControls();
    bindAppShell();
    rebuildPageList();
    rebuildArticlePreview();
    updateArticleSummary();
    drawHeader();
    drawCover();
    updateHeaderPreview();
    window.addEventListener('beforeunload', cleanup);

    if (location.protocol === 'file:') {
      toast('建议通过 localhost 打开，以启用 PDF Worker 与完整复制功能');
    }
  }

  boot();
})();
