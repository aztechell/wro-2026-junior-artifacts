import { createRobotProfileStore } from "./adapters/robot-profiles.js";
import {
  createDefaultRobotDesign,
  materializeRobotDesign,
  tryNormalizeRobotDesign
} from "./core/robot-design.js";
import { getScenario } from "./core/registry.js";
import "./scenarios/wro-2026-junior.js";

const scenario = getScenario("wro-2026-junior");
const store = createRobotProfileStore(scenario, window.localStorage);
const grid = scenario.robot.editor.grid;
const canvas = document.querySelector("#robotGrid");
const ctx = canvas.getContext("2d");
const margin = 32;
const gridPixels = canvas.width - margin * 2;
const cellPixels = gridPixels / grid.columns;
const text = {
  ru: {
    title: "Редактор робота", back: "Вернуться в симулятор", useInSimulator: "Импортировать в симулятор", profiles: "Профили",
    profileName: "Название", duplicate: "Дублировать", delete: "Удалить",
    tools: "Инструменты", bodyTool: "Корпус", eraserTool: "Ластик",
    wheelTool: "Колесо", sensorTool: "Датчик",
    toolHint: "Корпус рисуется перетаскиванием. Колёса и датчики можно двигать; двойной клик удаляет любой элемент.",
    resetTemplate: "Вернуть шаблон", parameters: "Параметры", cells: "Клетки",
    dimensions: "Габариты", wheelTrack: "Колёсная база", sensors: "Датчики",
    sensorHeading: "Цветовые датчики", validation: "Проверка",
    valid: "Конструкция готова к импорту", saved: "Сохранено", remove: "Удалить",
    primary: "Основной", lastProfile: "Последний профиль удалить нельзя",
    removeWheel: "Сначала удалите одно из двух колёс", position: "Позиция"
  },
  en: {
    title: "Robot editor", back: "Back to simulator", useInSimulator: "Import into simulator", profiles: "Profiles",
    profileName: "Name", duplicate: "Duplicate", delete: "Delete",
    tools: "Tools", bodyTool: "Body", eraserTool: "Eraser",
    wheelTool: "Wheel", sensorTool: "Sensor",
    toolHint: "Drag to paint the body. Wheels and sensors are draggable; double-click removes any item.",
    resetTemplate: "Restore template", parameters: "Parameters", cells: "Cells",
    dimensions: "Dimensions", wheelTrack: "Wheel track", sensors: "Sensors",
    sensorHeading: "Color sensors", validation: "Validation",
    valid: "Design is ready to import", saved: "Saved", remove: "Remove",
    primary: "Primary", lastProfile: "The last profile cannot be deleted",
    removeWheel: "Remove one of the two wheels first", position: "Position"
  }
};

let language = localStorage.getItem(scenario.storage.language) || "ru";
let collection = store.load();
let selected = collection.profiles.find((profile) => profile.id === collection.selectedProfileId);
let tool = "body";
let drawing = false;
let draggedWheelId = null;
let draggedSensorId = null;
let sensorSequence = 1;
let transientMessage = "";

function t(key) {
  return text[language]?.[key] || text.ru[key] || key;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-text]").forEach((element) => {
    element.textContent = t(element.dataset.text);
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("active", button.dataset.language === language);
  });
  render();
}

function refreshCollection() {
  collection = store.load();
  selected = collection.profiles.find((profile) => profile.id === collection.selectedProfileId)
    || collection.profiles[0];
}

function saveDesign() {
  store.update(selected.id, { design: selected.design, name: selected.name });
  refreshCollection();
}

function setDesign(nextDesign) {
  selected.design = clone(nextDesign);
  saveDesign();
  render();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height
  };
}

function cellAt(point) {
  const column = Math.floor((point.x - margin) / cellPixels);
  const row = Math.floor((point.y - margin) / cellPixels);
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return null;
  return [column, row];
}

function nodeAt(point) {
  const nodeColumn = Math.round((point.x - margin) / cellPixels);
  const nodeRow = Math.round((point.y - margin) / cellPixels);
  if (nodeColumn < 0 || nodeColumn > grid.columns || nodeRow < 0 || nodeRow > grid.rows) return null;
  return { nodeColumn, nodeRow };
}

function localToCanvas(localX, localY) {
  return {
    x: margin + (localX / grid.cellSizeMm + grid.originNodeColumn) * cellPixels,
    y: margin + (localY / grid.cellSizeMm + grid.originNodeRow) * cellPixels
  };
}

function componentAt(point) {
  const scale = cellPixels / grid.cellSizeMm;
  const components = [
    ...selected.design.wheels.map((wheel) => ({
      kind: "wheel", item: wheel,
      x: margin + wheel.nodeColumn * cellPixels,
      y: margin + wheel.nodeRow * cellPixels,
      width: scenario.robot.drive.wheelWidthMm * scale,
      height: scenario.robot.drive.wheelDiameterMm * scale
    })),
    ...selected.design.sensors.map((sensor) => ({
      kind: "sensor", item: sensor,
      x: margin + sensor.nodeColumn * cellPixels,
      y: margin + sensor.nodeRow * cellPixels,
      width: 24 * scale,
      height: 24 * scale
    }))
  ];
  return components.reverse().find((component) => (
    Math.abs(point.x - component.x) <= component.width / 2
    && Math.abs(point.y - component.y) <= component.height / 2
  ));
}

function editAt(event) {
  const point = canvasPoint(event);
  const design = clone(selected.design);
  transientMessage = "";
  if (tool === "body") {
    const cell = cellAt(point);
    if (!cell || design.bodyCells.some(([column, row]) => column === cell[0] && row === cell[1])) return;
    design.bodyCells.push(cell);
  } else if (tool === "erase") {
    const component = componentAt(point);
    if (component?.kind === "wheel") {
      design.wheels = design.wheels.filter((wheel) => wheel.id !== component.item.id);
    } else if (component?.kind === "sensor") {
      design.sensors = design.sensors.filter((sensor) => sensor.id !== component.item.id);
      if (design.primarySensorId === component.item.id) design.primarySensorId = design.sensors[0]?.id || "";
    } else {
      const cell = cellAt(point);
      if (!cell) return;
      design.bodyCells = design.bodyCells.filter(([column, row]) => column !== cell[0] || row !== cell[1]);
    }
  } else if (tool === "wheel") {
    const node = nodeAt(point);
    if (!node) return;
    if (design.wheels.length >= 2) {
      transientMessage = t("removeWheel");
      render();
      return;
    }
    if (design.wheels.length === 1) {
      const existing = design.wheels[0];
      const missingId = existing.id === "left" ? "right" : "left";
      design.wheels.push({
        id: missingId,
        nodeColumn: grid.columns - existing.nodeColumn,
        nodeRow: existing.nodeRow
      });
    } else {
      const id = node.nodeColumn < grid.originNodeColumn ? "left" : "right";
      design.wheels.push({ id, ...node });
    }
  } else if (tool === "sensor") {
    const node = nodeAt(point);
    if (!node) return;
    let id;
    do {
      id = `color-${sensorSequence++}`;
    } while (design.sensors.some((sensor) => sensor.id === id));
    design.sensors.push({ id, type: "color", ...node });
    if (!design.primarySensorId) design.primarySensorId = id;
  }
  setDesign(design);
}

function moveWheelAt(event) {
  if (!draggedWheelId) return;
  const node = nodeAt(canvasPoint(event));
  if (!node) return;
  const design = clone(selected.design);
  const movingWheel = design.wheels.find((wheel) => wheel.id === draggedWheelId);
  if (!movingWheel) return;
  const nodeRow = Math.max(4, Math.min(28, node.nodeRow));
  const nodeColumn = movingWheel.id === "left"
    ? Math.max(2, Math.min(14, node.nodeColumn))
    : Math.max(18, Math.min(30, node.nodeColumn));
  movingWheel.nodeColumn = nodeColumn;
  for (const wheel of design.wheels) {
    wheel.nodeRow = nodeRow;
    if (wheel.id !== movingWheel.id) wheel.nodeColumn = grid.columns - nodeColumn;
  }
  setDesign(design);
}

function moveSensorAt(event) {
  if (!draggedSensorId) return;
  const node = nodeAt(canvasPoint(event));
  if (!node) return;
  const design = clone(selected.design);
  const sensor = design.sensors.find((item) => item.id === draggedSensorId);
  if (!sensor) return;
  sensor.nodeColumn = Math.max(2, Math.min(30, node.nodeColumn));
  sensor.nodeRow = Math.max(2, Math.min(30, node.nodeRow));
  setDesign(design);
}

function removeAt(event) {
  const point = canvasPoint(event);
  const design = clone(selected.design);
  const component = componentAt(point);
  if (component?.kind === "wheel") {
    design.wheels = design.wheels.filter((wheel) => wheel.id !== component.item.id);
  } else if (component?.kind === "sensor") {
    design.sensors = design.sensors.filter((sensor) => sensor.id !== component.item.id);
    if (design.primarySensorId === component.item.id) {
      design.primarySensorId = design.sensors[0]?.id || "";
    }
  } else {
    const cell = cellAt(point);
    if (!cell) return;
    design.bodyCells = design.bodyCells.filter(
      ([column, row]) => column !== cell[0] || row !== cell[1]
    );
  }
  draggedWheelId = null;
  draggedSensorId = null;
  drawing = false;
  setDesign(design);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8faf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4f8fe8";
  for (const [column, row] of selected.design.bodyCells) {
    ctx.fillRect(margin + column * cellPixels, margin + row * cellPixels, cellPixels, cellPixels);
  }
  ctx.strokeStyle = "#c9d3cc";
  ctx.lineWidth = 1;
  for (let index = 0; index <= grid.columns; index += 1) {
    const offset = margin + index * cellPixels;
    ctx.beginPath(); ctx.moveTo(offset, margin); ctx.lineTo(offset, margin + gridPixels); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin, offset); ctx.lineTo(margin + gridPixels, offset); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, .5)";
  ctx.lineWidth = 0.8;
  for (const [column, row] of selected.design.bodyCells) {
    ctx.strokeRect(
      margin + column * cellPixels,
      margin + row * cellPixels,
      cellPixels,
      cellPixels
    );
  }
  const origin = { x: margin + grid.originNodeColumn * cellPixels, y: margin + grid.originNodeRow * cellPixels };
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(37, 99, 235, .72)";
  ctx.beginPath(); ctx.moveTo(margin, origin.y); ctx.lineTo(margin + gridPixels, origin.y); ctx.stroke();
  ctx.strokeStyle = "rgba(22, 121, 75, .72)";
  ctx.beginPath(); ctx.moveTo(origin.x, margin); ctx.lineTo(origin.x, margin + gridPixels); ctx.stroke();
  ctx.restore();
  ctx.font = "bold 13px Arial";
  ctx.fillStyle = "#2563eb";
  ctx.fillText("+X", margin + gridPixels + 8, origin.y + 4);
  ctx.fillStyle = "#16794b";
  ctx.fillText("−Y", origin.x + 7, margin - 10);
  ctx.fillStyle = "#526159";
  ctx.fillText("0", origin.x + 7, origin.y + 15);

  const scale = cellPixels / grid.cellSizeMm;
  if (selected.design.wheels.length === 2) {
    const [leftWheel, rightWheel] = selected.design.wheels;
    const left = {
      x: margin + leftWheel.nodeColumn * cellPixels,
      y: margin + leftWheel.nodeRow * cellPixels
    };
    const right = {
      x: margin + rightWheel.nodeColumn * cellPixels,
      y: margin + rightWheel.nodeRow * cellPixels
    };
    ctx.save();
    ctx.setLineDash([10, 6]);
    ctx.strokeStyle = leftWheel.nodeRow === rightWheel.nodeRow ? "#f59e0b" : "#dc2626";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#17211b";
  for (const wheel of selected.design.wheels) {
    const position = localToCanvas(
      (wheel.nodeColumn - grid.originNodeColumn) * grid.cellSizeMm,
      (wheel.nodeRow - grid.originNodeRow) * grid.cellSizeMm
    );
    ctx.fillRect(
      position.x - scenario.robot.drive.wheelWidthMm * scale / 2,
      position.y - scenario.robot.drive.wheelDiameterMm * scale / 2,
      scenario.robot.drive.wheelWidthMm * scale,
      scenario.robot.drive.wheelDiameterMm * scale
    );
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(wheel.id === "left" ? "L" : "R", position.x, position.y);
    ctx.fillStyle = "#17211b";
  }
  for (const sensor of selected.design.sensors) {
    const position = {
      x: margin + sensor.nodeColumn * cellPixels,
      y: margin + sensor.nodeRow * cellPixels
    };
    ctx.fillStyle = sensor.id === selected.design.primarySensorId ? "#f59e0b" : "#fff";
    ctx.strokeStyle = "#17211b";
    ctx.lineWidth = 2;
    ctx.fillRect(position.x - 12 * scale, position.y - 12 * scale, 24 * scale, 24 * scale);
    ctx.strokeRect(position.x - 12 * scale, position.y - 12 * scale, 24 * scale, 24 * scale);
    ctx.fillStyle = "#17211b";
    ctx.beginPath(); ctx.arc(position.x, position.y, 5 * scale, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#dc2626"; ctx.fillStyle = "#dc2626"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(origin.x, origin.y - 42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(origin.x, origin.y - 48); ctx.lineTo(origin.x - 7, origin.y - 36);
  ctx.lineTo(origin.x + 7, origin.y - 36); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2); ctx.stroke();
}

function renderProfiles() {
  const list = document.querySelector("#profileList");
  list.replaceChildren(...collection.profiles.map((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-item${profile.id === selected.id ? " active" : ""}`;
    const status = tryNormalizeRobotDesign(scenario, profile.design).design ? "✓" : "!";
    button.innerHTML = `<span>${profile.name}</span><small>${status}</small>`;
    button.addEventListener("click", () => {
      store.select(profile.id);
      refreshCollection();
      render();
    });
    return button;
  }));
}

function renderSensors() {
  const list = document.querySelector("#sensorList");
  if (!selected.design.sensors.length) {
    list.innerHTML = `<p class="empty">—</p>`;
    return;
  }
  list.replaceChildren(...selected.design.sensors.map((sensor) => {
    const row = document.createElement("div");
    row.className = "sensor-row";
    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "primarySensor"; radio.checked = sensor.id === selected.design.primarySensorId;
    radio.title = t("primary");
    radio.addEventListener("change", () => setDesign({ ...selected.design, primarySensorId: sensor.id }));
    const label = document.createElement("span");
    label.textContent = `${sensor.id} · (${sensor.nodeColumn}, ${sensor.nodeRow})`;
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "×"; remove.title = t("remove");
    remove.addEventListener("click", () => {
      const design = clone(selected.design);
      design.sensors = design.sensors.filter((item) => item.id !== sensor.id);
      if (design.primarySensorId === sensor.id) design.primarySensorId = design.sensors[0]?.id || "";
      setDesign(design);
    });
    row.append(radio, label, remove);
    return row;
  }));
}

function render() {
  refreshCollection();
  draw();
  renderProfiles();
  renderSensors();
  document.querySelector("#profileName").value = selected.name;
  document.querySelector("#cellCount").textContent = selected.design.bodyCells.length;
  document.querySelector("#sensorCount").textContent = selected.design.sensors.length;
  const validation = tryNormalizeRobotDesign(scenario, selected.design);
  const validationState = document.querySelector("#validationState");
  validationState.className = `validation-state ${validation.design ? "valid" : "invalid"}`;
  validationState.textContent = transientMessage || (validation.design ? t("valid") : validation.error.message);
  if (validation.design) {
    const geometry = materializeRobotDesign(scenario, validation.design);
    document.querySelector("#dimensions").textContent = `${geometry.widthMm.toFixed(1)} × ${geometry.heightMm.toFixed(1)} mm`;
    document.querySelector("#wheelTrack").textContent = `${geometry.wheelTrackMm} mm`;
  } else {
    document.querySelector("#dimensions").textContent = "—";
    document.querySelector("#wheelTrack").textContent = "—";
  }
  document.querySelector("#deleteProfile").disabled = collection.profiles.length <= 1;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
}

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  if (tool === "wheel") {
    const component = componentAt(canvasPoint(event));
    if (component?.kind === "wheel") {
      draggedWheelId = component.item.id;
      return;
    }
  }
  if (tool === "sensor") {
    const component = componentAt(canvasPoint(event));
    if (component?.kind === "sensor") {
      draggedSensorId = component.item.id;
      return;
    }
  }
  editAt(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (drawing && draggedWheelId) moveWheelAt(event);
  else if (drawing && draggedSensorId) moveSensorAt(event);
  else if (drawing && (tool === "body" || tool === "erase")) editAt(event);
});
canvas.addEventListener("pointerup", () => {
  drawing = false;
  draggedWheelId = null;
  draggedSensorId = null;
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
  draggedWheelId = null;
  draggedSensorId = null;
});
canvas.addEventListener("dblclick", (event) => {
  event.preventDefault();
  removeAt(event);
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => { tool = button.dataset.tool; render(); });
});
document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    language = button.dataset.language;
    localStorage.setItem(scenario.storage.language, language);
    applyLanguage();
  });
});
document.querySelector("#profileName").addEventListener("input", (event) => {
  selected.name = event.target.value.trim() || "Robot";
  saveDesign(); render();
});
document.querySelector("#newProfile").addEventListener("click", () => { store.create(); refreshCollection(); render(); });
document.querySelector("#duplicateProfile").addEventListener("click", () => { store.duplicate(selected.id); refreshCollection(); render(); });
document.querySelector("#deleteProfile").addEventListener("click", () => {
  if (collection.profiles.length <= 1) { transientMessage = t("lastProfile"); render(); return; }
  store.remove(selected.id); refreshCollection(); render();
});
document.querySelector("#resetDesign").addEventListener("click", () => setDesign(createDefaultRobotDesign(scenario)));
document.querySelector("#useInSimulator").addEventListener("click", () => {
  const validation = tryNormalizeRobotDesign(scenario, selected.design);
  if (!validation.design) {
    transientMessage = validation.error.message;
    render();
    return;
  }
  store.importProfile(selected.id);
  window.location.href = "index.html";
});

applyLanguage();
