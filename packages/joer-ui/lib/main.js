// «joer» — пять атмосфер. Всё, что здесь есть: сказать разметке, какая
// атмосфера выбрана и включена ли подсветка окна. Цвета живут в LESS
// (styles/atmospheres.less) — они не меняются на ходу, меняется только
// признак, а признак виден из любого места документа, потому что лежит
// атрибутом на <html>.
//
// Никакого движения и никаких обработчиков: смена атмосферы — мгновенная,
// как смена настроения, а не «сцена» из сайта. Сцены в редакторе не место.

const root = document.documentElement;
const THEME_NAME = 'joer-ui';
const ATMOSPHERES = ['lounge', 'club', 'romantic', 'space', 'velvet'];

module.exports = {
  activate() {
    atom.config.observe(`${THEME_NAME}.atmosphere`, setAtmosphere);
    atom.config.observe(`${THEME_NAME}.ambient`, setAmbient);
    atom.config.observe(`${THEME_NAME}.fontSize`, setFontSize);
  },

  deactivate() {
    root.removeAttribute('data-joer-atmosphere');
    root.removeAttribute('data-joer-ambient');
    root.style.fontSize = '';
  }
};

function setAtmosphere(atmosphere) {
  const value = ATMOSPHERES.includes(atmosphere) ? atmosphere : 'lounge';
  root.setAttribute('data-joer-atmosphere', value);
}

function setAmbient(ambient) {
  root.setAttribute('data-joer-ambient', ambient === false ? 'off' : 'on');
}

function setFontSize(size) {
  root.style.fontSize = `${size}px`;
}
