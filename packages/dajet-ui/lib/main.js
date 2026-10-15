// «dajet» — облик окна выбирается в настройках темы, а вся работа с цветом
// живёт в LESS (styles/looks.less). Здесь только одно: сказать разметке,
// какой облик выбран.
//
// Почему атрибут на <html>, а не класс на рабочей области: тема оформления
// должна красить и то, что рисуют другие пакеты (дерево файлов, строка
// состояния, настройки), — а им нужен признак, видимый из любой точки
// документа. Атрибут виден всем.
//
// «Как в системе» ничего не слушает: для него в LESS есть медиазапрос
// (prefers-color-scheme), и система сама решает, когда переключить облик.
// Так окно меняется вместе с Mac без единого обработчика.

const root = document.documentElement;
const ATTRIBUTE = 'data-dajet-look';
const THEME_NAME = 'dajet-ui';

module.exports = {
  activate() {
    atom.config.observe(`${THEME_NAME}.look`, setLook);
    atom.config.observe(`${THEME_NAME}.fontSize`, setFontSize);
  },

  deactivate() {
    root.removeAttribute(ATTRIBUTE);
    root.style.fontSize = '';
  }
};

function setLook(look) {
  const value = ['light', 'dark', 'system'].includes(look) ? look : 'system';
  root.setAttribute(ATTRIBUTE, value);
}

function setFontSize(size) {
  root.style.fontSize = `${size}px`;
}
