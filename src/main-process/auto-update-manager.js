const { EventEmitter } = require('events');

const IdleState = 'idle';

// ATOM LITE: автообновление полностью отключено.
//
// Оригинальный Atom каждые 4 часа обращался к `https://atom.io/api/updates`,
// поднимал Electron autoUpdater и скачивал обновления. Сервис atom.io мёртв
// с 15 декабря 2022 года, поэтому проверки обновлений бессмысленны: они лишь
// держат открытыми сетевые соединения и ждут таймаут при старте.
//
// Публичный API класса сохранён без изменений, потому что им пользуются
// `atom-application.js` (IPC-обработчики состояния) и `application-menu.js`.
// Все методы — заглушки. Ни одного сетевого вызова, ни одного таймера.
module.exports = class AutoUpdateManager extends EventEmitter {
  constructor(version, testMode, config) {
    super();
    this.version = version;
    this.testMode = testMode;
    this.config = config;
    this.state = IdleState;
    this.errorMessage = null;
    this.releaseVersion = null;
    this.checkForUpdatesIntervalID = null;
  }

  // Раньше: создавал feedUrl вида https://atom.io/api/updates и подписывался
  // на события Electron autoUpdater. Теперь — намеренно ничего не делает.
  initialize() {}

  emitUpdateAvailableEvent() {}

  emitWindowEvent() {}

  getState() {
    return this.state;
  }

  getErrorMessage() {
    return this.errorMessage;
  }

  // Раньше: ставил setInterval на 4 часа и сразу же дёргал проверку обновлений.
  scheduleUpdateCheck() {}

  cancelScheduledUpdateCheck() {
    if (this.checkForUpdatesIntervalID) {
      clearInterval(this.checkForUpdatesIntervalID);
      this.checkForUpdatesIntervalID = null;
    }
  }

  // Раньше: autoUpdater.checkForUpdates() — реальный запрос в сеть.
  check() {}

  // Раньше: autoUpdater.quitAndInstall().
  install() {}
};
