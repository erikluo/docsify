import {
  init as initComponent,
  update as updateComponent,
} from './component.js';
import { init as initSearch } from './search.js';

// 默认配置选项
const CONFIG = {
  placeholder: 'Type to search', // 搜索框占位符文本
  noData: 'No Results!', // 无搜索结果时的提示文本
  paths: 'auto', // 要索引的路径，默认为自动模式
  depth: 2, // 标题的最大深度
  maxAge: 86400000, // 索引缓存的最大有效期（1天）
  namespace: undefined, // 命名空间
  pathNamespaces: undefined, // 路径命名空间
  keyBindings: ['/', 'meta+k', 'ctrl+k'], // 快捷键绑定
  insertAfter: undefined, // 搜索组件插入位置的选择器（在指定元素之后）
  insertBefore: undefined, // 搜索组件插入位置的选择器（在指定元素之前）
};

// 安装插件
const install = function (hook, vm) {
  const { util } = Docsify;
  const opts = vm.config.search || CONFIG;

  if (Array.isArray(opts)) {
    CONFIG.paths = opts;
  } else if (typeof opts === 'object') {
    CONFIG.paths = Array.isArray(opts.paths) ? opts.paths : 'auto';
    CONFIG.maxAge = util.isPrimitive(opts.maxAge) ? opts.maxAge : CONFIG.maxAge;
    CONFIG.placeholder = opts.placeholder || CONFIG.placeholder;
    CONFIG.noData = opts.noData || CONFIG.noData;
    CONFIG.depth = opts.depth || CONFIG.depth;
    CONFIG.namespace = opts.namespace || CONFIG.namespace;
    CONFIG.pathNamespaces = opts.pathNamespaces || CONFIG.pathNamespaces;
    CONFIG.keyBindings = opts.keyBindings || CONFIG.keyBindings;
  }

  const isAuto = CONFIG.paths === 'auto';

  // 初始化钩子
  hook.init(() => {
    const { keyBindings } = vm.config;

    // 添加快捷键绑定
    if (keyBindings.constructor === Object) {
      keyBindings.focusSearch = {
        bindings: CONFIG.keyBindings,
        callback(e) {
          const sidebarElm = document.querySelector('.sidebar');
          const sidebarToggleElm = document.querySelector('.sidebar-toggle');
          const searchElm = sidebarElm?.querySelector('input[type="search"]');
          const isSidebarHidden = sidebarElm?.getBoundingClientRect().x < 0;

          // 如果侧边栏隐藏，则点击侧边栏切换按钮展开侧边栏
          isSidebarHidden && sidebarToggleElm?.click();

          // 延迟聚焦搜索输入框
          setTimeout(() => searchElm?.focus(), isSidebarHidden ? 250 : 0);
        },
      };
    }
  });

  // 挂载钩子
  hook.mounted(_ => {
    initComponent(CONFIG, vm);
    !isAuto && initSearch(CONFIG, vm);
  });

  // 每次页面加载完成后执行的钩子
  hook.doneEach(_ => {
    updateComponent(CONFIG, vm);
    isAuto && initSearch(CONFIG, vm);
  });
};

// 注册插件
window.$docsify = window.$docsify || {};
$docsify.plugins = [install, ...($docsify.plugins || [])];
