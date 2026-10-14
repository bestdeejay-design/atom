'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ATOM LITE: ripgrep под целевую архитектуру
//
// Пакет vscode-ripgrep 1.9.0 (поиск по проекту) устроен так:
//
//   · адрес сборки для macOS задан жёстко — 'x86_64-apple-darwin',
//     архитектура сборки не учитывается вообще;
//   · сборка запрашивается через GitHub API, который без токена отдаёт
//     403 «превышен лимит запросов» — на общей машине раннера это лотерея;
//   · в релизе ripgrep-prebuilt v12.1.1 сборки под Apple Silicon нет,
//     она появилась только в v12.1.1-4.
//
// Итог: нативная сборка под arm64 получить ripgrep не может, а сборка под
// x64 зависит от лимитов GitHub API.
//
// Решение: положить нужный архив в кэш пакета заранее. Пакет сначала смотрит
// в кэш и, если файл там уже есть, в сеть не идёт совсем:
//
//   const assetDownloadPath = path.join(tmpDir, assetName);
//   if (!opts.force && await fsExists(assetDownloadPath)) {
//       console.log('Using cached download: ' + assetDownloadPath);
//       return assetDownloadPath;
//   }
//
// Имя файла обязано совпадать с тем, что вычислил бы сам пакет:
//   os.tmpdir()/vscode-ripgrep-cache-1.9.0/ripgrep-v12.1.1-x86_64-apple-darwin.tar.gz
// — включая «x86_64» для arm64: это просто имя, а байты внутри будут нужной
// архитектуры.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const CONFIG = require('../config');

// Значения взяты из самого пакета vscode-ripgrep 1.9.0.
const RG_PACKAGE_VERSION = '1.9.0';
const RG_VERSION_REQUESTED = 'v12.1.1';
const RG_DARWIN_TARGET_IN_PACKAGE = 'x86_64-apple-darwin';

// Релиз, в котором есть сборки и для Intel, и для Apple Silicon.
const RG_RELEASE = 'v12.1.1-4';
const RG_TARGETS = {
  arm64: 'aarch64-apple-darwin',
  x64: 'x86_64-apple-darwin'
};

function cachePaths() {
  const cacheDir = path.join(
    os.tmpdir(),
    `vscode-ripgrep-cache-${RG_PACKAGE_VERSION}`
  );
  // Имя, которое ожидает пакет: версия v12.1.1 и «x86_64» для darwin —
  // независимо от того, какая архитектура внутри архива.
  const cacheFile = path.join(
    cacheDir,
    `ripgrep-${RG_VERSION_REQUESTED}-${RG_DARWIN_TARGET_IN_PACKAGE}.tar.gz`
  );
  return { cacheDir, cacheFile };
}

function download(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error(`слишком много перенаправлений: ${url}`));
    }
    https
      .get(url, { headers: { 'user-agent': 'atom-lite-build' } }, response => {
        const { statusCode, headers } = response;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          return resolve(download(headers.location, destination, redirectCount + 1));
        }
        if (statusCode !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${statusCode} при загрузке ${url}`));
        }
        const file = fs.createWriteStream(destination);
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

// Архивы ripgrep-prebuilt распакованы так, что бинарник лежит в корне архива
// (пакет ищет ровно «rg» после распаковки). Проверяем это и, если структура
// другая, перепаковываем — чтобы сборка не падала на середине с невнятным
// «Expecting rg or rg.exe unzipped into...».
function normalizeArchive(archivePath) {
  let entries;
  try {
    entries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(`архив не читается как tar.gz: ${error.message}`);
  }

  if (entries[0] === 'rg') {
    return 'rg уже лежит в корне архива';
  }

  const rgEntry = entries.find(entry => path.basename(entry) === 'rg');
  if (!rgEntry) {
    throw new Error(`в архиве нет файла rg (содержимое: ${entries.join(', ')})`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-repack-'));
  execFileSync('tar', ['-xzf', archivePath, '-C', workDir]);
  const rgPath = path.join(workDir, rgEntry);
  const repacked = path.join(workDir, 'ripgrep-repacked.tar.gz');
  execFileSync('tar', ['-czf', repacked, '-C', path.dirname(rgPath), 'rg']);
  fs.copyFileSync(repacked, archivePath);
  return `архив перепакован: ${rgEntry} → rg в корне`;
}

function isGzip(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  const magic = Buffer.alloc(2);
  fs.readSync(descriptor, magic, 0, 2, 0);
  fs.closeSync(descriptor);
  return magic[0] === 0x1f && magic[1] === 0x8b;
}

module.exports = async function prepareRipgrep() {
  if (process.platform !== 'darwin') {
    console.log('ripgrep: подготовка нужна только для macOS — пропускаю');
    return;
  }

  const appDependencies = require(path.join(CONFIG.repositoryRootPath, 'package.json'))
    .dependencies || {};
  const ripgrepVersion = appDependencies['vscode-ripgrep'];
  if (ripgrepVersion !== RG_PACKAGE_VERSION) {
    console.log(
      `ripgrep: в проекте версия ${ripgrepVersion}, а подготовка написана под ` +
        `${RG_PACKAGE_VERSION} — проверьте script/lib/prepare-ripgrep.js`
    );
    return;
  }

  const { cacheDir, cacheFile } = cachePaths();
  const target = RG_TARGETS[CONFIG.targetArch] || RG_TARGETS.x64;

  if (fs.existsSync(cacheFile) && isGzip(cacheFile)) {
    console.log(`ripgrep: архив уже в кэше (${cacheFile}) — сеть не нужна`);
    return;
  }

  const fileName = `ripgrep-${RG_RELEASE}-${target}.tar.gz`;
  const url = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/${RG_RELEASE}/${fileName}`;

  console.log(
    `ripgrep: нужна сборка «${target}» (целевая архитектура: ${CONFIG.targetArch})`
  );
  console.log(`ripgrep: скачиваю ${url}`);

  fs.mkdirSync(cacheDir, { recursive: true });
  const temporaryPath = `${cacheFile}.part`;

  try {
    await download(url, temporaryPath);
    if (!isGzip(temporaryPath)) {
      throw new Error('скачанный файл не является gzip-архивом');
    }
    console.log(`ripgrep: ${normalizeArchive(temporaryPath)}`);
    fs.renameSync(temporaryPath, cacheFile);
    console.log(`ripgrep: готово, архив лежит в кэше пакета (${cacheFile})`);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (ignored) {
      // файла может не быть — это не проблема
    }
    // Не роняем сборку: без нашего архива пакет попробует скачать сам,
    // как делал раньше (под x64 это обычно срабатывает).
    console.log(`ripgrep: не удалось подготовить архив — ${error.message}`);
    console.log('ripgrep: пакет попробует скачать сборку сам');
  }
};

// Экспортируем вспомогательные функции для тестов.
module.exports.cachePaths = cachePaths;
module.exports.normalizeArchive = normalizeArchive;
