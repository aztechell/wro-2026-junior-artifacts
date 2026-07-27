# Configurable Robot Simulator

Static browser simulator for WRO-style robot missions and pseudocode. The
included scenario reproduces the WRO 2026 Junior simulator.

## Run locally

The application uses native ES modules and must be opened through HTTP:

```powershell
npm install
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173). Opening
`index.html` through `file://` is intentionally unsupported. GitHub Pages and
other static HTTP hosting work without a build step.

On Windows, double-click `start-simulator.cmd` to start the server and open the
simulator automatically. Close its console window or press `Ctrl+C` to stop it.
Node.js is still required, but no terminal command is needed.

## Architecture

- `assets/js/core/` contains scenario registration, validation, simulation
  state, grid robot design validation, geometry and motion math. Core modules
  do not read the DOM.
- `assets/js/programming.js` contains the shared pseudocode parser. The syntax
  is common to all scenarios; colors and valid `drop()` targets come from the
  active scenario.
- `assets/js/adapters/` contains localization and storage adapters.
- `assets/js/scenarios/wro-2026-junior.js` is the declarative WRO configuration:
  field, robot, sensors, objects, physics, controls, programs and translations.
- `assets/js/app.js` exports the scenario-independent simulator factory.
- `assets/js/bootstrap.js` imports the selected scenario and starts the page.
- `robot-editor.html` is the separate 32 × 32 robot editor. Named drafts and
  the explicitly imported simulator snapshot are stored per scenario.

All application modules use native `import` and `export`. `index.html` loads
Matter.js followed by the single module entrypoint, `bootstrap.js`.

## Module API

Import the pieces needed by the host application:

```js
import { createSimulator } from "./assets/js/app.js";
import {
  getScenario,
  listScenarios,
  registerScenario
} from "./assets/js/core/registry.js";
import "./assets/js/scenarios/wro-2026-junior.js";

const simulator = createSimulator({
  scenarioId: "wro-2026-junior",
  root: document,
  matter: window.Matter
});
```

The registry includes component types for a rectangular body, differential
drive, grid body, color sensor and numbered artifact. Grid robot designs use
8 mm cells, two wheels on one horizontal axle, one or more color sensors and
one attachment point for every scenario object.
Scenario registration validates required data, component types, identifiers
and primary dimensions, then freezes the configuration.

## Robot editor

Open [http://127.0.0.1:4173/robot-editor.html](http://127.0.0.1:4173/robot-editor.html)
or use **Robot editor** in the simulator. The editor can paint or erase body
cells, place wheels and sensors, move the initial attachment points of numbered
objects, select the primary line sensor and manage multiple named profiles.
An object attachment must remain supported by a body cell and cannot overlap
another component. Double-clicking an object restores its scenario-default
position.

Drafts autosave but do not change the simulator. Use **Import robot** in the
simulator to store and activate a validated snapshot. **Default robot** clears
that snapshot. Existing program tabs, colors and language use their original
storage keys.

## Adding a scenario

1. Copy `assets/js/scenarios/wro-2026-junior.js` and give the configuration a
   unique `id`.
2. Change declarative values: field dimensions and images, robot geometry and
   start pose, differential-drive parameters, sensors, objects, physics,
   controls, built-in programs and translations.
3. Import the new scenario from `assets/js/bootstrap.js`.
4. Pass its ID to `createSimulator()` in the bootstrap.

Use a unique storage namespace for each scenario. The WRO configuration keeps
the original `wro2026Junior*` localStorage keys so existing programs, tabs,
language and color settings remain compatible on the same HTTP origin.

`world.backgroundSrc` controls the displayed field, while
`world.sensorMapSrc` controls the image sampled by color sensors. Both are
ordinary HTTP-loaded image paths; no generated Base64 mirror is needed.

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

```powershell
npm test
```

The unit tests import the production ES modules directly. The Playwright smoke
test starts the same local HTTP server used by `npm run dev` and checks module
loading, storage, localization, movement, object dropping and the color sensor.
