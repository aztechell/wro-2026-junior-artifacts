# Configurable Robot Simulator

Static browser simulator for testing WRO-style robot missions and pseudocode.
The included scenario reproduces the WRO 2026 Junior simulator.

Open `index.html` directly or publish the repository with GitHub Pages. The
runtime uses ordinary browser scripts, so a local server and build step are not
required.

## Architecture

- `assets/js/core/` contains scenario registration, validation, simulation
  state, geometry and motion math. Core modules do not read the DOM.
- `assets/js/programming.js` contains the shared pseudocode parser. The syntax
  is common to all scenarios; colors and valid `drop()` targets come from the
  active scenario.
- `assets/js/adapters/` contains browser-specific localization and storage
  adapters.
- `assets/js/scenarios/wro-2026-junior.js` is the declarative WRO configuration:
  field, robot, sensors, objects, physics, controls, programs and translations.
- `assets/js/app.js` connects the selected scenario to Matter.js, Canvas and the
  existing interface.

Scripts are loaded in dependency order near the end of `index.html`: vendor
assets, core modules, programming and browser adapters, scenario files, then
the application bootstrap.

## Browser API

The global `window.AlgoSimulator` namespace exposes:

```js
AlgoSimulator.registerScenario(config);
AlgoSimulator.getScenario("wro-2026-junior");
AlgoSimulator.listScenarios();
AlgoSimulator.createSimulator({
  scenarioId: "wro-2026-junior",
  root: document,
  matter: window.Matter
});
```

The application registers built-in component types for a rectangular body,
differential drive, color sensor and numbered artifact. Scenario registration
validates required data, component types, identifiers and primary dimensions,
then freezes the configuration.

## Adding a scenario

1. Copy `assets/js/scenarios/wro-2026-junior.js` and give the configuration a
   unique `id`.
2. Change only declarative values: field dimensions and assets, robot geometry
   and start pose, differential-drive parameters, sensor positions, objects,
   physics, controls, built-in programs and translations.
3. Add the scenario script before `assets/js/app.js` in `index.html`.
4. Set the desired scenario ID in the bootstrap. A scenario selector is
   intentionally not part of the current release.

Use a unique storage namespace for a new scenario. The WRO configuration keeps
the original `wro2026Junior*` localStorage keys so existing programs, tabs,
language and color settings remain compatible.

## Pseudocode

All scenarios use the existing language:

- `startPoint`, `straight`, `turn`, `turn_one`, `moveToLine`;
- `drop`, `readColors`;
- color assignments, `if`/`elif`/`else`, `and`/`or`;
- `for color in colors`.

The grammar remains stable. A scenario supplies the ordered colors, assignment
values, valid object IDs for `drop()` and the color sensor used by
`moveToLine()`.

## Tests

Install the development dependency and run:

```powershell
npm install
npm test
```

The suite uses `node:test` for configuration, model, geometry, adapters and the
interpreter. A Playwright smoke test opens `index.html` through `file://` in the
locally installed Chrome browser and checks legacy storage, localization,
movement, object dropping and the color sensor.
