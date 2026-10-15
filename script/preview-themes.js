#!/usr/bin/env node

'use strict';

// Просмотр тем «dajet» и «joer» в браузере.
//
// Зачем. Темы — это LESS, который собирает сам редактор, и посмотреть их
// можно только в нём. Этот инструмент собирает те же стили тем же LESS и
// складывает их в одну HTML-страницу с макетом окна Atom: классы разметки —
// настоящие (atom-workspace, .pane-item, .tab-bar, .tree-view, .status-bar),
// а переключатели облика и атмосферы ставят на <html> те же атрибуты, что и
// lib/main.js тем. То есть страница показывает те же правила, что увидит
// редактор, — но это макет, а не снимок редактора: шрифты и мелочи вёрстки
// могут отличаться.
//
// Запуск:
//   node script/preview-themes.js [куда.html]     (по умолчанию theme-preview.html)
//   Открыть получившийся файл в браузере.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEMES = ['dajet-ui', 'dajet-syntax', 'joer-ui', 'joer-syntax'];
const STATIC_PATHS = [
  path.join(ROOT, 'static', 'variables'),
  path.join(ROOT, 'static')
];

let less;
try {
  less = require('less');
} catch (error) {
  try {
    less = require(path.join(ROOT, 'node_modules', 'less'));
  } catch (error2) {
    console.error(
      'Не найден LESS. Сначала `script/bootstrap` — он ставит зависимости приложения.'
    );
    process.exit(2);
  }
}

const importPaths = THEMES.map(theme => path.join(ROOT, 'packages', theme, 'styles')).concat(
  STATIC_PATHS
);

function compile(theme) {
  const entry = path.join(ROOT, 'packages', theme, 'index.less');
  return new Promise((resolve, reject) => {
    less.render(
      fs.readFileSync(entry, 'utf8'),
      { filename: entry, paths: importPaths },
      (error, output) => {
        if (error) reject(new Error(`${theme}: ${error.message}`));
        else resolve(output.css);
      }
    );
  });
}

// Разметка окна: имена классов те же, что у Atom, потому что темы пишут
// правила именно по ним.
const CODE_LINES = [
  [['syntax--comment', '// Подсветка: ключевые слова набраны цветом серии']],
  [
    ['syntax--keyword', 'function'],
    ['', ' '],
    ['syntax--entity syntax--name syntax--function', 'привет'],
    ['syntax--punctuation', '('],
    ['syntax--variable', 'имя'],
    ['syntax--punctuation', ') {']
  ],
  [
    ['', '  '],
    ['syntax--keyword syntax--control', 'const'],
    ['', ' '],
    ['syntax--variable', 'строка'],
    ['syntax--keyword syntax--operator', ' ='],
    ['', ' '],
    ['syntax--string', "'слова'"],
    ['syntax--punctuation', ';']
  ],
  [
    ['', '  '],
    ['syntax--keyword syntax--control', 'return'],
    ['', ' '],
    ['syntax--variable', 'знаков'],
    ['syntax--keyword syntax--operator', ' >='],
    ['', ' '],
    ['syntax--constant syntax--numeric', '26'],
    ['syntax--punctuation', ' ?']
  ],
  [
    ['', '    '],
    ['syntax--string', "'воздух'"],
    ['syntax--punctuation', ' : '],
    ['syntax--string', "'плотно'"],
    ['syntax--punctuation', ';']
  ],
  [['', '}']],
  [['syntax--comment', '// Комментарий — самая тихая ступень темы']],
  [
    ['syntax--keyword syntax--control', 'class'],
    ['', ' '],
    ['syntax--entity syntax--name syntax--class', 'Строка'],
    ['', ' '],
    ['syntax--keyword', 'extends'],
    ['', ' '],
    ['syntax--entity syntax--name syntax--class', 'Текст'],
    ['', ' { }']
  ]
];

// Строка кода: где класс — <span>, где нет — просто текст.
function codeLine(parts) {
  return parts
    .map(([className, text]) =>
      className ? `<span class="${className}">${text}</span>` : text
    )
    .join('');
}

function mockWindow(pair) {
  const themeClass = `theme-${pair}-ui`;
  const tabs = [
    { name: 'нота.md', state: 'active' },
    { name: 'строка.js', state: '', modified: true },
    { name: 'тема.less', state: '' }
  ];
  const tree = [
    { name: 'dajet', kind: 'project-root', children: [
      { name: 'packages', kind: 'directory', open: true, children: [
        { name: 'dajet-ui', kind: 'directory', selected: true },
        { name: 'dajet-syntax', kind: 'directory' },
        { name: 'joer-ui', kind: 'directory' },
        { name: 'joer-syntax', kind: 'directory status-modified' }
      ] },
      { name: 'README.md', kind: 'file' },
      { name: 'сборка.log', kind: 'file status-ignored' }
    ] }
  ];

  const list = (items, level) =>
    items
      .map(item => {
        const classes = ['entry', item.kind];
        if (item.selected) classes.push('selected');
        if (item.kind.includes('status-')) classes.push(item.kind.split(' ')[1]);
        const name = `<span class="name">${item.name}</span>`;
        if (item.children) {
          const isRoot = item.kind === 'project-root';
          const header = `<div class="header list-item"><span class="name">${item.name}</span></div>`;
          return `<li class="list-nested-item${isRoot ? ' project-root' : ''}">${header}<ul>${list(
            item.children,
            level + 1
          )}</ul></li>`;
        }
        return `<li class="${classes.join(' ')} list-item">${name}</li>`;
      })
      .join('');

  return `
    <section class="mock">
      <h2>${pair} ${pair.startsWith('dajet') ? '— тёплое стекло и матовая темнота' : '— пять атмосфер'}</h2>
      <div class="${themeClass}">
        <atom-workspace class="${themeClass}">
          <atom-workspace-axis class="vertical">
            <atom-workspace-axis class="horizontal">
              <atom-panel-container class="left">
                <div class="tool-panel tree-view">
                  <ul class="tree-view-root">${list(tree, 0)}</ul>
                </div>
              </atom-panel-container>
              <div class="pane">
                <div class="item-views">
                  <div class="pane-item">
                    <ul class="tab-bar">
                      ${tabs
                        .map(
                          tab =>
                            `<li class="tab ${tab.state}${tab.modified ? ' modified' : ''}"><span class="title">${tab.name}</span><span class="close-icon"></span></li>`
                        )
                        .join('')}
                    </ul>
                    <atom-text-editor>
                      <div class="gutter">
                        ${CODE_LINES.map((_, i) => `<div class="line-number">${i + 1}</div>`).join('')}
                      </div>
                      <div class="lines">
                        ${CODE_LINES.map(
                          (line, i) =>
                            `<div class="line${i === 3 ? ' cursor-line' : ''}">${codeLine(line)}</div>`
                        ).join('')}
                      </div>
                    </atom-text-editor>
                  </div>
                </div>
              </div>
            </atom-workspace-axis>
            <div class="status-bar">
              <span class="status-bar-item">строка 4, столбец 14</span>
              <span class="status-bar-item">UTF-8</span>
              <span class="status-bar-item">JavaScript</span>
              <span class="status-bar-item">пробелы: 2</span>
            </div>
          </atom-workspace-axis>
        </atom-workspace>
      </div>

      <div class="panels">
        <atom-panel class="bottom">
          <div class="panel-heading">Настройки темы</div>
          <div class="panel-body">
            <div class="list-group">
              <li class="selected">Облик</li>
              <li>Размер шрифта</li>
              <li>Атмосферная подсветка</li>
            </div>
            <div class="row">
              <input type="text" value="13" />
              <button class="btn">Отмена</button>
              <button class="btn btn-primary">Применить</button>
            </div>
          </div>
        </atom-panel>
      </div>
    </section>`;
}

async function main() {
  const css = {};
  for (const theme of THEMES) {
    css[theme] = await compile(theme);
  }
  const outPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(ROOT, 'theme-preview.html');

  const html = `<!doctype html>
<html lang="ru" data-dajet-look="dark" data-joer-atmosphere="lounge" data-joer-ambient="on">
<head>
<meta charset="utf-8" />
<title>Темы dajet и joer — просмотр</title>
<style>
  /* Управление страницей: вне макета, чтобы не путать с темой */
  body.preview-ui {
    margin: 0;
    padding: 24px;
    background: #23252b;
    color: #e6e6e6;
    font: 14px/1.5 system-ui, -apple-system, "SF Pro Text", sans-serif;
  }
  body.preview-ui h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  body.preview-ui .note { color: #9aa0aa; margin: 0 0 20px; max-width: 900px; }
  body.preview-ui .controls { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 24px; }
  body.preview-ui .group { display: flex; align-items: center; gap: 8px; }
  body.preview-ui .group > span { color: #9aa0aa; }
  body.preview-ui button.choice {
    background: #2f323a; color: #e6e6e6; border: 1px solid #3d414b;
    border-radius: 6px; padding: 5px 10px; cursor: pointer; font: inherit;
  }
  body.preview-ui button.choice[aria-pressed="true"] { background: #4b5566; border-color: #6b7688; }
  body.preview-ui .mock { margin-bottom: 40px; }
  body.preview-ui .mock h2 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
  body.preview-ui .mock .theme-dajet-ui,
  body.preview-ui .mock .theme-joer-ui { border-radius: 12px; overflow: hidden; }
  body.preview-ui atom-workspace { display: block; }
  body.preview-ui atom-workspace-axis.vertical { display: flex; flex-direction: column; }
  body.preview-ui atom-workspace-axis.horizontal { display: flex; flex-direction: row; min-height: 420px; }
  body.preview-ui .pane, body.preview-ui .item-views, body.preview-ui .pane-item { flex: 1; display: flex; flex-direction: column; }
  body.preview-ui .tab-bar { display: flex; list-style: none; margin: 0; padding: 0; }
  body.preview-ui .tab-bar .tab { padding: 6px 12px; cursor: pointer; }
  body.preview-ui .tab-bar .tab .close-icon { display: inline-block; width: 10px; margin-left: 8px; }
  body.preview-ui .tree-view { width: 232px; padding: 6px 0; }
  body.preview-ui .tree-view ul { list-style: none; margin: 0; padding: 0; }
  body.preview-ui .tree-view .entry, body.preview-ui .tree-view .header { padding: 2px 12px; }
  body.preview-ui .tree-view ul ul { padding-left: 12px; }
  body.preview-ui atom-text-editor { display: flex; flex: 1; padding: 10px 0; }
  body.preview-ui atom-text-editor .gutter { padding: 0 8px 0 10px; text-align: right; }
  body.preview-ui atom-text-editor .gutter .line-number { line-height: 26px; }
  body.preview-ui atom-text-editor .lines { padding-left: 6px; }
  body.preview-ui atom-text-editor .line { line-height: 26px; white-space: pre; }
  body.preview-ui .status-bar { display: flex; gap: 16px; padding: 0 12px; }
  body.preview-ui .status-bar .status-bar-item { line-height: 26px; }
  body.preview-ui .panels { margin-top: 12px; }
  body.preview-ui atom-panel.bottom { border-radius: 12px; overflow: hidden; }
  body.preview-ui .panel-heading { padding: 8px 12px; }
  body.preview-ui .panel-body { padding: 12px; display: flex; gap: 24px; align-items: flex-start; }
  body.preview-ui .list-group { list-style: none; margin: 0; padding: 0; width: 260px; }
  body.preview-ui .list-group li { padding: 6px 10px; }
  body.preview-ui .row { display: flex; gap: 10px; align-items: center; }
  body.preview-ui input[type="text"] { width: 70px; padding: 5px 8px; }
  body.preview-ui button.btn { padding: 6px 14px; cursor: pointer; }
</style>
<style media="all" id="ui-dajet">
${css['dajet-ui']}
</style>
<!-- Подсветка: включённой остаётся только одна тема, иначе правила
     .syntax--* перекрывали бы друг друга (в редакторе активна одна) -->
<style media="all" id="syntax-dajet">
${css['dajet-syntax']}
</style>
<style media="all" id="ui-joer">
${css['joer-ui']}
</style>
<style media="not all" id="syntax-joer">
${css['joer-syntax']}
</style>
</head>
<body class="preview-ui">
  <h1>Темы «dajet» и «joer»</h1>
  <p class="note">
    Это макет окна Atom: классы разметки настоящие, стили — те же собранные
    файлы тем. Переключатели ниже ставят на <code>&lt;html&gt;</code> те же
    атрибуты, что и темы (<code>data-dajet-look</code>,
    <code>data-joer-atmosphere</code>), поэтому видно и работу переключения.
    Шрифты и мелочи вёрстки могут отличаться от редактора.
  </p>

  <div class="controls">
    <div class="group">
      <span>Облик dajet:</span>
      <button class="choice" data-look="system">как в системе</button>
      <button class="choice" data-look="dark" aria-pressed="true">тёмный</button>
      <button class="choice" data-look="light">светлый</button>
    </div>
    <div class="group">
      <span>Атмосфера joer:</span>
      <button class="choice" data-atmosphere="lounge" aria-pressed="true">lounge</button>
      <button class="choice" data-atmosphere="club">club</button>
      <button class="choice" data-atmosphere="romantic">romantic</button>
      <button class="choice" data-atmosphere="space">space</button>
      <button class="choice" data-atmosphere="velvet">velvet</button>
    </div>
    <div class="group">
      <span>Подсветка в примере кода:</span>
      <button class="choice" data-syntax="dajet" aria-pressed="true">dajet</button>
      <button class="choice" data-syntax="joer">joer</button>
    </div>
    <div class="group">
      <span>Подсветка окна joer:</span>
      <button class="choice" data-ambient="on" aria-pressed="true">вкл</button>
      <button class="choice" data-ambient="off">выкл</button>
    </div>
  </div>

  ${mockWindow('dajet')}
  ${mockWindow('joer')}

<script>
  const root = document.documentElement;
  function group(attribute, apply) {
    document.querySelectorAll('[data-' + attribute + ']').forEach(button => {
      button.addEventListener('click', () => {
        document
          .querySelectorAll('[data-' + attribute + ']')
          .forEach(other => other.setAttribute('aria-pressed', 'false'));
        button.setAttribute('aria-pressed', 'true');
        apply(button.getAttribute('data-' + attribute));
      });
    });
  }
  group('look', value => root.setAttribute('data-dajet-look', value));
  group('atmosphere', value => root.setAttribute('data-joer-atmosphere', value));
  group('ambient', value => root.setAttribute('data-joer-ambient', value));
  group('syntax', value => {
    document.getElementById('syntax-dajet').media = value === 'dajet' ? 'all' : 'not all';
    document.getElementById('syntax-joer').media = value === 'joer' ? 'all' : 'not all';
  });
</script>
</body>
</html>
`;

  fs.writeFileSync(outPath, html);
  const size = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`Готово: ${path.relative(ROOT, outPath)} (${size} КБ)`);
  console.log('Открыть в браузере — или отдать любым статическим сервером.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
