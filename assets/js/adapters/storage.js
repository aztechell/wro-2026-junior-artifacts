(function initializeScenarioStorage(global) {
  "use strict";

  const api = global.AlgoSimulator = global.AlgoSimulator || {};

  function createScenarioStorage(scenario, storage) {
    const keys = scenario.storage;
    return Object.freeze({
      get(name) {
        const key = keys[name];
        if (!key) return null;
        return storage.getItem(key);
      },
      set(name, value) {
        const key = keys[name];
        if (!key) {
          throw new Error(`Unknown scenario storage key: ${name}`);
        }
        storage.setItem(key, value);
      },
      remove(name) {
        const key = keys[name];
        if (key) storage.removeItem(key);
      }
    });
  }

  api.createScenarioStorage = createScenarioStorage;
})(globalThis);
