import { search } from './search.js';
import cssText from './style.css';

// 定义无数据时的文本
let NO_DATA_TEXT = '';

// 渲染模板
function tpl(vm, defaultValue = '') {
  const { insertAfter, insertBefore } = vm.config?.search || {};
  const html = /* html */ `
    <div class="input-wrap">
      <input type="search" value="${defaultValue}" required aria-keyshortcuts="/ control+k meta+k" />
      <button class="clear-button" title="Clear search">
        <span class="visually-hidden">Clear search</span>
      </button>
      <div class="kbd-group">
        <kbd title="Press / to search">/</kbd>
        <kbd title="Press Control+K to search">⌃K</kbd>
      </div>
    </div>
    <p class="results-status" aria-live="polite"></p>
    <div class="results-panel"></div>
  `;
  const sidebarElm = Docsify.dom.find('.sidebar');
  const searchElm = Docsify.dom.create('section', html);
  const insertElm = sidebarElm.querySelector(
    `:scope ${insertAfter || insertBefore || '> :first-child'}`,
  );

  // 添加类名和属性
  searchElm.classList.add('search');
  searchElm.setAttribute('role', 'search');
  // 插入搜索元素到侧边栏
  sidebarElm.insertBefore(
    searchElm,
    insertAfter ? insertElm.nextSibling : insertElm,
  );
}

// 执行搜索
function doSearch(value) {
  const $search = Docsify.dom.find('.search');
  const $panel = Docsify.dom.find($search, '.results-panel');
  const $status = Docsify.dom.find('.search .results-status');

  if (!value) {
    // 清空搜索结果和状态信息
    $panel.innerHTML = '';
    $status.textContent = '';

    return;
  }

  // 获取搜索结果
  const matches = search(value);

  let html = '';
  matches.forEach((post, i) => {
    const content = post.content ? `...${post.content}...` : '';
    const title = (post.title || '').replace(/<[^>]+>/g, '');
    html += /* html */ `
      <div class="matching-post" aria-label="search result ${i + 1}">
        <a href="${post.url}" title="${title}">
          <p class="title clamp-1">${post.title}</p>
          <p class="content clamp-2">${content}</p>
        </a>
      </div>
    `;
  });

  // 更新搜索结果面板和状态信息
  $panel.innerHTML = html || '';
  $status.textContent = matches.length
    ? `Found ${matches.length} results`
    : NO_DATA_TEXT;
}

// 绑定事件
function bindEvents() {
  const $search = Docsify.dom.find('.search');
  const $input = Docsify.dom.find($search, 'input');
  const $clear = Docsify.dom.find($search, '.clear-button');

  let timeId;

  /**
    防止折叠侧边栏。

    当在移动设备上搜索时，
    点击输入框会导致侧边栏折叠，
    使得无法继续搜索。
   */
  Docsify.dom.on(
    $search,
    'click',
    e =>
      ['A', 'H2', 'P', 'EM'].indexOf(e.target.tagName) === -1 &&
      e.stopPropagation(),
  );
  Docsify.dom.on($input, 'input', e => {
    // 延迟执行搜索操作以提高性能
    clearTimeout(timeId);
    timeId = setTimeout(_ => doSearch(e.target.value.trim()), 100);
  });
  Docsify.dom.on($clear, 'click', e => {
    // 清空输入框并执行搜索
    $input.value = '';
    doSearch();
  });
}

// 更新占位符文本
function updatePlaceholder(text, path) {
  const $input = Docsify.dom.getNode('.search input[type="search"]');

  if (!$input) {
    return;
  }

  if (typeof text === 'string') {
    // 直接设置占位符文本
    $input.placeholder = text;
  } else {
    // 根据路径选择合适的占位符文本
    const match = Object.keys(text).filter(key => path.indexOf(key) > -1)[0];
    $input.placeholder = text[match];
  }
}

// 更新无数据时的文本
function updateNoData(text, path) {
  if (typeof text === 'string') {
    // 直接设置无数据文本
    NO_DATA_TEXT = text;
  } else {
    // 根据路径选择合适的无数据文本
    const match = Object.keys(text).filter(key => path.indexOf(key) > -1)[0];
    NO_DATA_TEXT = text[match];
  }
}

// 初始化搜索组件
export function init(opts, vm) {
  const sidebarElm = Docsify.dom.find('.sidebar');

  if (!sidebarElm) {
    return;
  }

  // 获取 URL 查询参数中的关键字
  const keywords = vm.router.parse().query.s;

  // 应用样式
  Docsify.dom.style(cssText);
  // 渲染模板
  tpl(vm, keywords);
  // 绑定事件
  bindEvents();
  // 如果存在关键字，则延迟执行搜索
  keywords && setTimeout(_ => doSearch(keywords), 500);
}

// 更新搜索组件
export function update(opts, vm) {
  // 更新占位符文本
  updatePlaceholder(opts.placeholder, vm.route.path);
  // 更新无数据文本
  updateNoData(opts.noData, vm.route.path);
}
