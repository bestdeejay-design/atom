#!/usr/bin/env node
'use strict';

// Проверка двух тем форка — «dajet» и «joer».
//
// Зачем отдельный инструмент. Стили тем — это LESS, который компилирует сам
// редактор: Atom несёт LESS 2.7.x (через less-cache@1.1.0), а он заметно
// строже привычного. Ошибки уровня «миксин со списком свойств» или
// «обращение к переменной, которой никто не объявил» не видны в редакторе
// до запуска и ломают окно целиком. Здесь то же самое считается заранее.
//
// Что проверяется:
//   1. каждая тема компилируется теми же путями импорта, что и в Atom;
//   2. чужие пакеты компилируются вместе с темой — тот самый договор
//      ui-variables / syntax-variables, из которого 184 места считают
//      оттенки (lighten/darken/fade);
//   3. тема объявляет все переменные, что объявляет базовый набор Atom;
//   4. в собранном CSS не остаётся обращений к переменным CSS, которых
//      никто не объявил.
//
// Запуск: node script/check-themes.js   (нужен `script/bootstrap`)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEMES = ['dajet-ui', 'dajet-syntax', 'joer-ui', 'joer-syntax'];
const PAIRS = [
  ['dajet-ui', 'dajet-syntax'],
  ['joer-ui', 'joer-syntax']
];

// Пути импорта — ровно те, что отдаёт ThemeManager.getImportPaths() плюс
// статические переменные Atom (static/variables).
const STATIC_PATHS = [
  path.join(ROOT, 'static', 'variables'),
  path.join(ROOT, 'static')
];

let less;
try {
  // обычно зависимости уже подняты (script/bootstrap)
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

const failures = [];
const notes = [];

function themePath(theme, ...rest) {
  return path.join(ROOT, 'packages', theme, ...rest);
}

function importPaths(themes) {
  return themes.map(theme => themePath(theme, 'styles')).concat(STATIC_PATHS);
}

function render(source, filename, paths) {
  return new Promise((resolve, reject) => {
    less.render(source, { filename, paths }, (error, output) => {
      if (error) {
        error.message = `${path.relative(ROOT, filename)}: ${error.message}`;
        reject(error);
      } else {
        resolve(output.css);
      }
    });
  });
}

function renderFile(file, paths) {
  return render(fs.readFileSync(file, 'utf8'), file, paths);
}

// Имена, объявленные как переменные LESS (@имя: значение).
function lessVariables(source) {
  const names = new Set();
  const pattern = /^\s*@([a-z0-9-]+)\s*:/gm;
  let match;
  while ((match = pattern.exec(source))) names.add(match[1]);
  return names;
}

// Имена, объявленные в собранном CSS как переменные CSS (--имя: значение).
function cssVariables(css) {
  return new Set(
    [...css.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map(match => match[0])
  );
}

// Имена, которые CSS читает: var(--имя[, ...]).
function cssVariablesUsed(css) {
  return new Set(
    [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(match => match[1])
  );
}

function readLessFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...readLessFiles(entryPath));
    else if (entryPath.endsWith('.less')) out.push(entryPath);
  }
  return out;
}

// 1. Темы компилируются ------------------------------------------------------

async function checkThemesCompile() {
  const compiled = {};
  for (const theme of THEMES) {
    const entry = themePath(theme, 'index.less');
    const paths = importPaths(THEMES);
    try {
      const css = await renderFile(entry, paths);
      compiled[theme] = css;
      const size = (Buffer.byteLength(css) / 1024).toFixed(1);
      const lines = css.split('\n').length;
      console.log(`  ${theme.padEnd(13)} → собрано ${size} КБ, ${lines} строк`);
    } catch (error) {
      failures.push(`тема ${theme} не компилируется: ${error.message}`);
    }
  }
  return compiled;
}

// 2. Договор с чужими пакетами ----------------------------------------------

// Так выглядит обычный пакет Atom: он берёт переменные темы и считает из них
// оттенки. Если тема чего-то не объявила — здесь будет ошибка компиляции.
const PROBE_SOURCE = `@import "ui-variables";
@import "syntax-variables";
.fork-probe {
  color: @text-color;
  background-color: lighten(@background-color-selected, 5%);
  border-color: darken(@base-border-color, 10%);
  outline-color: fade(@syntax-color-added, 30%);
  font-family: @font-family;
  line-height: @component-line-height;
  border-radius: @component-border-radius;
  padding: @component-padding;
  box-shadow: 0 0 0 1px darken(@button-background-color, 5%);
}`;

async function checkForeignPackageContract() {
  for (const pair of PAIRS) {
    const probe = path.join(ROOT, 'CHECK-PROBE.less');
    try {
      await render(PROBE_SOURCE, probe, importPaths(pair));
      console.log(`  чужой пакет с темой ${pair.join(' + ')} → компилируется`);
    } catch (error) {
      failures.push(
        `чужой пакет не собирается с ${pair.join(' + ')}: ${error.message}`
      );
    }
  }
}

// 3. Базовый набор переменных ------------------------------------------------

function checkBaseVariables(compiled) {
  const base = {
    'dajet-ui': ['static/variables/ui-variables.less', 'dajet-ui'],
    'joer-ui': ['static/variables/ui-variables.less', 'joer-ui'],
    'dajet-syntax': ['static/variables/syntax-variables.less', 'dajet-syntax'],
    'joer-syntax': ['static/variables/syntax-variables.less', 'joer-syntax']
  };

  const reported = {};
  for (const [theme, [baseFile, themeName]] of Object.entries(base)) {
    const baseNames = new Set();
    for (const name of lessVariables(
      fs.readFileSync(path.join(ROOT, baseFile), 'utf8')
    )) {
      baseNames.add(name);
    }
    const own = new Set();
    for (const file of readLessFiles(themePath(themeName, 'styles'))) {
      for (const name of lessVariables(fs.readFileSync(file, 'utf8'))) {
        own.add(name);
      }
    }
    const missing = [...baseNames].filter(name => !own.has(name)).sort();
    reported[themeName] = missing;
    if (missing.length > 0) {
      const list = missing.join(', ');
      failures.push(`тема ${themeName}: нет базовых переменных — ${list}`);
    } else {
      const count = baseNames.size;
      console.log(
        `  ${themeName.padEnd(13)} → базовый набор: ${count} имён, все на месте`
      );
    }
  }
  return reported;
}

// 4. Переменные CSS: каждое обращение должно быть объявлено ------------------

function checkCssVariables(compiled) {
  const uiOf = { 'dajet-syntax': 'dajet-ui', 'joer-syntax': 'joer-ui' };

  for (const theme of THEMES) {
    const css = compiled[theme];
    if (!css) continue;

    // Что объявляет сама тема и (для подсветки) её пара интерфейса: цвета
    // подсветки берутся у темы интерфейса, это и есть устройство пары.
    const own = cssVariables(css);
    const declared = new Set(own);
    const pair = uiOf[theme];
    if (pair && compiled[pair]) {
      for (const name of cssVariables(compiled[pair])) declared.add(name);
    }

    const used = cssVariablesUsed(css);
    const dangling = [...used].filter(name => !declared.has(name)).sort();
    if (dangling.length > 0) {
      const list = dangling.join(', ');
      failures.push(`тема ${theme}: необъявленные переменные CSS — ${list}`);
    } else {
      const count = used.size;
      console.log(
        `  ${theme.padEnd(13)} → переменные CSS: ${count} чтений, все есть`
      );
    }

    // Объявлено и не прочитано: не ошибка (палитра шире сегодняшних правил),
    // но повод посмотреть, не осталось ли мёртвого.
    const unused = [...own].filter(name => !used.has(name));
    if (unused.length > 0) {
      const list = unused.sort().join(', ');
      notes.push(`тема ${theme}: объявлено и не читается — ${list}`);
    }
  }
}

// Запуск ---------------------------------------------------------------------

(async () => {
  console.log('Проверка тем: компиляция LESS');
  const compiled = await checkThemesCompile();

  console.log('\nПроверка тем: договор с чужими пакетами');
  await checkForeignPackageContract();

  console.log('\nПроверка тем: базовый набор переменных');
  checkBaseVariables(compiled);

  console.log('\nПроверка тем: переменные CSS');
  checkCssVariables(compiled);

  if (notes.length > 0) {
    console.log('\nЗаметки (не ошибки):');
    for (const note of notes) console.log(`  · ${note}`);
  }

  if (failures.length > 0) {
    console.log('\nОШИБКИ:');
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exit(1);
  }

  console.log('\nВсё чисто.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
