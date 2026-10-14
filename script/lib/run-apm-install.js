'use strict';

const childProcess = require('child_process');

const CONFIG = require('../config');

// ─────────────────────────────────────────────────────────────────────────────
// ATOM LITE: почему для нативных модулей приложения мало ATOM_ARCH
//
// Целевую архитектуру apm уже знает — после правки в install-apm.js он передаёт
// node-gyp `--arch=arm64` и npm_config_arch. Этого достаточно для Windows и
// Linux, но НЕ для macOS.
//
// На macOS node-gyp собирает через gyp-генератор `make`, а тот архитектуру в
// компилятор не передаёт вообще: в его шаблоне Makefile есть только
//
//     CFLAGS.target ?= $(CPPFLAGS) $(CFLAGS)
//     LDFLAGS.target ?= $(LDFLAGS)
//
// Переменная target_arch до clang не доходит. Кому её передавать, решает сам
// clang — а по умолчанию он целится в архитектуру вызвавшего процесса. Наш
// сборочный Node 12 (x64) работает под Rosetta, поэтому clang собирает x86_64,
// даже когда apm просит arm64: на Apple Silicon получалось приложение с
// интеловскими модулями внутри.
//
// Лечится явным флагом -arch, адресованным компилятору и линковщику. Ставим
// его только при кросс-сборке (цель ≠ архитектура машины сборки) и только для
// зависимостей приложения: собственные модули apm и зависимости script/ должны
// остаться под архитектуру сборочного Node, иначе перестанут запускаться.
// ─────────────────────────────────────────────────────────────────────────────

function addTargetArchFlags(env) {
  const targetArch = CONFIG.targetArch;
  if (!targetArch || targetArch === process.arch) return;

  const archFlag = ` -arch ${targetArch}`;
  ['CFLAGS', 'CXXFLAGS', 'CPPFLAGS', 'LDFLAGS'].forEach(key => {
    env[key] = (env[key] || '') + archFlag;
  });
}

module.exports = function(packagePath, ci, stdioOptions) {
  const installEnv = Object.assign({}, process.env);
  // Set resource path so that apm can load metadata related to Atom.
  installEnv.ATOM_RESOURCE_PATH = CONFIG.repositoryRootPath;
  addTargetArchFlags(installEnv);

  childProcess.execFileSync(CONFIG.getApmBinPath(), [ci ? 'ci' : 'install'], {
    env: installEnv,
    cwd: packagePath,
    stdio: stdioOptions || 'inherit'
  });
};
