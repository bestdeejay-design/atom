'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ATOM LITE: оставляем в нативных модулях приложения только целевую архитектуру
//
// Сборочный Node 12 выпускался только для x64, поэтому сборка идёт под Rosetta.
// Clang, которому мы передаём -arch arm64 (см. script/lib/run-apm-install.js),
// в итоге делает бинарник с двумя срезами: x86_64 — архитектура процесса-
// родителя, arm64 — запрошенная явно. Такой модуль рабочий, но в приложении
// лежат срезы под чужую машину, а архив растёт.
//
// Поэтому после копирования ассетов проходим по модулям и ужимаем их до целевой
// архитектуры (`lipo -thin`). Файлы, где целевого среза нет, не трогаем: их
// отдельно ловит проверка архитектуры в CI.
// ─────────────────────────────────────────────────────────────────────────────

const childProcess = require('child_process');
const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');

const CONFIG = require('../config');

function archsOf(filePath) {
  const result = childProcess.spawnSync('lipo', ['-archs', filePath], {
    encoding: 'utf8'
  });
  // Не Mach-O (например, утилиты fswin для Windows) — не наш случай.
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function thin(filePath, targetArch) {
  const temporaryPath = `${filePath}.thinning`;
  const result = childProcess.spawnSync(
    'lipo',
    ['-thin', targetArch, filePath, '-output', temporaryPath],
    { encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw new Error(
      `Не удалось ужать ${filePath} до ${targetArch}: ${result.stderr ||
        result.error}`
    );
  }
  fs.renameSync(temporaryPath, filePath);
}

module.exports = function(nodeModulesPath) {
  if (process.platform !== 'darwin') return;

  const targetArch = CONFIG.targetArch;
  const binaryPaths = glob.sync(path.join(nodeModulesPath, '**', '*.node'));
  const thinned = [];
  const foreign = [];

  binaryPaths.forEach(binaryPath => {
    const archs = archsOf(binaryPath);
    if (!archs) return;

    if (!archs.includes(targetArch)) {
      foreign.push(`${binaryPath} → ${archs.join(' ')}`);
      return;
    }
    if (archs.length === 1) return; // уже только целевая архитектура

    thin(binaryPath, targetArch);
    thinned.push(
      `${path.relative(nodeModulesPath, binaryPath)}: ${archs.join('+')} → ${targetArch}`
    );
  });

  console.log(
    `Ужато нативных модулей до ${targetArch}: ${thinned.length} из ${binaryPaths.length}`
  );
  thinned.forEach(line => console.log(`  ${line}`));
  if (foreign.length > 0) {
    console.log(
      `Внимание: ${foreign.length} модулей без среза ${targetArch} (нужны под другую систему?)`
    );
    foreign.forEach(line => console.log(`  ${line}`));
  }
};
