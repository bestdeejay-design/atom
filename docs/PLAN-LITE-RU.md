# Atom Lite — план приведения в порядок

**Цель проекта:** максимально лёгкий, автономный, офлайн-редактор на базе Atom
для Apple Silicon Mac. Ноль обращений в сеть, минимум лишнего кода, свой стиль.

---

## ✅ Этап 1. Сеть: вырезана полностью

Сделано в этой итерации.

| Что вырезано | Где | Было |
|---|---|---|
| Автообновление | `src/main-process/auto-update-manager.js` | каждые 4 часа `https://atom.io/api/updates` |
| Краш-репортер | `src/crash-reporter-start.js` (удалён) + `src/main-process/start.js` | `https://atom.io/crash_reports` |
| Телеметрия `metrics` | `package.json`, `src/initialize-application-window.js` | отправка статистики на сервера GitHub |
| `exception-reporting` | пакет удалён целиком | отчёты об ошибках на `notify.bugsnag.com` |
| `github` (панель GitHub) | `package.json`, снапшот | GitHub API + тянул за собой бинарь `dugite` |
| `open-on-github` | пакет удалён из сборки | открытие ссылок github.com |
| `update-package-dependencies` | пакет удалён целиком | запускал `apm install` |
| `deprecation-cop`: поиск похожих issue | `packages/deprecation-cop/lib/deprecation-cop-view.js` | `https://api.github.com/search/issues` |
| `deprecation-cop`: сокращатель ссылок | там же | `https://is.gd` — **текст вашего отчёта уходил на сторонний сервис** |
| Запрос согласия на телеметрию | `packages/welcome/lib/welcome-package.js` | вкладка «делиться статистикой?» при первом запуске |
| Баннер «Atom закрывается» | `packages/welcome/package.json` | показывался при каждом запуске (2022 год!) |
| Пункты меню обновлений | `menus/darwin.cson`, `menus/win32.cson`, `src/main-process/application-menu.js` | «Check for Update», «Downloading Update»… |

**Результат проверки:** в коде не осталось ни одного обращения в интернет.

Единственный `net.connect()` в `src/main-process/atom-application.js:178` —
это **локальный unix-сокет** для определения, что запущено второе окно.
Он никуда не ходит и трогать его не нужно.

Публичный API модулей сохранён (`getState()`, `check()`, `install()` и т.д.),
поэтому остальной код работает без переделок.

### Что ещё ходит в сеть (и почему пока нет)

| Что | Почему не тронуто |
|---|---|
| `settings-view` — вкладки Install / Update / Themes | Это **git-пакет** из архива `atom/*`, его файлов нет в репозитории. Чтобы починить, нужно сначала «вендорить» пакет внутрь `packages/` |
| `apm` (`src/package-manager.js`) | Встроенный менеджер пакетов. Мёртвый реестр, но он не активен сам по себе |
| `spell-check` | Нужно проверить: использует системные словари macOS или качает свои |
| Help-меню | `atom.io/faq`, `flight-manual.atom.io`, `atom.io/terms` — мёртвые ссылки. Открываются только по клику, но выглядят неопрятно |

---

## 📦 Этап 2. Вес: что ещё можно снять

Сейчас в сборке **88 пакетов**. Реально нужны не все.

### 34 языковых пакета

Практически всё — отдельные git-репозитории `atom/language-*`, то есть
34 лишние сетевые загрузки при сборке.

**Кандидаты на удаление** (если не пишешь на них):
`language-clojure`, `language-coffee-script`, `language-csharp`, `language-go`,
`language-java`, `language-mustache`, `language-objective-c`, `language-perl`,
`language-php`, `language-property-list`, `language-ruby`,
`language-ruby-on-rails`, `language-sass`, `language-sql`, `language-toml`,
`language-make`, `language-less`, `language-source`, `language-git`

**Стоит оставить:** `javascript`, `html`, `css`, `json`, `gfm` (markdown),
`yaml`, `xml`, `shellscript`, `text`, `todo`, `hyperlink`, `python`, `c`, `rust`

### 10 тем → 2 (решено в Волне 4)

Сейчас грузятся по умолчанию **свои** темы: **`dajet-ui` + `dajet-syntax`**
(см. `docs/THEMES-RU.md`), вторая пара — `joer` — выбирается в настройках;
у неё пять атмосфер.

Прежние 12 тем (`one-dark`, `one-light`, `atom-dark`, `atom-light`, `base16`,
`solarized`) остались в сборке: вместе они весят 1.1 МБ, а редактор без сети
не может добрать тему извне — поэтому они остаются выбором. Если владелец
решит их снять, это отдельное решение «диеты».

### Пакеты-кандидаты на удаление

| Пакет | Зачем нужен |
|---|---|
| `dalek` | прогоняет тесты Atom. Нужен только если разрабатываешь сам Atom |
| `deprecation-cop` | показывает устаревшие API. Инструмент разработчика пакетов |
| `dev-live-reload` | перезагружает темы/пакеты на лету. Инструмент разработчика |
| `styleguide` | демо-страница всех элементов интерфейса. Инструмент разработчика |
| `timecop` | замеряет время выполнения операций. Инструмент разработчика |
| `background-tips` | подсказки в пустом окне. Можно оставить, но это «шум» |
| `incompatible-packages` | список несовместимых пакетов. Бессмысленно без установки пакетов |
| `package-generator` | создаёт заготовку нового пакета. Инструмент разработчика |
| `archive-view` | просмотр zip/tar внутри редактора. Можно оставить |
| `image-view` | просмотр картинок. Можно оставить |

**Крупный приз:** вместе с пакетом `github` уходит зависимость `dugite` —
это **полноценный бинарь git**, который весит десятки мегабайт в распакованном виде.

---

## 🎨 Этап 3. Стиль

Когда база облегчена — можно делать своё оформление:

- ~~своя тема в `packages/`~~ — сделано в Волне 4: четыре пакета тем
  (`dajet-ui`, `dajet-syntax`, `joer-ui`, `joer-syntax`), см. `docs/THEMES-RU.md`
- убрать лишние элементы status-bar
- уменьшить высоту строки табов, скругления, тени
- свой `Info.plist` и иконка (сейчас `resources/mac/atom-Info.plist`, иконки в `resources/app-icons/`)

---

## 💻 Этап 4. Apple Silicon (нативная сборка)

Три правки, все известные:

1. **`script/lib/package-application.js`**
   ```js
   arch: process.platform === 'darwin' ? 'x64' : HOST_ARCH,
   ```
   → нужно `arm64` для M-чипов

2. **`script/lib/generate-startup-snapshot.js`**
   ```js
   // TODO: check if we're building for arm64 and use the arm64 version of the binary
   destinationPath = path.join(startupBlobDestinationPath, 'v8_context_snapshot.x86_64.bin');
   ```
   → нужно имя `v8_context_snapshot.arm64.bin`

3. **Нативные модули** — пересобрать под arm64:
   `@atom/watcher`, `@atom/nsfw`, `git-utils`, `superstring`, `pathwatcher`,
   `tree-sitter`, `spellchecker`, `@atom/fuzzy-native`

**Хорошая новость:** Electron `11.5.0` умеет `darwin-arm64`, так что переписывать
проект не нужно — достаточно починить сборку и разобраться с модулями.

---

## 🚀 Этап 5. Сборка и CI

- **`.nvmrc`** с Node `12.16.3` — без него сборка не пойдёт (проверено: в песочнице Node 22)
- **GitHub Actions** вместо мёртвого Azure Pipelines:
  - `macos-15` (arm64) — для нативной сборки
  - `macos-15-intel` — для Intel-сборки (на случай отката)
  - Публичный репозиторий → **раннеры бесплатны**
  - Результат: скачиваемый `Atom.app`, собранный в облаке

---

## ↩️ Как откатить любой шаг

Всё делается в git, каждый этап — отдельный коммит:

```bash
git log --oneline                       # посмотреть коммиты
git revert <хеш>                        # отменить конкретный этап
git checkout 1c3bd35 -- <файл>          # вернуть один файл к оригиналу
```

Базовый коммит оригинала — **`1c3bd35`**, к нему можно вернуться целиком.

---

## ❓ Решения, которые нужны от тебя

1. **Пакет `github` удалён** — вместе с ним ушла вкладка GitHub в редакторе.
   Так и оставляем, или вернуть?
2. **Какие языки программирования** тебе реально нужны? От этого зависит,
   какие `language-*` оставлять.
3. **Тему** делаем свою или берём `one-dark` как есть?
4. **`spell-check`** — нужна ли проверка орфографии?
