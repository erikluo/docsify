import {
  getAndRemoveConfig,
  getAndRemoveDocsifyIgnoreConfig,
} from '../../core/render/utils.js';
import { markdownToTxt } from './markdown-to-txt.js';
import Dexie from 'dexie';

// 全局索引对象，存储所有文档的索引数据
let INDEXES = {};

// 创建一个名为 'docsify' 的 Dexie 数据库实例，并定义两个表：search 和 expires
const db = new Dexie('docsify');
db.version(1).stores({
  search: 'slug, title, body, path, indexKey', // 存储文档的搜索信息
  expires: 'key, value', // 存储索引的过期时间
});

// 将索引数据保存到数据库中
async function saveData(maxAge, expireKey) {
  // 将 INDEXES 对象中的所有值扁平化为数组
  INDEXES = Object.values(INDEXES).flatMap(innerData =>
    Object.values(innerData),
  );
  // 批量插入或更新 search 表中的数据
  await db.search.bulkPut(INDEXES);
  // 插入或更新 expires 表中的数据，设置过期时间为当前时间加上 maxAge
  await db.expires.put({ key: expireKey, value: Date.now() + maxAge });
}

// 从数据库中获取数据
async function getData(key, isExpireKey = false) {
  if (isExpireKey) {
    // 获取 expires 表中的数据
    const item = await db.expires.get(key);
    return item ? item.value : 0;
  }

  // 获取 search 表中的数据
  const item = await db.search.where({ indexKey: key }).toArray();
  return item ? item : null;
}

// 定义本地存储键名
const LOCAL_STORAGE = {
  EXPIRE_KEY: 'docsify.search.expires',
  INDEX_KEY: 'docsify.search.index',
};

// 解析过期键名
function resolveExpireKey(namespace) {
  return namespace
    ? `${LOCAL_STORAGE.EXPIRE_KEY}/${namespace}`
    : LOCAL_STORAGE.EXPIRE_KEY;
}

// 解析索引键名
function resolveIndexKey(namespace) {
  return namespace
    ? `${LOCAL_STORAGE.INDEX_KEY}/${namespace}`
    : LOCAL_STORAGE.INDEX_KEY;
}

// 转义 HTML 字符
function escapeHtml(string) {
  const entityMap = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '&#39;',
  };

  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

// 获取所有路径
function getAllPaths(router) {
  const paths = [];

  // 遍历侧边栏导航中的链接
  Docsify.dom
    .findAll('.sidebar-nav a:not(.section-link):not([data-nosearch])')
    .forEach(node => {
      const href = node.href;
      const originHref = node.getAttribute('href');
      const path = router.parse(href).path;

      // 如果路径有效且未被添加到 paths 数组中，并且不是绝对路径，则添加到 paths 数组
      if (
        path &&
        paths.indexOf(path) === -1 &&
        !Docsify.util.isAbsolutePath(originHref)
      ) {
        paths.push(path);
      }
    });

  return paths;
}

// 获取表格数据
function getTableData(token) {
  if (!token.text && token.type === 'table') {
    // 将表格头和行合并为一个字符串
    token.rows.unshift(token.header);
    token.text = token.rows
      .map(columns => columns.map(r => r.text).join(' | '))
      .join(' |\n ');
  }
  return token.text;
}

// 获取列表数据
function getListData(token) {
  if (!token.text && token.type === 'list') {
    // 直接使用原始文本
    token.text = token.raw;
  }
  return token.text;
}

// 生成文档索引
export function genIndex(path, content = '', router, depth, indexKey) {
  const tokens = window.marked.lexer(content);
  const slugify = window.Docsify.slugify;
  const index = {};
  let slug;
  let title = '';

  // 遍历标记化的令牌
  tokens.forEach((token, tokenIndex) => {
    if (token.type === 'heading' && token.depth <= depth) {
      const { str, config } = getAndRemoveConfig(token.text);

      const text = getAndRemoveDocsifyIgnoreConfig(token.text).content;

      if (config.id) {
        // 根据配置 ID 生成 slug
        slug = router.toURL(path, { id: slugify(config.id) });
      } else {
        // 根据标题生成 slug
        slug = router.toURL(path, { id: slugify(escapeHtml(text)) });
      }

      if (str) {
        // 更新标题
        title = getAndRemoveDocsifyIgnoreConfig(str).content;
      }

      // 创建索引项
      index[slug] = {
        slug,
        title: title,
        body: '',
        path: path,
        indexKey: indexKey,
      };
    } else {
      if (tokenIndex === 0) {
        // 生成首页索引项
        slug = router.toURL(path);
        index[slug] = {
          slug,
          title: path !== '/' ? path.slice(1) : 'Home Page',
          body: markdownToTxt(token.text || ''),
          path: path,
          indexKey: indexKey,
        };
      }

      if (!slug) {
        return;
      }

      if (!index[slug]) {
        // 初始化索引项
        index[slug] = { slug, title: '', body: '' };
      } else if (index[slug].body) {
        // 处理表格和列表数据
        token.text = getTableData(token);
        token.text = getListData(token);

        index[slug].body += '\n' + markdownToTxt(token.text || '');
      } else {
        // 处理普通文本数据
        token.text = getTableData(token);
        token.text = getListData(token);

        index[slug].body = markdownToTxt(token.text || '');
      }

      // 更新索引项的路径和索引键
      index[slug].path = path;
      index[slug].indexKey = indexKey;
    }
  });
  slugify.clear();
  return index;
}

// 忽略重音符号
export function ignoreDiacriticalMarks(keyword) {
  if (keyword && keyword.normalize) {
    return keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return keyword;
}

/**
 * 执行搜索
 * @param {String} query 搜索查询
 * @returns {Array} 匹配结果数组
 */
export function search(query) {
  const matchingResults = [];

  // 去除查询字符串两端的空白字符
  query = query.trim();
  // 将查询字符串按空格、连字符、逗号、斜杠分割成关键词数组
  let keywords = query.split(/[\s\-，\\/]+/);
  if (keywords.length !== 1) {
    // 如果关键词数组长度大于1，则将原始查询字符串也加入关键词数组
    keywords = [query, ...keywords];
  }

  // 遍历所有索引项
  for (const post of INDEXES) {
    let matchesScore = 0;
    let resultStr = '';
    let handlePostTitle = '';
    let handlePostContent = '';
    const postTitle = post.title && post.title.trim();
    const postContent = post.body && post.body.trim();
    const postUrl = post.slug || '';

    if (postTitle) {
      // 遍历每个关键词
      keywords.forEach(keyword => {
        // 创建正则表达式用于匹配关键词
        const regEx = new RegExp(
          escapeHtml(ignoreDiacriticalMarks(keyword)).replace(
            /[|\\{}()[\]^$+*?.]/g,
            '\\$&',
          ),
          'gi',
        );
        let indexTitle = -1;
        let indexContent = -1;
        handlePostTitle = postTitle
          ? escapeHtml(ignoreDiacriticalMarks(postTitle))
          : postTitle;
        handlePostContent = postContent
          ? escapeHtml(ignoreDiacriticalMarks(postContent))
          : postContent;

        // 查找标题和内容中的关键词位置
        indexTitle = postTitle ? handlePostTitle.search(regEx) : -1;
        indexContent = postContent ? handlePostContent.search(regEx) : -1;

        if (indexTitle >= 0 || indexContent >= 0) {
          // 计算匹配分数
          matchesScore += indexTitle >= 0 ? 3 : indexContent >= 0 ? 2 : 0;
          if (indexContent < 0) {
            indexContent = 0;
          }

          let start = 0;
          let end = 0;

          // 计算匹配内容的起始和结束位置
          start = indexContent < 11 ? 0 : indexContent - 10;
          end = start === 0 ? 100 : indexContent + keyword.length + 90;

          if (handlePostContent && end > handlePostContent.length) {
            end = handlePostContent.length;
          }

          // 提取匹配内容并高亮显示
          const matchContent =
            handlePostContent &&
            handlePostContent
              .substring(start, end)
              .replace(regEx, word => /* html */ `<mark>${word}</mark>`);

          resultStr += matchContent;
        }
      });

      if (matchesScore > 0) {
        // 创建匹配结果对象
        const matchingPost = {
          title: handlePostTitle,
          content: postContent ? resultStr : '',
          url: postUrl,
          score: matchesScore,
        };

        matchingResults.push(matchingPost);
      }
    }
  }

  // 按匹配分数降序排序结果
  return matchingResults.sort((r1, r2) => r2.score - r1.score);
}

// 初始化搜索功能
export async function init(config, vm) {
  const isAuto = config.paths === 'auto';
  const paths = isAuto ? getAllPaths(vm.router) : config.paths;

  let namespaceSuffix = '';

  // 自动模式下处理命名空间后缀
  if (paths.length && isAuto && config.pathNamespaces) {
    const path = paths[0];

    if (Array.isArray(config.pathNamespaces)) {
      namespaceSuffix =
        config.pathNamespaces.filter(
          prefix => path.slice(0, prefix.length) === prefix,
        )[0] || namespaceSuffix;
    } else if (config.pathNamespaces instanceof RegExp) {
      const matches = path.match(config.pathNamespaces);

      if (matches) {
        namespaceSuffix = matches[0];
      }
    }
    const isExistHome = paths.indexOf(namespaceSuffix + '/') === -1;
    const isExistReadme = paths.indexOf(namespaceSuffix + '/README') === -1;
    if (isExistHome && isExistReadme) {
      paths.unshift(namespaceSuffix + '/');
    }
  } else if (paths.indexOf('/') === -1 && paths.indexOf('/README') === -1) {
    paths.unshift('/');
  }

  const expireKey = resolveExpireKey(config.namespace) + namespaceSuffix;
  const indexKey = resolveIndexKey(config.namespace) + namespaceSuffix;

  // 检查索引是否过期
  const isExpired = (await getData(expireKey, true)) < Date.now();

  INDEXES = await getData(indexKey);

  if (isExpired) {
    INDEXES = {};
  } else if (!isAuto) {
    return;
  }

  const len = paths.length;
  let count = 0;

  // 遍历所有路径
  paths.forEach(path => {
    const pathExists = Array.isArray(INDEXES)
      ? INDEXES.some(obj => obj.path === path)
      : false;
    if (pathExists) {
      return count++;
    }

    // 获取文件内容并生成索引
    Docsify.get(vm.router.getFile(path), false, vm.config.requestHeaders).then(
      async result => {
        INDEXES[path] = genIndex(
          path,
          result,
          vm.router,
          config.depth,
          indexKey,
        );
        if (len === ++count) {
          await saveData(config.maxAge, expireKey);
        }
      },
    );
  });
}
