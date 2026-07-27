const scenarios = new Map();
const componentTypes = new Map();

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Invalid simulator configuration: ${message}`);
    }
  }

  function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    return value;
  }

  function componentKey(kind, type) {
    return `${kind}:${type}`;
  }

  function registerComponentType(kind, type, descriptor) {
    assert(typeof kind === "string" && kind.length > 0, "component kind is required");
    assert(typeof type === "string" && type.length > 0, "component type is required");
    const key = componentKey(kind, type);
    assert(!componentTypes.has(key), `component type "${key}" is already registered`);
    componentTypes.set(key, deepFreeze({ kind, type, ...descriptor }));
  }

  function requireComponent(kind, type, location) {
    assert(
      componentTypes.has(componentKey(kind, type)),
      `${location} references unknown ${kind} type "${type}"`
    );
  }

  function validateScenario(config) {
    assert(config && typeof config === "object", "configuration must be an object");
    assert(config.schemaVersion === 1, "schemaVersion must be 1");
    assert(typeof config.id === "string" && config.id.length > 0, "id is required");
    assert(config.meta && config.meta.title, "meta.title is required");

    assert(config.world && isPositiveNumber(config.world.widthMm), "world.widthMm must be positive");
    assert(isPositiveNumber(config.world.heightMm), "world.heightMm must be positive");
    assert(typeof config.world.backgroundSrc === "string", "world.backgroundSrc is required");
    assert(Array.isArray(config.world.boundaries), "world.boundaries must be an array");
    assert(config.world.boundaries.length > 0, "world.boundaries cannot be empty");
    for (const boundary of config.world.boundaries) {
      assert(
        Number.isFinite(boundary.xMm)
          && Number.isFinite(boundary.yMm)
          && isPositiveNumber(boundary.widthMm)
          && isPositiveNumber(boundary.heightMm),
        `boundary "${boundary.id || "unnamed"}" must have finite position and positive dimensions`
      );
    }
    assert(
      config.world.boundaries.some((boundary) => Number.isFinite(boundary.safetyLimitMm)),
      "one boundary must define safetyLimitMm"
    );

    const robot = config.robot;
    assert(robot && robot.body && robot.drive, "robot body and drive are required");
    requireComponent("body", robot.body.type, "robot.body");
    requireComponent("drive", robot.drive.type, "robot.drive");
    if (robot.body.type === "rectangle") {
      assert(isPositiveNumber(robot.body.widthMm), "robot.body.widthMm must be positive");
      assert(isPositiveNumber(robot.body.heightMm), "robot.body.heightMm must be positive");
      assert(isPositiveNumber(robot.drive.wheelTrackMm), "robot.drive.wheelTrackMm must be positive");
    } else if (robot.body.type === "grid") {
      const grid = robot.editor?.grid;
      assert(grid, "grid robot requires robot.editor.grid");
      assert(grid.columns === 32 && grid.rows === 32, "grid robot must use a 32x32 grid");
      assert(grid.cellSizeMm === 8, "grid robot must use an 8 mm cell size");
      assert(grid.originNodeColumn === 16 && grid.originNodeRow === 16, "grid robot origin must be node 16,16");
      assert(robot.defaultDesign, "grid robot requires a default design");
      assert(robot.editor.sensorTypes?.color, "grid robot requires a color sensor definition");
    }
    assert(
      robot.startPose
        && Number.isFinite(robot.startPose.xMm)
        && Number.isFinite(robot.startPose.yMm)
        && Number.isFinite(robot.startPose.headingDeg),
      "robot.startPose must contain finite xMm, yMm and headingDeg"
    );

    const configuredSensors = robot.body.type === "grid"
      ? robot.defaultDesign.sensors
      : robot.sensors;
    assert(Array.isArray(configuredSensors), "robot sensors must be an array");
    assert(configuredSensors.length > 0, "robot sensors cannot be empty");
    const sensorIds = new Set();
    for (const sensor of configuredSensors) {
      assert(typeof sensor.id === "string" && sensor.id.length > 0, "sensor id is required");
      assert(!sensorIds.has(sensor.id), `duplicate sensor id "${sensor.id}"`);
      sensorIds.add(sensor.id);
      requireComponent("sensor", sensor.type, `robot.sensors[${sensor.id}]`);
    }

    assert(config.objects && Array.isArray(config.objects.instances), "objects.instances must be an array");
    assert(Array.isArray(config.objects.palette), "objects.palette must be an array");
    assert(
      config.objects.palette.length >= config.objects.instances.length,
      "objects.palette must contain at least one unique color per object"
    );
    const objectIds = new Set();
    for (const object of config.objects.instances) {
      assert(typeof object.id === "string" && object.id.length > 0, "object id is required");
      assert(!objectIds.has(object.id), `duplicate object id "${object.id}"`);
      objectIds.add(object.id);
      requireComponent("object", object.type, `objects.instances[${object.id}]`);
      assert(Number.isFinite(object.localX) && Number.isFinite(object.localY), `object "${object.id}" needs a finite attachment position`);
    }

    assert(config.controls && config.controls.linear && config.controls.turn, "motion controls are required");
    assert(config.programming && Array.isArray(config.programming.colorOrder), "programming.colorOrder is required");
    assert(Array.isArray(config.programming.dropTargets), "programming.dropTargets is required");
    const defaultLineSensorId = robot.body.type === "grid"
      ? robot.defaultDesign.primarySensorId
      : config.programming.lineSensorId;
    assert(sensorIds.has(defaultLineSensorId), "line sensor must reference a configured sensor");
    for (const id of config.programming.dropTargets) {
      assert(objectIds.has(String(id)), `drop target "${id}" does not reference an object`);
    }

    assert(config.storage && config.storage.programTabs, "storage keys are required");
    assert(config.translations && config.translations.ru && config.translations.en, "Russian and English translations are required");
  }

  function registerScenario(config) {
    validateScenario(config);
    assert(!scenarios.has(config.id), `scenario "${config.id}" is already registered`);
    const normalized = deepFreeze(config);
    scenarios.set(normalized.id, normalized);
    return normalized;
  }

  function getScenario(id) {
    const scenario = scenarios.get(id);
    if (!scenario) {
      throw new Error(`Unknown simulator scenario: ${id}`);
    }
    return scenario;
  }

  function listScenarios() {
    return Array.from(scenarios.values());
  }

registerComponentType("body", "rectangle", { description: "Rectangular rigid body" });
registerComponentType("body", "grid", { description: "Editable 8 mm cell grid body" });
registerComponentType("drive", "differential", { description: "Two-wheel differential drive" });
registerComponentType("sensor", "color", { description: "Image-backed RGB color sensor" });
registerComponentType("object", "numbered-artifact", { description: "Numbered carried object" });

export {
  getScenario,
  listScenarios,
  registerComponentType,
  registerScenario
};
