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
  import(moduleUrl("assets/js/core/robot-design.js")),
  import(moduleUrl("assets/js/core/object-geometry.js")),
  import(moduleUrl("assets/js/adapters/robot-profiles.js")),
  import(moduleUrl("assets/js/scenarios/wro-2026-junior.js"))
]).then(([
  registry,
  math,
  model,
  programming,
  storage,
  i18n,
  robotDesign,
  objectGeometry,
  robotProfiles
]) => ({
  ...registry,
  math,
  model,
  ...programming,
  ...storage,
  ...i18n,
  ...robotDesign,
  ...objectGeometry,
  ...robotProfiles
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
  const geometry = api.materializeRobotDesign(scenario, scenario.robot.defaultDesign);
  assert.equal(scenario.robot.body.type, "grid");
  assert.equal(geometry.design.bodyCells.length, 1024);
  assert.equal(geometry.widthMm, 256);
  assert.equal(geometry.wheelTrackMm, 160);
  assert.equal(geometry.sensors[0].localY, -96);
  assert.deepEqual(
    geometry.attachments.map(({ localX, localY }) => [localX, localY]),
    [[-64, -64], [64, -64], [64, 64], [-64, 64]]
  );
  const objectVisual = api.materializeNumberedObjectVisual(scenario.objects.visual);
  assert.equal(objectVisual.widthMm, 64);
  assert.equal(objectVisual.heightMm, 48);
  assert.deepEqual(
    objectVisual.rectangles.map(({ kind }) => kind),
    ["left-tab", "right-tab", "body", "panel"]
  );
  assert.deepEqual(Array.from(scenario.programming.dropTargets), ["1", "2", "3", "4"]);
  assert.equal(Object.isFrozen(scenario), true);
  assert.equal(Object.isFrozen(scenario.robot.editor.sensorTypes.color.palette), true);
});

test("robot design changes geometry without changing the scenario", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const design = clone(scenario.robot.defaultDesign);
  design.wheels[0].nodeColumn = 8;
  design.wheels[1].nodeColumn = 24;
  design.sensors[0].nodeRow = 12;
  const geometry = api.materializeRobotDesign(scenario, design);
  assert.equal(geometry.bodyRectangles.length, 1);
  assert.equal(geometry.wheelTrackMm, 128);
  assert.equal(geometry.sensors[0].localY, -32);
});

test("robot design validation covers grid, components and primary sensor", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const base = clone(scenario.robot.defaultDesign);
  assert.equal(api.normalizeRobotDesign(scenario, base).bodyCells.length, 1024);

  const duplicate = clone(base);
  duplicate.bodyCells.push(duplicate.bodyCells[0]);
  assert.throws(() => api.normalizeRobotDesign(scenario, duplicate), /Duplicate body cell/);

  const tiltedAxle = clone(base);
  tiltedAxle.wheels[1].nodeRow += 1;
  assert.throws(() => api.normalizeRobotDesign(scenario, tiltedAxle), /horizontal axis/);

  const asymmetricWheels = clone(base);
  asymmetricWheels.wheels[0].nodeColumn += 1;
  assert.throws(() => api.normalizeRobotDesign(scenario, asymmetricWheels), /symmetric/);

  const overlap = clone(base);
  overlap.sensors[0].nodeColumn = overlap.wheels[0].nodeColumn;
  overlap.sensors[0].nodeRow = overlap.wheels[0].nodeRow;
  assert.throws(() => api.normalizeRobotDesign(scenario, overlap), /overlap/);

  const noPrimary = clone(base);
  noPrimary.primarySensorId = "missing";
  assert.throws(() => api.normalizeRobotDesign(scenario, noPrimary), /Primary sensor/);

  const oldProfile = clone(base);
  delete oldProfile.attachments;
  assert.equal(api.normalizeRobotDesign(scenario, oldProfile).attachments.length, 4);

  const unsupportedObject = clone(base);
  unsupportedObject.bodyCells = unsupportedObject.bodyCells.filter(
    ([column, row]) => column < 20 || row < 20
  );
  assert.throws(() => api.normalizeRobotDesign(scenario, unsupportedObject), /attached above a body cell/);

  const duplicateAttachment = clone(base);
  duplicateAttachment.attachments[1].objectId = "1";
  assert.throws(() => api.normalizeRobotDesign(scenario, duplicateAttachment), /Duplicate attachment/);

  const attachmentOverlap = clone(base);
  attachmentOverlap.attachments[0].nodeColumn = 16;
  attachmentOverlap.attachments[0].nodeRow = 4;
  assert.throws(() => api.normalizeRobotDesign(scenario, attachmentOverlap), /overlap/);

  const missingAttachment = clone(base);
  missingAttachment.attachments.pop();
  assert.throws(() => api.normalizeRobotDesign(scenario, missingAttachment), /Every scenario object/);

  const outside = clone(base);
  outside.sensors[0].nodeColumn = 0;
  assert.throws(() => api.normalizeRobotDesign(scenario, outside), /outside the robot grid/);
});

test("grid geometry preserves holes and rigid islands while merging full areas", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const design = clone(scenario.robot.defaultDesign);
  design.bodyCells = [
    [0, 0], [1, 0],
    [0, 1],
    [10, 10]
  ];
  const rectangles = api.mergeBodyCells(scenario, design);
  assert.deepEqual(
    rectangles.map(({ width, height }) => [width, height]).sort((a, b) => a[0] - b[0]),
    [[8, 8], [8, 8], [16, 8]]
  );

  const checkerboard = clone(scenario.robot.defaultDesign);
  checkerboard.bodyCells = [];
  for (let row = 0; row < 32; row += 1) {
    for (let column = 0; column < 32; column += 1) {
      if ((column + row) % 2 === 0) checkerboard.bodyCells.push([column, row]);
    }
  }
  assert.equal(api.mergeBodyCells(scenario, checkerboard).length, 512);
});

test("robot profile store keeps drafts and imports validated snapshots", async () => {
  const api = await apiPromise;
  const scenario = api.getScenario("wro-2026-junior");
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const store = api.createRobotProfileStore(scenario, storage);
  const initial = store.load();
  assert.equal(initial.profiles.length, 1);
  const legacyDefault = clone(initial.profiles[0].design);
  legacyDefault.bodyCells = legacyDefault.bodyCells.filter(
    ([column, row]) => column < 31 && row < 31
  );
  store.update(initial.profiles[0].id, { design: legacyDefault });
  assert.equal(store.load().profiles[0].design.bodyCells.length, 1024);
  const copy = store.duplicate(initial.profiles[0].id);
  assert.equal(store.load().profiles.length, 2);
  const invalid = clone(copy.design);
  invalid.wheels = [];
  store.update(copy.id, { design: invalid });
  assert.equal(store.validation(store.load().profiles.find((item) => item.id === copy.id)).design, null);
  assert.throws(() => store.importProfile(copy.id), /exactly two wheels/);
  const snapshot = store.importProfile(initial.profiles[0].id);
  assert.equal(store.active().snapshot.profileId, snapshot.profileId);
  values.set(scenario.storage.activeRobotDesign, "{broken");
  assert.ok(store.active().error);
  store.remove(copy.id);
  assert.equal(store.load().profiles.length, 1);
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
