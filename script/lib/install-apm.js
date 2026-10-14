'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');

// ─────────────────────────────────────────────────────────────────────────────
// ATOM LITE: почему apm приходится править
//
// В atom-package-manager (файл lib/apm.js) архитектура сборки нативных модулей
// задана так:
//
//   getElectronArch: function() {
//     switch (process.platform) {
//       case 'darwin':
//         return 'x64';                     // ← всегда x64
//       default:
//         return process.env.ATOM_ARCH != null ? process.env.ATOM_ARCH : process.arch;
//     }
//   }
//
// Для macOS ветка жёсткая: apm передаёт --arch=x64 и npm_config_arch=x64 во все
// установки. Именно поэтому Atom на Apple Silicon всегда собирался интеловским
// и запускался через Rosetta 2 — нативной сборки не существовало в принципе.
//
// Повышение версии не помогает: поведение одинаково во всех выпущенных версиях,
// включая последнюю 2.6.5. Апстрим мёртв вместе с Atom, а живой форк Pulsar
// исправил это ровно так:
//
//   getElectronArch() { return process.env.ATOM_ARCH ?? process.arch; }
//
// Мы делаем то же самое: в ветке darwin начинаем уважать ATOM_ARCH.
// Если ATOM_ARCH не задан, поведение прежнее — x64.
// ─────────────────────────────────────────────────────────────────────────────

const APM_PACKAGE_NAME = 'atom-package-manager';

function patchApmTargetArch() {
  const apmFilePath = path.join(
    CONFIG.apmRootPath,
    'node_modules',
    APM_PACKAGE_NAME,
    'lib',
    'apm.js'
  );

  if (!fs.existsSync(apmFilePath)) {
    throw new Error(
      `Не найден ${apmFilePath} — apm не установился, исправлять нечего.`
    );
  }

  const source = fs.readFileSync(apmFilePath, 'utf8');

  const patchedBranch = "case 'darwin':\n          return (process.env.ATOM_ARCH != null ? process.env.ATOM_ARCH : 'x64');";
  if (source.indexOf(patchedBranch) !== -1) {
    console.log('apm уже умеет ATOM_ARCH — правка архитектуры не требуется');
    return;
  }

  const darwinX64Pattern = /(case 'darwin':\s*\n\s*return )'x64';/;
  if (!darwinX64Pattern.test(source)) {
    throw new Error(
      'Не найдено место в apm, где архитектура для macOS жёстко задана как x64. ' +
        'Похоже, версия atom-package-manager изменилась — нужно посмотреть lib/apm.js.'
    );
  }

  const patchedSource = source.replace(
    darwinX64Pattern,
    "$1(process.env.ATOM_ARCH != null ? process.env.ATOM_ARCH : 'x64');"
  );

  fs.writeFileSync(apmFilePath, patchedSource);
  console.log(
    'apm исправлен: целевая архитектура нативных модулей берётся из ATOM_ARCH'
  );
}

module.exports = function(ci) {
  if (ci) {
    // Tell apm not to dedupe its own dependencies during its
    // postinstall script. (Deduping during `npm ci` runs is broken.)
    process.env.NO_APM_DEDUPE = 'true';
  }

  // ATOM LITE: сам apm — это инструмент, который запускается тем же Node, что
  // его установил (Node 12 x64 через Rosetta). Его собственные нативные модули
  // обязаны совпадать с этим Node, иначе apm просто не запустится.
  //
  // Архитектуру задаём явно, чтобы ATOM_ARCH/npm_config_arch для целевой сборки
  // не протекали сюда. Раньше это и ломало сборку под arm64: интеловский Node
  // начинал пересобирать модули для apm под arm64 и падал.
  const apmInstallEnv = Object.assign({}, process.env, {
    npm_config_arch: process.arch,
    npm_config_target_arch: process.arch
  });

  console.log('Installing apm');
  childProcess.execFileSync(
    CONFIG.getLocalNpmBinPath(),
    ['--global-style', '--loglevel=error', ci ? 'ci' : 'install'],
    { env: apmInstallEnv, cwd: CONFIG.apmRootPath }
  );

  patchApmTargetArch();
};
