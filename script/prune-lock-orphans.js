#!/usr/bin/env node

'use strict';

// Уборка осиротевших записей в package-lock.json.
//
// Зачем. Замок версии 1 плоский: в нём лежат не только объявленные
// зависимости, но и всё, что они когда-то тянули. Когда пакет убирают из
// package.json, `npm ci` его больше не поставит — но запись и её хвосты
// остаются.
//
// Как это делается. Замок — это дерево: записи верхнего уровня
// (`dependencies`) и вложенные (`dependencies` внутри записи). Node ищет
// модуль так: сначала `node_modules` самой записи, потом — вверх по дереву,
// затем — верхний уровень. Инструмент обходит замок от объявленных
// зависимостей ровно по этим правилам и оставляет достижимое.
//
// Запуск:
//   node script/prune-lock-orphans.js           — показать, что уйдёт
//   node script/prune-lock-orphans.js --write   — переписать package-lock.json

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const MANIFEST_PATH = path.join(ROOT, 'package.json');

const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

if (lock.lockfileVersion !== 1) {
  console.error(
    `Инструмент рассчитан на lockfileVersion 1, а здесь ${lock.lockfileVersion}.`
  );
  process.exit(1);
}

const top = lock.dependencies;

// Узел дерева: путь вида ['settings-view'] или ['settings-view','request'].
const pathKey = nodePath => nodePath.join('/');
const nodeInfo = nodePath => {
  let info = top[nodePath[0]];
  for (const step of nodePath.slice(1)) {
    info = info && info.dependencies && info.dependencies[step];
    if (!info) return undefined;
  }
  return info;
};
const requirements = info =>
  new Set([
    ...Object.keys(info.requires || {}),
    ...Object.keys(info.dependencies || {})
  ]);

// Так же, как Node: сначала свои вложенные, потом вложенные родителей
// (от ближнего к дальнему), затем верхний уровень.
function resolve(fromPath, name) {
  const self = nodeInfo([...fromPath, name]);
  if (self) return [...fromPath, name];

  for (let depth = fromPath.length - 1; depth >= 1; depth--) {
    const candidate = [...fromPath.slice(0, depth), name];
    if (nodeInfo(candidate)) return candidate;
  }

  if (top[name]) return [name];
  return undefined;
}

// Требования, у которых записи нет вообще и не было: npm ставит их сам.
const namesAnywhere = new Set(Object.keys(top));
for (const info of Object.values(top)) {
  for (const name of Object.keys(info.dependencies || {})) {
    namesAnywhere.add(name);
  }
}

const roots = [
  ...Object.keys(manifest.dependencies || {}),
  ...Object.keys(manifest.packageDependencies || {}),
  ...Object.keys(manifest.optionalDependencies || {}),
  ...Object.keys(manifest.devDependencies || {})
];

const kept = new Set(); // ключи путей
const queue = roots.filter(name => top[name]).map(name => [name]);
const unresolvedBefore = new Map();

while (queue.length > 0) {
  const nodePath = queue.shift();
  const key = pathKey(nodePath);
  if (kept.has(key)) continue;
  const info = nodeInfo(nodePath);
  if (!info) continue;
  kept.add(key);

  for (const required of requirements(info)) {
    const found = resolve(nodePath, required);
    if (found) queue.push(found);
    else unresolvedBefore.set(required, key);
  }
}

const removedTop = Object.keys(top).filter(name => !kept.has(name));
// имена верхнего уровня: scoped-имена сами содержат «/», поэтому путь
// здесь не признак — считаем по списку записей
const keptTopCount = Object.keys(top).filter(name => kept.has(name)).length;

// Проверка: у каждой оставшейся записи каждое требование должно разрешаться.
// Требования без записи, которых не было и в исходном замке, пропускаем.
const problems = [];
for (const key of kept) {
  const nodePath = key.split('/');
  const info = nodeInfo(nodePath);
  if (!info) continue;
  for (const required of requirements(info)) {
    if (nodeInfo([...nodePath, required])) continue;
    if (namesAnywhere.has(required) && resolve(nodePath, required)) continue;
    if (!namesAnywhere.has(required)) continue;
    problems.push(`${key} требует ${required}, но записи для него не остаётся`);
  }
}

console.log(`Записей в замке: ${Object.keys(top).length}`);
console.log(`Останется записей верхнего уровня: ${keptTopCount}`);
console.log(`Уйдёт: ${removedTop.length}`);
if (removedTop.length > 0) {
  const shown = removedTop.slice(0, 12).join(', ');
  const rest =
    removedTop.length > 12 ? ` … и ещё ${removedTop.length - 12}` : '';
  console.log(`  ${shown}${rest}`);
}
if (problems.length > 0) {
  console.error(`\nПОЛОМКА: ${problems.length} требований без записей:`);
  for (const problem of problems.slice(0, 20)) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log('\nЦелостность: каждое требование оставшихся записей разрешается.');

if (!process.argv.includes('--write')) {
  console.log('Это был примерочный прогон. Записать: --write');
  process.exit(0);
}

const next = {};
for (const name of Object.keys(top)) {
  if (!kept.has(name)) continue;
  const info = top[name];
  if (info.dependencies) {
    const nested = {};
    for (const [nestedName, nestedInfo] of Object.entries(info.dependencies)) {
      if (kept.has(`${name}/${nestedName}`)) nested[nestedName] = nestedInfo;
    }
    if (Object.keys(nested).length > 0) info.dependencies = nested;
    else delete info.dependencies;
  }
  next[name] = info;
}
lock.dependencies = next;
fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
const count = removedTop.length;
console.log(`Записано. Из package-lock.json убрано ${count} записей.`);
