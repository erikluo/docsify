/**
 * 这是一个基于 markedjs v13+ 的函数，用于将 Markdown 内容转换为纯文本。
 * 从 lodash 复制了 escape/unescape 函数以减少包大小，而不是直接导入。
 */
import { marked } from 'marked';

// 正则表达式用于匹配转义的 HTML 实体
const reEscapedHtml = /&(?:amp|lt|gt|quot|#(0+)?39);/g;
const reHasEscapedHtml = RegExp(reEscapedHtml.source);
const htmlUnescapes = {
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"',
  '&#39;': "'",
};

// 取消转义 HTML 实体
function unescape(string) {
  return string && reHasEscapedHtml.test(string)
    ? string.replace(reEscapedHtml, entity => htmlUnescapes[entity] || "'")
    : string || '';
}

// 正则表达式用于匹配未转义的 HTML 字符
const reUnescapedHtml = /[&<>"']/g;
const reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
const htmlEscapes = {
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"',
  "'": '&#39;',
};

// 转义 HTML 字符
function escape(string) {
  return string && reHasUnescapedHtml.test(string)
    ? string.replace(reUnescapedHtml, chr => htmlEscapes[chr])
    : string || '';
}

// 清理辅助字符串
function helpersCleanup(string) {
  return string && string.replace('!>', '').replace('?>', '');
}

// 自定义 Markdown 渲染器
const markdownToTxtRenderer = {
  space() {
    return '';
  },

  // 处理代码块
  code({ text }) {
    const code = text.replace(/\n$/, '');
    return escape(code);
  },

  // 处理引用块
  blockquote({ tokens }) {
    return this.parser?.parse(tokens) || '';
  },

  // 忽略 HTML 标签
  html() {
    return '';
  },

  // 处理标题
  heading({ tokens }) {
    return this.parser?.parseInline(tokens) || '';
  },

  // 忽略水平线
  hr() {
    return '';
  },

  // 处理列表
  list(token) {
    let body = '';
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem?.(item);
    }

    return body;
  },

  // 处理列表项
  listitem(item) {
    let itemBody = '';
    if (item.task) {
      const checkbox = this.checkbox?.({ checked: !!item.checked });
      if (item.loose) {
        if (item.tokens.length > 0 && item.tokens[0].type === 'paragraph') {
          item.tokens[0].text = checkbox + ' ' + item.tokens[0].text;
          if (
            item.tokens[0].tokens &&
            item.tokens[0].tokens.length > 0 &&
            item.tokens[0].tokens[0].type === 'text'
          ) {
            item.tokens[0].tokens[0].text =
              checkbox + ' ' + item.tokens[0].tokens[0].text;
          }
        } else {
          item.tokens.unshift({
            type: 'text',
            raw: checkbox + ' ',
            text: checkbox + ' ',
          });
        }
      } else {
        itemBody += checkbox + ' ';
      }
    }

    itemBody += this.parser?.parse(item.tokens, !!item.loose);

    return `${itemBody || ''}`;
  },

  // 处理复选框
  checkbox() {
    return '';
  },

  // 处理段落
  paragraph({ tokens }) {
    return this.parser?.parseInline(tokens) || '';
  },

  // 处理表格
  table(token) {
    let header = '';

    let cell = '';
    for (let j = 0; j < token.header.length; j++) {
      cell += this.tablecell?.(token.header[j]);
    }
    header += this.tablerow?.({ text: cell });

    let body = '';
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];

      cell = '';
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell?.(row[k]);
      }

      body += this.tablerow?.({ text: cell });
    }

    return header + ' ' + body;
  },

  // 处理表格行
  tablerow({ text }) {
    return text;
  },

  // 处理表格单元格
  tablecell(token) {
    return this.parser?.parseInline(token.tokens) || '';
  },

  // 处理加粗文本
  strong({ text }) {
    return text;
  },

  // 处理斜体文本
  em({ tokens }) {
    return this.parser?.parseInline(tokens) || '';
  },

  // 处理代码片段
  codespan({ text }) {
    return text;
  },

  // 处理换行符
  br() {
    return ' ';
  },

  // 处理删除线文本
  del({ tokens }) {
    return this.parser?.parseInline(tokens);
  },

  // 处理链接
  link({ tokens, href, title }) {
    // 保留 href 和 title 属性以便搜索，图像也是如此
    // 例如：[filename](_media/example.js ':include :type=code :fragment=demo')
    // 结果：filename _media/example.js :include :type=code :fragment=demo
    return `${this.parser?.parseInline(tokens) || ''} ${href || ''} ${title || ''}`;
  },

  // 处理图像
  image({ title, text, href }) {
    return `${text || ''} ${href || ''} ${title || ''}`;
  },

  // 处理文本
  text(token) {
    return token.tokens
      ? this.parser?.parseInline(token.tokens) || ''
      : token.text || '';
  },
};

// 设置 marked 使用自定义渲染器
const _marked = marked.setOptions({ renderer: markdownToTxtRenderer });

// 将 Markdown 内容转换为纯文本
export function markdownToTxt(markdown) {
  const unmarked = _marked.parse(markdown);
  const unescaped = unescape(unmarked);
  const helpersCleaned = helpersCleanup(unescaped);
  return helpersCleaned.trim();
}

export default markdownToTxt;
