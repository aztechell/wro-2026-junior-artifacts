import { materializeNumberedObjectVisual } from "./object-geometry.js";

const ROBOT_DESIGN_SCHEMA_VERSION = 1;

class RobotDesignError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RobotDesignError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RobotDesignError(code, message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function gridSpec(scenario) {
  const spec = scenario.robot.editor?.grid;
  if (!spec) fail("editor-unavailable", "This scenario does not support robot editing");
  return spec;
}

function componentRectangle(scenario, component) {
  const spec = gridSpec(scenario);
  const x = (component.nodeColumn - spec.originNodeColumn) * spec.cellSizeMm;
  const y = (component.nodeRow - spec.originNodeRow) * spec.cellSizeMm;
  if (component.type === "wheel") {
    return {
      id: component.id,
      kind: "wheel",
      x,
      y,
      width: scenario.robot.drive.wheelWidthMm,
      height: scenario.robot.drive.wheelDiameterMm
    };
  }
  if (component.type === "attachment") {
    const visual = materializeNumberedObjectVisual(scenario.objects.visual);
    return {
      id: component.id,
      kind: "attachment",
      x,
      y,
      width: visual.widthMm,
      height: visual.heightMm
    };
  }
  const sensor = scenario.robot.editor.sensorTypes[component.type];
  if (!sensor) fail("sensor-type", `Unknown sensor type "${component.type}"`);
  return {
    id: component.id,
    kind: "sensor",
    x,
    y,
    width: sensor.widthMm,
    height: sensor.depthMm
  };
}

function rectanglesOverlap(first, second) {
  return (
    Math.abs(first.x - second.x) < (first.width + second.width) / 2
    && Math.abs(first.y - second.y) < (first.height + second.height) / 2
  );
}

function normalizeRobotDesign(scenario, source) {
  const spec = gridSpec(scenario);
  const design = clone(source);
  if (!design || design.schemaVersion !== ROBOT_DESIGN_SCHEMA_VERSION) {
    fail("schema-version", `Robot design schemaVersion must be ${ROBOT_DESIGN_SCHEMA_VERSION}`);
  }
  if (design.scenarioId !== scenario.id) {
    fail("scenario-id", `Robot design belongs to "${design.scenarioId || "unknown"}"`);
  }
  if (!Array.isArray(design.bodyCells) || design.bodyCells.length === 0) {
    fail("body-empty", "Robot body must contain at least one cell");
  }

  const seenCells = new Set();
  design.bodyCells = design.bodyCells.map((cell) => {
    if (!Array.isArray(cell) || cell.length !== 2) fail("cell-format", "Body cells must be [column, row] pairs");
    const [column, row] = cell.map(Number);
    if (!Number.isInteger(column) || !Number.isInteger(row)) fail("cell-format", "Body cell coordinates must be integers");
    if (column < 0 || column >= spec.columns || row < 0 || row >= spec.rows) {
      fail("cell-bounds", `Body cell [${column}, ${row}] is outside the grid`);
    }
    const key = `${column}:${row}`;
    if (seenCells.has(key)) fail("cell-duplicate", `Duplicate body cell [${column}, ${row}]`);
    seenCells.add(key);
    return [column, row];
  }).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  if (!Array.isArray(design.wheels) || design.wheels.length !== 2) {
    fail("wheel-count", "Robot must contain exactly two wheels");
  }
  const wheelIds = new Set();
  design.wheels = design.wheels.map((wheel) => {
    const normalized = {
      id: String(wheel.id || ""),
      nodeColumn: Number(wheel.nodeColumn),
      nodeRow: Number(wheel.nodeRow)
    };
    if (!normalized.id || wheelIds.has(normalized.id)) fail("wheel-id", "Wheel IDs must be unique");
    wheelIds.add(normalized.id);
    if (!Number.isInteger(normalized.nodeColumn) || !Number.isInteger(normalized.nodeRow)) {
      fail("wheel-position", "Wheel positions must use grid nodes");
    }
    return normalized;
  });
  design.wheels.sort((a, b) => a.nodeColumn - b.nodeColumn);
  design.wheels[0].id = "left";
  design.wheels[1].id = "right";
  if (design.wheels[0].nodeRow !== design.wheels[1].nodeRow) {
    fail("wheel-axis", "Wheels must be placed on one horizontal axis");
  }
  if (design.wheels[0].nodeColumn === design.wheels[1].nodeColumn) {
    fail("wheel-track", "Wheel track must be greater than zero");
  }
  if (design.wheels[0].nodeColumn + design.wheels[1].nodeColumn !== spec.originNodeColumn * 2) {
    fail("wheel-symmetry", "Wheels must be symmetric around the vertical axis");
  }

  if (!Array.isArray(design.sensors) || design.sensors.length === 0) {
    fail("sensor-count", "Robot must contain at least one color sensor");
  }
  const sensorIds = new Set();
  design.sensors = design.sensors.map((sensor) => {
    const normalized = {
      id: String(sensor.id || ""),
      type: String(sensor.type || ""),
      nodeColumn: Number(sensor.nodeColumn),
      nodeRow: Number(sensor.nodeRow)
    };
    if (!normalized.id || sensorIds.has(normalized.id)) fail("sensor-id", "Sensor IDs must be unique");
    sensorIds.add(normalized.id);
    if (!scenario.robot.editor.sensorTypes[normalized.type]) {
      fail("sensor-type", `Unknown sensor type "${normalized.type}"`);
    }
    if (!Number.isInteger(normalized.nodeColumn) || !Number.isInteger(normalized.nodeRow)) {
      fail("sensor-position", "Sensor positions must use grid nodes");
    }
    return normalized;
  });
  if (!sensorIds.has(design.primarySensorId)) {
    fail("primary-sensor", "Primary sensor must reference an existing sensor");
  }

  if (!Array.isArray(design.attachments)) {
    design.attachments = clone(scenario.robot.defaultDesign.attachments || []);
  }
  const expectedObjectIds = new Set(scenario.objects.instances.map((object) => String(object.id)));
  const attachmentIds = new Set();
  design.attachments = design.attachments.map((attachment) => {
    const normalized = {
      objectId: String(attachment.objectId || ""),
      nodeColumn: Number(attachment.nodeColumn),
      nodeRow: Number(attachment.nodeRow)
    };
    if (!expectedObjectIds.has(normalized.objectId)) {
      fail("attachment-id", `Attachment references unknown object "${normalized.objectId}"`);
    }
    if (attachmentIds.has(normalized.objectId)) {
      fail("attachment-duplicate", `Duplicate attachment for object "${normalized.objectId}"`);
    }
    attachmentIds.add(normalized.objectId);
    if (!Number.isInteger(normalized.nodeColumn) || !Number.isInteger(normalized.nodeRow)) {
      fail("attachment-position", "Attachment positions must use grid nodes");
    }
    const adjacentCells = [
      [normalized.nodeColumn - 1, normalized.nodeRow - 1],
      [normalized.nodeColumn, normalized.nodeRow - 1],
      [normalized.nodeColumn - 1, normalized.nodeRow],
      [normalized.nodeColumn, normalized.nodeRow]
    ];
    if (!adjacentCells.some(([column, row]) => seenCells.has(`${column}:${row}`))) {
      fail("attachment-support", `Object "${normalized.objectId}" must be attached above a body cell`);
    }
    return normalized;
  }).sort((a, b) => a.objectId.localeCompare(b.objectId));
  if (attachmentIds.size !== expectedObjectIds.size) {
    fail("attachment-count", "Every scenario object must have one attachment");
  }

  const components = [
    ...design.wheels.map((wheel) => ({ ...wheel, type: "wheel" })),
    ...design.sensors,
    ...design.attachments.map((attachment) => ({
      id: attachment.objectId,
      type: "attachment",
      nodeColumn: attachment.nodeColumn,
      nodeRow: attachment.nodeRow
    }))
  ].map((component) => componentRectangle(scenario, component));
  const halfWidth = spec.columns * spec.cellSizeMm / 2;
  const halfHeight = spec.rows * spec.cellSizeMm / 2;
  for (const component of components) {
    if (
      component.x - component.width / 2 < -halfWidth
      || component.x + component.width / 2 > halfWidth
      || component.y - component.height / 2 < -halfHeight
      || component.y + component.height / 2 > halfHeight
    ) {
      fail("component-bounds", `${component.kind} "${component.id}" extends outside the robot grid`);
    }
  }
  for (let first = 0; first < components.length; first += 1) {
    for (let second = first + 1; second < components.length; second += 1) {
      if (rectanglesOverlap(components[first], components[second])) {
        fail("component-overlap", `Components "${components[first].id}" and "${components[second].id}" overlap`);
      }
    }
  }
  return deepFreeze(design);
}

function tryNormalizeRobotDesign(scenario, source) {
  try {
    return { design: normalizeRobotDesign(scenario, source), error: null };
  } catch (error) {
    return { design: null, error };
  }
}

function createDefaultRobotDesign(scenario) {
  return normalizeRobotDesign(scenario, scenario.robot.defaultDesign);
}

function mergeBodyCells(scenario, design) {
  const spec = gridSpec(scenario);
  const rows = Array.from({ length: spec.rows }, () => []);
  for (const [column, row] of design.bodyCells) rows[row].push(column);
  const active = new Map();
  const rectangles = [];
  for (let row = 0; row <= spec.rows; row += 1) {
    const runs = [];
    const columns = row < spec.rows ? rows[row].sort((a, b) => a - b) : [];
    for (let index = 0; index < columns.length;) {
      const start = columns[index];
      let end = start;
      while (columns[index + 1] === end + 1) {
        index += 1;
        end = columns[index];
      }
      runs.push([start, end]);
      index += 1;
    }
    const currentKeys = new Set(runs.map(([start, end]) => `${start}:${end}`));
    for (const [key, rectangle] of active) {
      if (!currentKeys.has(key)) {
        rectangles.push(rectangle);
        active.delete(key);
      }
    }
    for (const [start, end] of runs) {
      const key = `${start}:${end}`;
      if (active.has(key)) active.get(key).endRow = row;
      else active.set(key, { startColumn: start, endColumn: end, startRow: row, endRow: row });
    }
  }
  return rectangles.map((rectangle) => {
    const width = (rectangle.endColumn - rectangle.startColumn + 1) * spec.cellSizeMm;
    const height = (rectangle.endRow - rectangle.startRow + 1) * spec.cellSizeMm;
    return {
      x: (rectangle.startColumn * spec.cellSizeMm + width / 2)
        - spec.originNodeColumn * spec.cellSizeMm,
      y: (rectangle.startRow * spec.cellSizeMm + height / 2)
        - spec.originNodeRow * spec.cellSizeMm,
      width,
      height
    };
  });
}

function materializeRobotDesign(scenario, source) {
  const design = normalizeRobotDesign(scenario, source);
  const spec = gridSpec(scenario);
  const wheels = design.wheels.map((wheel) => {
    const rectangle = componentRectangle(scenario, { ...wheel, type: "wheel" });
    return { ...wheel, localX: rectangle.x, localY: rectangle.y, widthMm: rectangle.width, heightMm: rectangle.height };
  });
  const sensors = design.sensors.map((sensor) => {
    const rectangle = componentRectangle(scenario, sensor);
    return {
      ...scenario.robot.editor.sensorTypes[sensor.type],
      ...sensor,
      localX: rectangle.x,
      localY: rectangle.y
    };
  });
  const attachments = design.attachments.map((attachment) => {
    const rectangle = componentRectangle(scenario, {
      id: attachment.objectId,
      type: "attachment",
      nodeColumn: attachment.nodeColumn,
      nodeRow: attachment.nodeRow
    });
    return {
      ...attachment,
      localX: rectangle.x,
      localY: rectangle.y,
      sizeMm: scenario.objects.visual.sizeMm,
      widthMm: rectangle.width,
      heightMm: rectangle.height
    };
  });
  const parts = [
    ...mergeBodyCells(scenario, design).map((part) => ({ ...part, kind: "body" })),
    ...wheels.map((wheel) => ({
      kind: "wheel", id: wheel.id, x: wheel.localX, y: wheel.localY,
      width: wheel.widthMm, height: wheel.heightMm
    })),
    ...sensors.map((sensor) => ({
      kind: "sensor", id: sensor.id, x: sensor.localX, y: sensor.localY,
      width: sensor.widthMm, height: sensor.depthMm
    }))
  ];
  const bounds = parts.reduce((result, part) => ({
    minX: Math.min(result.minX, part.x - part.width / 2),
    maxX: Math.max(result.maxX, part.x + part.width / 2),
    minY: Math.min(result.minY, part.y - part.height / 2),
    maxY: Math.max(result.maxY, part.y + part.height / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  return deepFreeze({
    design,
    grid: spec,
    bodyRectangles: mergeBodyCells(scenario, design),
    wheels,
    sensors,
    attachments,
    primarySensorId: design.primarySensorId,
    wheelTrackMm: Math.abs(wheels[1].localX - wheels[0].localX),
    axleLocalX: (wheels[0].localX + wheels[1].localX) / 2,
    axleLocalY: wheels[0].localY,
    bounds,
    widthMm: bounds.maxX - bounds.minX,
    heightMm: bounds.maxY - bounds.minY
  });
}

export {
  ROBOT_DESIGN_SCHEMA_VERSION,
  RobotDesignError,
  createDefaultRobotDesign,
  materializeRobotDesign,
  mergeBodyCells,
  normalizeRobotDesign,
  tryNormalizeRobotDesign
};
