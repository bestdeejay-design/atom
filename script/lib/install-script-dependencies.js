'use strict';

const childProcess = require('child_process');
// Только core-модули: этот файл загружается до того, как установятся
// собственные зависимости script/ (npm ci выполняется ниже).
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');

// Recognised by '@electron/get', used by the 'electron-mksnapshot' and 'electron-chromedriver' dependencies
process.env.ELECTRON_CUSTOM_VERSION = CONFIG.appMetadata.electronVersion;

// ATOM LITE: mksnapshot пишет вспомогательный файл по пути gen/v8/embedded.S
// относительно своего рабочего каталога. Обёртка electron-mksnapshot копирует
// contents своего bin/ во временный каталог и запускает бинарник оттуда — если
// каталога gen/v8 рядом нет, mksnapshot падает с «Unable to open file
// "gen/v8/embedded.S"» и снапшот не создаётся вообще.
//
// Поэтому заранее кладём пустой каталог gen/v8 в bin/ пакета: обёртка скопирует
// его вместе с остальными файлами, и mksnapshot напишет свой вспомогательный
// файл во временном каталоге (а не в репозитории).
function prepareMksnapshotWorkDir() {
  const binDirPath = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    'electron-mksnapshot',
    'bin'
  );
  if (!fs.existsSync(binDirPath)) return;
  fs.mkdirSync(path.join(binDirPath, 'gen', 'v8'), { recursive: true });
}

module.exports = function(ci) {
  console.log('Installing script dependencies');
  childProcess.execFileSync(
    CONFIG.getNpmBinPath(ci),
    ['--loglevel=error', ci ? 'ci' : 'install'],
    { env: process.env, cwd: CONFIG.scriptRootPath }
  );
  prepareMksnapshotWorkDir();
};
