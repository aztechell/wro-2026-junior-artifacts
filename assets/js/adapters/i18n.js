(function initializeSimulatorI18n(global) {
  "use strict";

  const api = global.AlgoSimulator = global.AlgoSimulator || {};

  function createI18n(translations, initialLanguage = "ru") {
    let language = translations[initialLanguage] ? initialLanguage : Object.keys(translations)[0];

    function value(key) {
      return key.split(".").reduce(
        (current, segment) => current?.[segment],
        translations[language]
      );
    }

    function translate(key, values = {}) {
      const template = value(key) || key;
      return template.replace(
        /\{(\w+)\}/g,
        (_, name) => String(values[name] ?? "")
      );
    }

    return Object.freeze({
      get language() {
        return language;
      },
      setLanguage(nextLanguage) {
        if (translations[nextLanguage]) {
          language = nextLanguage;
        }
        return language;
      },
      value,
      translate
    });
  }

  api.createI18n = createI18n;
})(globalThis);
