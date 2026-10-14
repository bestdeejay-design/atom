'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const electronPackager = require('electron-packager');
const fs = require('fs-extra');
const getLicenseText = require('./get-license-text');
const path = require('path');
const spawnSync = require('./spawn-sync');
const template = require('lodash.template');

const CONFIG = require('../config');

// ATOM LITE: архитектура сборки берётся из `script/config.js` и по умолчанию
// совпадает с архитектурой машины. Раньше здесь стоял `hostArch()` из
// `@electron/get`, а ниже — жёсткая константа 'x64' для macOS.
const HOST_ARCH = CONFIG.targetArch;

module.exports = function() {
  const appName = getAppName();
  console.log(
    `Running electron-packager on ${
      CONFIG.intermediateAppPath
    } with app name "${appName}"`
  );
  return runPackager({
    appBundleId: 'com.github.atom',
    appCopyright: `Copyright © 2014-${new Date().getFullYear()} GitHub, Inc. All rights reserved.`,
    appVersion: CONFIG.appMetadata.version,
    arch: HOST_ARCH, // ATOM LITE: было жёстко 'x64' для macOS — из-за этого
    // на Apple Silicon собирался интеловский бинарник под Rosetta
    asar: { unpack: buildAsarUnpackGlobExpression() },
    buildVersion: CONFIG.appMetadata.version,
    derefSymlinks: false,
    download: { cache: CONFIG.electronDownloadPath },
    dir: CONFIG.intermediateAppPath,
    electronVersion: CONFIG.appMetadata.electronVersion,
    extendInfo: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'mac',
      'atom-Info.plist'
    ),
    helperBundleId: 'com.github.atom.helper',
    icon: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'app-icons',
      CONFIG.channel,
      'atom'
    ),
    name: appName,
    out: CONFIG.buildOutputPath,
    overwrite: true,
    platform: process.platform,
    // Atom doesn't have devDependencies, but if prune is true, it will delete the non-standard packageDependencies.
    prune: false,
    win32metadata: {
      CompanyName: 'GitHub, Inc.',
      FileDescription: 'Atom',
      ProductName: CONFIG.appName
    }
  }).then(packagedAppPath => {
    let bundledResourcesPath;
    if (process.platform === 'darwin') {
      bundledResourcesPath = path.join(
        packagedAppPath,
        'Contents',
        'Resources'
      );
      setAtomHelperVersion(packagedAppPath);
    } else if (process.platform === 'linux') {
      bundledResourcesPath = path.join(packagedAppPath, 'resources');
      chmodNodeFiles(packagedAppPath);
    } else {
      bundledResourcesPath = path.join(packagedAppPath, 'resources');
    }

    return copyNonASARResources(packagedAppPath, bundledResourcesPath).then(
      () => {
        console.log(`Application bundle created at ${packagedAppPath}`);
        return packagedAppPath;
      }
    );
  });
};

function copyNonASARResources(packagedAppPath, bundledResourcesPath) {
  console.log(`Copying non-ASAR resources to ${bundledResourcesPath}`);
  // ATOM LITE: встроенный менеджер пакетов (apm) больше не копируется в
  // приложение.
  //
  // Раньше здесь целиком лежал `atom-package-manager` — 67 МБ зависимостей
  // (из них 33 МБ — собственный npm 6), а вместе с ним в сборку попадал и его
  // Node 12 под x64: apm запускается своим Node, а не Electron. Это был
  // единственный компонент приложения не под arm64 — на Apple Silicon он
  // работал бы только через Rosetta и только ради загрузки пакетов из сети.
  //
  // Форк собирается без сетевых зависимостей: нужные пакеты кладутся в
  // сборку файлами. Если apm всё-таки понадобится, путь к своему экземпляру
  // можно указать в настройке `core.apmPath` (src/package-manager.js).
  //
  // Сам apm при этом никуда не делся из сборки: он по-прежнему ставит
  // зависимости приложения на этапе `script/bootstrap` (script/lib/install-apm.js).
  if (process.platform !== 'win32') {
    fs.copySync(
      path.join(CONFIG.repositoryRootPath, 'atom.sh'),
      path.join(bundledResourcesPath, 'app', 'atom.sh')
    );
  }
  if (process.platform === 'darwin') {
    fs.copySync(
      path.join(CONFIG.repositoryRootPath, 'resources', 'mac', 'file.icns'),
      path.join(bundledResourcesPath, 'file.icns')
    );
  } else if (process.platform === 'linux') {
    fs.copySync(
      path.join(
        CONFIG.repositoryRootPath,
        'resources',
        'app-icons',
        CONFIG.channel,
        'png',
        '1024.png'
      ),
      path.join(packagedAppPath, 'atom.png')
    );
  } else if (process.platform === 'win32') {
    // ATOM LITE: apm.cmd и apm.sh отсюда убраны вместе с самим менеджером
    // пакетов.
    ['atom.sh', 'atom.js', 'file.ico', 'folder.ico'].forEach(file =>
      fs.copySync(
        path.join(CONFIG.repositoryRootPath, 'resources', 'win', file),
        path.join(bundledResourcesPath, 'cli', file)
      )
    );

    // Customize atom.cmd for the channel-specific atom.exe name (e.g. atom-beta.exe)
    generateAtomCmdForChannel(bundledResourcesPath);
  }

  console.log(`Writing LICENSE.md to ${bundledResourcesPath}`);
  return getLicenseText().then(licenseText => {
    fs.writeFileSync(
      path.join(bundledResourcesPath, 'LICENSE.md'),
      licenseText
    );
  });
}

function setAtomHelperVersion(packagedAppPath) {
  const frameworksPath = path.join(packagedAppPath, 'Contents', 'Frameworks');
  const helperPListPath = path.join(
    frameworksPath,
    'Atom Helper.app',
    'Contents',
    'Info.plist'
  );
  console.log(`Setting Atom Helper Version for ${helperPListPath}`);
  spawnSync('/usr/libexec/PlistBuddy', [
    '-c',
    `Add CFBundleVersion string ${CONFIG.appMetadata.version}`,
    helperPListPath
  ]);
  spawnSync('/usr/libexec/PlistBuddy', [
    '-c',
    `Add CFBundleShortVersionString string ${CONFIG.appMetadata.version}`,
    helperPListPath
  ]);
}

function chmodNodeFiles(packagedAppPath) {
  console.log(`Changing permissions for node files in ${packagedAppPath}`);
  childProcess.execSync(
    `find "${packagedAppPath}" -type f -name *.node -exec chmod a-x {} \\;`
  );
}

function buildAsarUnpackGlobExpression() {
  const unpack = [
    '*.node',
    'ctags-config',
    'ctags-darwin',
    'ctags-linux',
    'ctags-win32.exe',
    path.join('**', 'node_modules', 'spellchecker', '**'),
    path.join('**', 'node_modules', 'dugite', 'git', '**'),
    path.join('**', 'node_modules', 'github', 'bin', '**'),
    path.join('**', 'node_modules', 'vscode-ripgrep', 'bin', '**'),
    path.join('**', 'resources', 'atom.png')
  ];

  return `{${unpack.join(',')}}`;
}

function getAppName() {
  if (process.platform === 'darwin') {
    return CONFIG.appName;
  } else if (process.platform === 'win32') {
    return CONFIG.channel === 'stable' ? 'atom' : `atom-${CONFIG.channel}`;
  } else {
    return 'atom';
  }
}

async function runPackager(options) {
  const packageOutputDirPaths = await electronPackager(options);

  assert(
    packageOutputDirPaths.length === 1,
    'Generated more than one electron application!'
  );

  return renamePackagedAppDir(packageOutputDirPaths[0]);
}

function renamePackagedAppDir(packageOutputDirPath) {
  let packagedAppPath;
  if (process.platform === 'darwin') {
    const appBundleName = getAppName() + '.app';
    packagedAppPath = path.join(CONFIG.buildOutputPath, appBundleName);
    if (fs.existsSync(packagedAppPath)) fs.removeSync(packagedAppPath);
    fs.renameSync(
      path.join(packageOutputDirPath, appBundleName),
      packagedAppPath
    );
  } else if (process.platform === 'linux') {
    const appName =
      CONFIG.channel !== 'stable' ? `atom-${CONFIG.channel}` : 'atom';
    let architecture;
    if (HOST_ARCH === 'ia32') {
      architecture = 'i386';
    } else if (HOST_ARCH === 'x64') {
      architecture = 'amd64';
    } else {
      architecture = HOST_ARCH;
    }
    packagedAppPath = path.join(
      CONFIG.buildOutputPath,
      `${appName}-${CONFIG.appMetadata.version}-${architecture}`
    );
    if (fs.existsSync(packagedAppPath)) fs.removeSync(packagedAppPath);
    fs.renameSync(packageOutputDirPath, packagedAppPath);
  } else {
    packagedAppPath = path.join(CONFIG.buildOutputPath, CONFIG.appName);
    if (process.platform === 'win32' && HOST_ARCH !== 'ia32') {
      packagedAppPath += ` ${process.arch}`;
    }
    if (fs.existsSync(packagedAppPath)) fs.removeSync(packagedAppPath);
    fs.renameSync(packageOutputDirPath, packagedAppPath);
  }
  return packagedAppPath;
}

function generateAtomCmdForChannel(bundledResourcesPath) {
  const atomCmdTemplate = fs.readFileSync(
    path.join(CONFIG.repositoryRootPath, 'resources', 'win', 'atom.cmd')
  );
  const atomCmdContents = template(atomCmdTemplate)({
    atomExeName: CONFIG.executableName
  });
  fs.writeFileSync(
    path.join(bundledResourcesPath, 'cli', 'atom.cmd'),
    atomCmdContents
  );
}
