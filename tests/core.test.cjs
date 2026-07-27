const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(projectRoot, relativePath)).href;
}

const apiPromise = Promise.all([
  import(moduleUrl("assets/js/core/registry.js")),
  import(moduleUrl("assets/js/core/math.js")),
  import(moduleUrl("assets/js/core/model.js")),
  import(moduleUrl("assets/js/programming.js")),
  import(moduleUrl("assets/js/adapters/storage.js")),
  import(moduleUrl("assets/js/adapters/i18n.js")),
  import(moduleUrl("assets/js/scenarios/wro-2026-junior.js"))
]).then(([registry, math, model, programming, storage, i18n]) => ({
  ...registry,
  math,
  model,
  ...programming,
  ...storage,
  ...i18n
}));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createError(key, values) {
  const error = new Error(key);
  error.i18nKey = key;
  error.i18nValues = values;
  return error;
}

test("WRO scenario is registered, validated and deeply frozen", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");

  assert.equal(api.listScenarios().length, 1);
  assert.equal(scenario.world.widthMm, 1000);
  assert.equal(scenario.robot.body.widthMm, 250);
  assert.equal(scenario.robot.drive.wheelTrackMm, 163.5);
  assert.deepEqual(Array.from(scenario.programming.dropTargets), ["1", "2", "3", "4"]);
  assert.equal(Object.isFrozen(scenario), true);
  assert.equal(Object.isFrozen(scenario.robot.sensors[0].palette), true);
});

test("scenario registry accepts a different robot geometry without changing core", async () => {
  const api = await apiPromise;
  const scenario = clone(api.getScenario("wro-2026-junior"));
  scenario.id = "geometry-fixture";
  scenario.robot.body.widthMm = 180;
  scenario.robot.body.heightMm = 220;
  scenario.robot.drive.wheelTrackMm = 140;
  scenario.robot.sensors[0].localY = -72;

  api.registerScenario(scenario);
  const fixture = api.getScenario("geometry-fixture");
  assert.equal(fixture.robot.body.widthMm, 180);
  assert.equal(fixture.robot.body.heightMm, 220);
  assert.equal(fixture.robot.drive.wheelTrackMm, 140);
  assert.equal(fixture.robot.sensors[0].localY, -72);
});

test("scenario validation rejects duplicate objects and unknown component types", async () => {
  const api = await apiPromise;
  const duplicate = clone(api.getScenario("wro-2026-junior"));
  duplicate.id = "duplicate-fixture";
  duplicate.objects.instances[1].id = duplicate.objects.instances[0].id;
  assert.throws(() => api.registerScenario(duplicate), /duplicate object id/);

  const unknownDrive = clone(api.getScenario("wro-2026-junior"));
  unknownDrive.id = "drive-fixture";
  unknownDrive.robot.drive.type = "omni";
  assert.throws(() => api.registerScenario(unknownDrive), /unknown drive type/);
});

test("core geometry and acceleration preserve simulator math", async () => {
  const { math } = await apiPromise;
  assert.deepEqual(
    { ...math.localToWorld({ xMm: 100, yMm: 200, headingRad: 0 }, 10, -20) },
    { xMm: 110, yMm: 180 }
  );
  assert.equal(math.normalizeAngle(Math.PI * 3), Math.PI);
  assert.deepEqual(
    { ...math.acceleratedStep(100, 0, 500, 1400, 0.1) },
    { step: 7, speed: 140 }
  );
});

test("model, localization and storage adapters stay scenario-scoped", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const first = api.model.createSimulationModel(scenario);
  const second = api.model.createSimulationModel(scenario);
  first.robot.xMm = 10;
  first.objects[0].dropped = true;
  assert.equal(second.robot.xMm, 340);
  assert.equal(second.objects[0].dropped, false);

  const values = new Map();
  const storage = api.createScenarioStorage(scenario, {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  });
  storage.set("language", "en");
  assert.equal(values.get("wro2026JuniorLanguage"), "en");

  const i18n = api.createI18n(scenario.translations);
  assert.equal(i18n.translate("ui.reset"), "Сброс");
  i18n.setLanguage("en");
  assert.equal(i18n.translate("ui.reset"), "Reset");
});

test("interpreter parses every built-in WRO program", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const colorValues = new Map([
    ["yellow", "1"],
    ["blue", "2"],
    ["black", "None"],
    ["green", "3"],
    ["red", "4"]
  ]);
  const interpreter = api.createInterpreter({
    scenario,
    getColorValues: () => colorValues,
    errorFactory: createError
  });

  for (const program of scenario.programming.builtInPrograms) {
    const commands = interpreter.parseProgram(program.code);
    assert.equal(commands[0].type, "start_point", program.id);
    assert.ok(commands.length > 1, program.id);
  }
});

test("interpreter keeps the language while deriving colors and drop targets from config", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const interpreter = api.createInterpreter({
    scenario,
    getColorValues: () => new Map([
      ["yellow", "1"],
      ["blue", "2"],
      ["black", "None"],
      ["green", "3"],
      ["red", "4"]
    ]),
    errorFactory: createError
  });

  const commands = interpreter.parseProgram(`startPoint(340, 820, 0)
readColors()
if Yellow == 1 and Blue != None {
  drop(1)
} else {
  drop(2)
}`);

  assert.deepEqual(
    Array.from(commands, (command) => command.type),
    ["start_point", "read_colors", "drop"]
  );
  assert.equal(commands[2].value, "1");
  assert.throws(
    () => interpreter.parseProgram("startPoint(0, 0, 0)\ndrop(5)"),
    (error) => error.i18nKey === "errors.dropExpects"
  );
});
