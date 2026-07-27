import { createI18n } from "./adapters/i18n.js";
import { createScenarioStorage } from "./adapters/storage.js";
import {
  acceleratedStep,
  clamp,
  localToWorld as transformLocalToWorld,
  normalizeAngle,
  rampToward
} from "./core/math.js";
import { createSimulationModel, resetObjectState } from "./core/model.js";
import { materializeNumberedObjectVisual } from "./core/object-geometry.js";
import { getScenario } from "./core/registry.js";
import { materializeRobotDesign } from "./core/robot-design.js";
import { createInterpreter } from "./programming.js";

    export function createSimulator(options = {}) {
    if (!options.scenarioId) {
      throw new Error("createSimulator requires a scenarioId");
    }
    const scenario = getScenario(options.scenarioId);
    const robotGeometry = scenario.robot.body.type === "grid"
      ? materializeRobotDesign(scenario, options.robotDesign || scenario.robot.defaultDesign)
      : Object.freeze({
        design: null,
        bodyRectangles: [{
          x: 0,
          y: 0,
          width: scenario.robot.body.widthMm,
          height: scenario.robot.body.heightMm
        }],
        wheels: [
          {
            id: "left",
            localX: -scenario.robot.drive.wheelTrackMm / 2,
            localY: 0,
            widthMm: scenario.robot.drive.wheelWidthMm,
            heightMm: scenario.robot.drive.wheelDiameterMm
          },
          {
            id: "right",
            localX: scenario.robot.drive.wheelTrackMm / 2,
            localY: 0,
            widthMm: scenario.robot.drive.wheelWidthMm,
            heightMm: scenario.robot.drive.wheelDiameterMm
          }
        ],
        sensors: scenario.robot.sensors,
        attachments: scenario.objects.instances.map((object) => ({
          objectId: object.id,
          localX: object.localX,
          localY: object.localY
        })),
        primarySensorId: scenario.programming.lineSensorId,
        wheelTrackMm: scenario.robot.drive.wheelTrackMm,
        axleLocalX: 0,
        axleLocalY: 0,
        widthMm: scenario.robot.body.widthMm,
        heightMm: scenario.robot.body.heightMm
      });
    const robotDefinition = { ...scenario.robot, sensors: robotGeometry.sensors };
    const host = options.root || globalThis.document;
    const document = host.ownerDocument || host;
    const window = document.defaultView || globalThis;
    const Matter = options.matter || globalThis.Matter;
    const Image = window.Image;
    const performance = window.performance;
    const localStorage = options.storage || window.localStorage;
    const requestAnimationFrame = window.requestAnimationFrame.bind(window);
    const queryOne = (selector) => host.querySelector(selector);
    const queryAll = (selector) => host.querySelectorAll(selector);
    const WORLD_WIDTH_MM = scenario.world.widthMm;
    const WORLD_HEIGHT_MM = scenario.world.heightMm;
    const START_X_MM = scenario.robot.startPose.xMm;
    const START_Y_MM = scenario.robot.startPose.yMm;
    const DEFAULT_START_POINT = Object.freeze({
      xMm: START_X_MM,
      yMm: START_Y_MM,
      headingDeg: scenario.robot.startPose.headingDeg
    });
    const ROBOT_WIDTH_MM = robotGeometry.widthMm;
    const ROBOT_HEIGHT_MM = robotGeometry.heightMm;
    const WHEEL_TRACK_MM = robotGeometry.wheelTrackMm;
    const HALF_WHEEL_TRACK_MM = WHEEL_TRACK_MM / 2;
    const WHEEL_DIAMETER_MM = scenario.robot.drive.wheelDiameterMm;
    const WHEEL_WIDTH_MM = scenario.robot.drive.wheelWidthMm;
    const artifactVisual = materializeNumberedObjectVisual(scenario.objects.visual);
    const ARTIFACT_SIZE_MM = artifactVisual.bodySizeMm;
    const driveWheels = robotGeometry.wheels;
    const colorSensors = robotGeometry.sensors.filter((sensor) => sensor.type === "color");
    const robotBodyCellSet = new Set(
      (robotGeometry.design?.bodyCells || []).map(([column, row]) => `${column}:${row}`)
    );
    const primaryColorSensor = colorSensors.find(
      (sensor) => sensor.id === robotGeometry.primarySensorId
    ) || colorSensors[0];
    const BACKGROUND_SRC = scenario.world.backgroundSrc;
    const SENSOR_MAP_SRC = scenario.world.sensorMapSrc || BACKGROUND_SRC;
    const safetyBoundary = scenario.world.boundaries.find(
      (boundary) => Number.isFinite(boundary.safetyLimitMm)
    );
    const PHYSICS = Object.freeze({
      stepMs: scenario.physics.stepMs,
      topSafetyLimitMm: safetyBoundary.safetyLimitMm,
      robotDensity: scenario.robot.physics.density,
      robotFriction: scenario.robot.physics.friction,
      robotStaticFriction: scenario.robot.physics.staticFriction,
      wheelLateralGrip: scenario.robot.drive.lateralGrip,
      artefactDensity: scenario.objects.physics.density,
      artefactFriction: scenario.objects.physics.friction,
      artefactStaticFriction: scenario.objects.physics.staticFriction,
      artefactAirFriction: scenario.objects.physics.airFriction,
      artefactGroundDecelerationMmS2: scenario.objects.physics.groundDecelerationMmS2,
      artefactStaticSpeedMmS: scenario.objects.physics.staticSpeedMmS,
      artefactAngularDamping: scenario.objects.physics.angularDamping
    });
    const BUILT_IN_PROGRAMS = scenario.programming.builtInPrograms;
    const i18n = createI18n(scenario.translations);
    const scenarioStorage = createScenarioStorage(scenario, localStorage);

    function configureScenarioUi() {
      const title = queryOne(".left-panel .panel h1");
      if (title) title.textContent = scenario.meta.shortTitle;

      const metaValues = queryAll(".left-panel > .panel:first-child .value");
      if (metaValues[0]) {
        metaValues[0].textContent = `${WORLD_WIDTH_MM} x ${WORLD_HEIGHT_MM} mm`;
      }
      if (metaValues[1]) {
        metaValues[1].textContent = `${ROBOT_WIDTH_MM} x ${ROBOT_HEIGHT_MM} mm`;
      }

      const canvasElement = queryOne("#field");
      canvasElement.width = WORLD_WIDTH_MM;
      canvasElement.height = WORLD_HEIGHT_MM;

      const dropGrid = queryOne(".drop-grid");
      dropGrid.replaceChildren(...scenario.programming.dropTargets.map((id) => {
        const button = document.createElement("button");
        button.className = "drop-button";
        button.type = "button";
        button.dataset.dropId = id;
        button.textContent = id;
        return button;
      }));

      const colorGrid = queryOne(".color-select-grid");
      colorGrid.replaceChildren(...scenario.objects.instances.map((object) => {
        const label = document.createElement("label");
        label.className = "color-select";
        const text = document.createElement("span");
        text.dataset.i18n = object.labelKey || `ui.cube${object.id}`;
        text.textContent = `Cube ${object.id}`;
        const select = document.createElement("select");
        select.dataset.colorSelect = object.id;
        label.append(text, select);
        return label;
      }));

      const sensorTemplate = queryOne(".sensor-panel");
      const positionPanel = queryOne(".position-panel");
      colorSensors.forEach((sensor, index) => {
        const panel = index === 0 ? sensorTemplate : sensorTemplate.cloneNode(true);
        panel.dataset.sensorId = sensor.id;
        const panelTitle = panel.querySelector(".panel-title");
        panelTitle.dataset.i18n = sensor.labelKey;
        const swatch = panel.querySelector(".sensor-swatch");
        const colorValue = panel.querySelector(".sensor-color-value span:last-child");
        const reflectionValue = panel.querySelector(".row:last-child .value");
        swatch.dataset.sensorSwatch = "";
        colorValue.dataset.sensorColorValue = "";
        reflectionValue.dataset.sensorReflectionValue = "";
        if (index > 0) {
          swatch.removeAttribute("id");
          colorValue.removeAttribute("id");
          reflectionValue.removeAttribute("id");
          positionPanel.before(panel);
        }
      });

      const inputConfigs = [
        ["#speedInput", scenario.controls.linear.speed],
        ["#accelInput", scenario.controls.linear.acceleration],
        ["#turnSpeedInput", scenario.controls.turn.speed],
        ["#turnAccelInput", scenario.controls.turn.acceleration]
      ];
      for (const [selector, config] of inputConfigs) {
        const input = queryOne(selector);
        for (const key of ["min", "max", "step", "value"]) {
          input[key] = config[key];
        }
      }
    }

    configureScenarioUi();

    const canvas = queryOne("#field");
    const ctx = canvas.getContext("2d");
    const xValue = queryOne("#xValue");
    const yValue = queryOne("#yValue");
    const headingValue = queryOne("#headingValue");
    const sensorElements = new Map(
      Array.from(queryAll("[data-sensor-id]")).map((panel) => [
        panel.dataset.sensorId,
        {
          swatch: panel.querySelector("[data-sensor-swatch]"),
          color: panel.querySelector("[data-sensor-color-value]"),
          reflection: panel.querySelector("[data-sensor-reflection-value]")
        }
      ])
    );
    const resetButton = queryOne("#resetButton");
    const dropButtons = Array.from(queryAll("[data-drop-id]"));
    const manualColorsToggle = queryOne("#manualColorsToggle");
    const colorSelects = Array.from(queryAll("[data-color-select]"));
    const trailToggle = queryOne("#trailToggle");
    const keyboardToggle = queryOne("#keyboardToggle");
    const speedInput = queryOne("#speedInput");
    const speedValue = queryOne("#speedValue");
    const accelInput = queryOne("#accelInput");
    const accelValue = queryOne("#accelValue");
    const turnSpeedInput = queryOne("#turnSpeedInput");
    const turnSpeedValue = queryOne("#turnSpeedValue");
    const turnAccelInput = queryOne("#turnAccelInput");
    const turnAccelValue = queryOne("#turnAccelValue");
    const assetError = queryOne("#assetError");
    const programInput = queryOne("#programInput");
    const programTabs = queryOne("#programTabs");
    const newProgramButton = queryOne("#newProgramButton");
    const runProgramButton = queryOne("#runProgramButton");
    const resetProgramButton = queryOne("#resetProgramButton");
    const programStatus = queryOne("#programStatus");
    const languageButtons = Array.from(queryAll("[data-language]"));
    const objectDefinitions = scenario.objects.instances.map((object) => {
      const attachment = robotGeometry.attachments.find(
        (candidate) => candidate.objectId === String(object.id)
      );
      return {
        ...object,
        localX: attachment.localX,
        localY: attachment.localY
      };
    });
    const model = createSimulationModel(scenario, robotDefinition, objectDefinitions);

    const background = new Image();
    background.src = BACKGROUND_SRC;
    const sensorBackground = new Image();
    const sensorFieldCanvas = document.createElement("canvas");
    sensorFieldCanvas.width = WORLD_WIDTH_MM;
    sensorFieldCanvas.height = WORLD_HEIGHT_MM;
    const sensorFieldContext = sensorFieldCanvas.getContext("2d", { willReadFrequently: true });
    let sensorFieldReady = false;
    const colorSensorReadings = model.sensors;
    const colorSensorReading = colorSensorReadings.get(primaryColorSensor.id);
    const { Body, Bodies, Collision, Composite, Engine } = Matter;
    const physics = {
      engine: Engine.create({ gravity: { x: 0, y: 0 } }),
      robotBody: null,
      robotOriginOffset: { x: 0, y: 0 },
      boundaries: [],
      accumulatorMs: 0,
      drive: {
        linearMmS: 0,
        angularRadS: 0
      }
    };
    physics.engine.positionIterations = scenario.physics.positionIterations;
    physics.engine.velocityIterations = scenario.physics.velocityIterations;
    physics.engine.constraintIterations = scenario.physics.constraintIterations;

    const artefactColors = scenario.objects.palette;
    const colorMapOrder = scenario.programming.colorOrder;
    const colorMapLinePattern = new RegExp(
      `^\\[\\s*${colorMapOrder[0].codeName}\\s*:`,
      "i"
    );
    const colorMapHeaderPattern = /^colors\s*=\s*$/i;
    const readColorsLinePattern = /^readColors\s*\(\s*\)\s*$/i;
    const startPointLinePattern = /^startPoint\s*\(/i;
    const artefacts = model.objects;
    const keys = model.keys;
    const trail = model.trail;
    const robot = model.robot;

    let forwardSpeedMmS = Number(speedInput.value);
    let accelerationMmS2 = Number(accelInput.value);
    let turnSpeedRadS = Number(turnSpeedInput.value) * Math.PI / 180;
    let turnAccelerationRadS2 = Number(turnAccelInput.value) * Math.PI / 180;
    let manualLinearSpeedMmS = 0;
    let manualTurnSpeedRadS = 0;
    const reverseScale = scenario.robot.drive.reverseScale;
    let lastTime = performance.now();
    const programState = model.program;
    let programs = [];
    let activeProgramId = null;
    let programStatusState = { key: "status.ready", values: {}, mode: "" };

    function t(key, values = {}) {
      return i18n.translate(key, values);
    }

    function localizedError(key, values = {}) {
      const error = new Error(t(key, values));
      error.i18nKey = key;
      error.i18nValues = values;
      return error;
    }

    function renderProgramStatus() {
      programStatus.textContent = t(programStatusState.key, programStatusState.values);
      programStatus.className = "program-status";
      if (programStatusState.mode) {
        programStatus.classList.add(`is-${programStatusState.mode}`);
      }
    }

    function applyLanguage() {
      document.documentElement.lang = i18n.language;
      document.title = t("meta.title");
      for (const element of queryAll("[data-i18n]")) {
        element.textContent = t(element.dataset.i18n);
      }
      for (const element of queryAll("[data-i18n-aria-label]")) {
        element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
      }
      for (const element of queryAll("[data-i18n-title]")) {
        element.title = t(element.dataset.i18nTitle);
      }
      for (const summary of queryAll(".pseudocode-help summary")) {
        summary.title = t("help.summary");
      }
      for (const button of languageButtons) {
        const isActive = button.dataset.language === i18n.language;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
        button.setAttribute("aria-label", t(button.dataset.language === "ru" ? "ui.russian" : "ui.english"));
      }
      updateColorSelectLabels();
      updateColorSensorReading(true);
      setProgramRunning(programState.running);
      renderProgramStatus();
    }

    function setLanguage(language) {
      i18n.setLanguage(language === "en" ? "en" : "ru");
      try {
        scenarioStorage.set("language", i18n.language);
      } catch (error) {
        // Language selection remains usable when storage is unavailable.
      }
      applyLanguage();
    }

    function loadLanguage() {
      try {
        const savedLanguage = scenarioStorage.get("language");
        i18n.setLanguage(savedLanguage === "en" ? "en" : "ru");
      } catch (error) {
        i18n.setLanguage("ru");
      }
    }

    function resetManualMotion() {
      manualLinearSpeedMmS = 0;
      manualTurnSpeedRadS = 0;
    }

    function createProgramId() {
      return `program-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function activeProgram() {
      return programs.find((program) => program.id === activeProgramId) || null;
    }

    function addBuiltInPrograms() {
      for (const builtIn of BUILT_IN_PROGRAMS) {
        const existing = programs.find((program) => program.id === builtIn.id);
        if (existing?.readonly) {
          Object.assign(existing, builtIn);
        } else if (!existing) {
          programs.push({ ...builtIn });
        }
      }
    }

    function programSelectionLocked() {
      return programState.running || programState.paused;
    }

    function renderProgramTabs() {
      programTabs.innerHTML = "";
      const locked = programSelectionLocked();
      const current = activeProgram();
      programInput.readOnly = Boolean(current?.readonly);
      programInput.setAttribute("aria-readonly", String(Boolean(current?.readonly)));

      programs.forEach((program, index) => {
        const isActive = program.id === activeProgramId;
        const editableNumber = programs
          .slice(0, index)
          .filter((item) => !item.readonly).length + 1;
        const item = document.createElement("div");
        item.className = "program-tab-item";
        item.classList.toggle("is-active", isActive);
        item.classList.toggle("is-readonly", Boolean(program.readonly));

        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "program-tab";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(isActive));
        tab.textContent = program.labelKey
          ? t(program.labelKey)
          : t("tabs.program", { number: editableNumber });
        if (program.readonly) {
          tab.title = t("tabs.readOnlySolution");
          tab.setAttribute("aria-label", `${tab.textContent}: ${t("tabs.readOnlySolution")}`);
        }
        tab.disabled = locked;
        tab.addEventListener("click", () => selectProgram(program.id));
        item.append(tab);

        if (!program.readonly) {
          const close = document.createElement("button");
          close.type = "button";
          close.className = "program-tab-close";
          close.textContent = "×";
          close.disabled = locked;
          close.setAttribute("aria-label", t("tabs.closeProgram", { number: editableNumber }));
          close.title = t("tabs.closeProgram", { number: editableNumber });
          close.addEventListener("click", () => closeProgram(program.id));
          item.append(close);
        }

        programTabs.append(item);
      });

      newProgramButton.disabled = locked;
      newProgramButton.title = t("tabs.newProgram");
    }

    function loadSavedProgram() {
      try {
        const savedTabs = scenarioStorage.get("programTabs");
        let storedActiveProgramId = null;
        let hasTabStore = false;

        if (savedTabs !== null) {
          const stored = JSON.parse(savedTabs);
          if (Array.isArray(stored.programs)) {
            hasTabStore = true;
            programs = stored.programs
              .filter((program) => typeof program?.code === "string"
                && !BUILT_IN_PROGRAMS.some((builtIn) => builtIn.id === program.id))
              .map((program) => ({
                id: typeof program.id === "string" ? program.id : createProgramId(),
                code: program.code
              }));
            storedActiveProgramId = stored.activeProgramId;
          }
        }

        if (!hasTabStore) {
          const legacyProgram = scenarioStorage.get("legacyProgram");
          programs = [{
            id: createProgramId(),
            code: legacyProgram ?? programInput.value
          }];
        }

        addBuiltInPrograms();
        activeProgramId = programs.some((program) => program.id === storedActiveProgramId)
          ? storedActiveProgramId
          : programs.find((program) => !program.readonly)?.id || programs[0]?.id || null;
        programInput.value = activeProgram()?.code || "";
        saveProgram();
        renderProgramTabs();
      } catch (error) {
        setProgramStatus("status.codeAutosaveUnavailable", "error");
      }
    }

    function saveProgram() {
      const current = activeProgram();
      if (current && !current.readonly) {
        current.code = programInput.value;
      }

      try {
        scenarioStorage.set("programTabs", JSON.stringify({
          activeProgramId,
          programs: programs
            .filter((program) => !program.readonly)
            .map(({ id, code }) => ({ id, code }))
        }));
      } catch (error) {
        setProgramStatus("status.codeAutosaveUnavailable", "error");
      }
    }

    function selectProgram(id) {
      if (programSelectionLocked() || id === activeProgramId) return;

      saveProgram();
      const selected = programs.find((program) => program.id === id);
      if (!selected) return;

      activeProgramId = id;
      programInput.value = selected.code;
      saveProgram();
      renderProgramTabs();
      resetFromProgram();
    }

    function createProgram() {
      if (programSelectionLocked()) return;

      saveProgram();
      const program = {
        id: createProgramId(),
        code: normalizeProgramPrologue("")
      };
      programs.push(program);
      activeProgramId = program.id;
      programInput.value = program.code;
      saveProgram();
      renderProgramTabs();
      resetFromProgram();
    }

    function closeProgram(id) {
      if (programSelectionLocked()) return;

      const closingIndex = programs.findIndex((program) => program.id === id);
      if (closingIndex < 0 || programs[closingIndex].readonly) return;

      saveProgram();
      programs = programs.filter((program) => program.id !== id);

      if (activeProgramId === id) {
        const nextProgram = programs[Math.min(closingIndex, programs.length - 1)];
        activeProgramId = nextProgram.id;
        programInput.value = nextProgram.code;
        resetFromProgram();
      }

      saveProgram();
      renderProgramTabs();
    }

    function colorDefinitionByName(name) {
      return artefactColors.find((color) => color.name === name) || artefactColors[0];
    }

    function setArtefactColor(artefact, colorName) {
      const definition = colorDefinitionByName(colorName);
      artefact.name = definition.name;
      artefact.color = definition.color;
      artefact.textColor = definition.textColor;
    }

    function setupColorSelects() {
      const options = colorMapOrder.map((color) => {
        const option = document.createElement("option");
        option.value = color.name;
        option.textContent = t(color.labelKey);
        return option;
      });

      for (const select of colorSelects) {
        for (const option of options) {
          select.append(option.cloneNode(true));
        }
      }
    }

    function updateColorSelectLabels() {
      for (const select of colorSelects) {
        for (let index = 0; index < select.options.length; index += 1) {
          const color = colorMapOrder[index];
          if (color) {
            select.options[index].textContent = t(color.labelKey);
          }
        }
      }
    }

    function updateColorOptionAvailability() {
      const selected = colorSelects.map((select) => select.value);
      for (const select of colorSelects) {
        for (const option of select.options) {
          option.disabled = option.value !== select.value && selected.includes(option.value);
        }
        select.disabled = !manualColorsToggle.checked;
      }
    }

    function normalizeColorSelects() {
      const available = colorMapOrder.map((color) => color.name);
      const used = new Set();

      for (const select of colorSelects) {
        if (!available.includes(select.value) || used.has(select.value)) {
          select.value = available.find((name) => !used.has(name)) || available[0];
        }
        used.add(select.value);
      }

      updateColorOptionAvailability();
    }

    function syncColorSelectsFromArtefacts() {
      for (const select of colorSelects) {
        const artefact = artefacts.find((item) => item.id === select.dataset.colorSelect);
        if (artefact && artefact.name) {
          select.value = artefact.name;
        }
      }
      normalizeColorSelects();
    }

    function applyManualArtefactColors() {
      normalizeColorSelects();
      for (const select of colorSelects) {
        const artefact = artefacts.find((item) => item.id === select.dataset.colorSelect);
        if (artefact) {
          setArtefactColor(artefact, select.value);
        }
      }
    }

    function saveColorSettings() {
      try {
        scenarioStorage.set("colorSettings", JSON.stringify({
          manual: manualColorsToggle.checked,
          colors: colorSelects.map((select) => select.value)
        }));
      } catch (error) {
        setProgramStatus("status.colorSettingsAutosaveUnavailable", "error");
      }
    }

    function loadColorSettings() {
      try {
        const saved = scenarioStorage.get("colorSettings");
        if (!saved) return;

        const settings = JSON.parse(saved);
        manualColorsToggle.checked = Boolean(settings.manual);
        if (Array.isArray(settings.colors)) {
          for (let i = 0; i < colorSelects.length; i += 1) {
            if (settings.colors[i]) {
              colorSelects[i].value = settings.colors[i];
            }
          }
        }
        normalizeColorSelects();
      } catch (error) {
        setProgramStatus("status.colorSettingsAutosaveUnavailable", "error");
      }
    }

    function refreshColorsAfterManualChange() {
      applyManualArtefactColors();
      updateProgramColorMapBlock();
      updateDropButtons();
      saveColorSettings();
      draw();
    }

    function updateColorMode() {
      if (manualColorsToggle.checked) {
        applyManualArtefactColors();
      } else {
        randomizeArtefactColors();
        syncColorSelectsFromArtefacts();
      }

      updateProgramColorMapBlock();
      updateDropButtons();
      saveColorSettings();
      draw();
    }

    function randomizeArtefactColors() {
      const shuffled = [...artefactColors];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      for (let i = 0; i < artefacts.length; i += 1) {
        setArtefactColor(artefacts[i], shuffled[i].name);
      }
    }

    function stripLineComment(line) {
      return line.replace(/\/\/.*$/, "");
    }

    function isColorMapLine(line) {
      return colorMapLinePattern.test(stripLineComment(line).trim());
    }

    function buildColorValues() {
      const artefactIdByColor = new Map(
        artefacts
          .filter((artefact) => artefact.name)
          .map((artefact) => [artefact.name, artefact.id])
      );

      return new Map(colorMapOrder.map((color) => [
        color.name,
        artefactIdByColor.get(color.name) || "None"
      ]));
    }

    function buildColorMapBlock(colorValues = null) {
      const lines = colorMapOrder.map((color, index) => {
        const value = colorValues?.get(color.name) || "None";
        const prefix = index === 0 ? "[" : "";
        const suffix = index === colorMapOrder.length - 1 ? "]" : ",";
        return `${prefix}${color.codeName}: ${value}${suffix}`;
      });

      return ["colors =", ...lines].join("\n");
    }

    function findColorMapBlockEnd(lines, startIndex) {
      if (!colorMapHeaderPattern.test(stripLineComment(lines[startIndex] || "").trim())) {
        return -1;
      }

      for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (/\]\s*$/.test(stripLineComment(lines[index]))) {
          return index;
        }
      }

      return -1;
    }

    function normalizeProgramPrologue(source, colorValues = null) {
      const lines = source.split(/\r?\n/);
      const body = [];
      let startPointLine = null;

      for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index];
        const trimmed = stripLineComment(raw).trim();
        const mapEnd = findColorMapBlockEnd(lines, index);

        if (mapEnd >= index) {
          index = mapEnd;
          continue;
        }

        if (isColorMapLine(trimmed) || readColorsLinePattern.test(trimmed)) {
          continue;
        }

        if (startPointLinePattern.test(trimmed) && startPointLine === null) {
          startPointLine = raw.trim();
          continue;
        }

        body.push(raw);
      }

      const cleanBody = body.join("\n").replace(/^(?:\s*\n)+/, "").trimEnd();
      const startPoint = startPointLine || `startPoint(${DEFAULT_START_POINT.xMm}, ${DEFAULT_START_POINT.yMm}, ${DEFAULT_START_POINT.headingDeg})`;
      const sections = [
        startPoint,
        buildColorMapBlock(colorValues),
        "readColors()"
      ];

      if (cleanBody) {
        sections.push(cleanBody);
      }

      return sections.join("\n\n");
    }

    function updateProgramColorMapBlock(revealColors = false) {
      if (activeProgram()?.readonly) {
        return programInput.value;
      }

      const source = normalizeProgramPrologue(
        programInput.value,
        revealColors ? buildColorValues() : null
      );

      programInput.value = source;
      saveProgram();
      return source;
    }

    function parseStartPoint(source) {
      const line = source
        .split(/\r?\n/)
        .map((entry) => stripLineComment(entry).trim())
        .find((entry) => entry.length > 0) || "";
      return parseStartPointCommand(line, 1);
    }

    function ensureProgramPrologue() {
      return updateProgramColorMapBlock(false);
    }

    function resetRobot({ stopProgram = true, randomizeColors = true, startPoint = null } = {}) {
      if (stopProgram) {
        clearProgramExecution("status.ready");
      }
      keys.clear();
      resetManualMotion();
      const configuredStartPoint = startPoint || parseStartPoint(ensureProgramPrologue());
      robot.xMm = configuredStartPoint.xMm;
      robot.yMm = configuredStartPoint.yMm;
      robot.headingRad = configuredStartPoint.headingDeg * Math.PI / 180;
      trail.length = 0;
      if (manualColorsToggle.checked) {
        applyManualArtefactColors();
      } else if (randomizeColors) {
        randomizeArtefactColors();
      }
      syncColorSelectsFromArtefacts();
      updateProgramColorMapBlock();
      for (const artefact of artefacts) {
        resetObjectState(artefact);
      }
      resetPhysicsWorld();
      addTrailPoint();
      updateDropButtons();
      updateStatus();
    }

    function localToWorld(localX, localY) {
      return transformLocalToWorld(robot, localX, localY);
    }

    function colorSensorWorldPosition(sensor = primaryColorSensor) {
      return localToWorld(sensor.localX, sensor.localY);
    }

    function cacheSensorFieldImage() {
      if (!sensorFieldContext || !sensorBackground.naturalWidth) {
        sensorFieldReady = false;
        return;
      }

      sensorFieldContext.clearRect(0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);
      sensorFieldContext.drawImage(sensorBackground, 0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);
      sensorFieldReady = true;
    }

    function classifySensorColor(red, green, blue, sensor = primaryColorSensor) {
      let closest = sensor.palette[0];
      let closestDistance = Infinity;

      for (const candidate of sensor.palette) {
        const distance = (
          (red - candidate.red) ** 2
          + (green - candidate.green) ** 2
          + (blue - candidate.blue) ** 2
        );
        if (distance < closestDistance) {
          closest = candidate;
          closestDistance = distance;
        }
      }

      return closest;
    }

    function readColorSensor(sensor = primaryColorSensor) {
      if (!sensorFieldReady || !sensorFieldContext) {
        return { color: "unknown", brightness: null, swatch: "#98a2b3" };
      }

      try {
        const position = colorSensorWorldPosition(sensor);
        const x = clamp(Math.round(position.xMm), 0, WORLD_WIDTH_MM - 1);
        const y = clamp(Math.round(position.yMm), 0, WORLD_HEIGHT_MM - 1);
        const [red, green, blue] = sensorFieldContext.getImageData(x, y, 1, 1).data;
        const match = classifySensorColor(red, green, blue, sensor);
        const brightness = Math.round((
          0.2126 * red + 0.7152 * green + 0.0722 * blue
        ) / 255 * 100);

        return { color: match.name, brightness, swatch: match.swatch };
      } catch (error) {
        sensorFieldReady = false;
        return { color: "unknown", brightness: null, swatch: "#98a2b3" };
      }
    }

    function updateColorSensorReading(force = false) {
      for (const sensor of colorSensors) {
        const reading = colorSensorReadings.get(sensor.id);
        const next = readColorSensor(sensor);
        const changed = (
          force
          || next.color !== reading.color
          || next.brightness !== reading.brightness
          || next.swatch !== reading.swatch
        );
        if (!changed) continue;

        Object.assign(reading, next);
        const elements = sensorElements.get(sensor.id);
        elements.swatch.style.backgroundColor = next.swatch;
        elements.swatch.style.borderColor = next.color === "white" ? "#98a2b3" : next.swatch;
        elements.color.textContent = t(`sensor.${next.color}`);
        elements.reflection.textContent = next.brightness === null ? "-" : `${next.brightness}%`;
      }
    }

    function stopRobotDrive() {
      physics.drive.linearMmS = 0;
      physics.drive.angularRadS = 0;
      if (physics.robotBody) {
        Body.setVelocity(physics.robotBody, { x: 0, y: 0 });
        Body.setAngularVelocity(physics.robotBody, 0);
      }
    }

    function setRobotDrive(linearMmS, angularRadS) {
      physics.drive.linearMmS = linearMmS;
      physics.drive.angularRadS = angularRadS;
    }

    function setPhysicsBodyFromRobotPose() {
      if (!physics.robotBody) return;
      const cos = Math.cos(robot.headingRad);
      const sin = Math.sin(robot.headingRad);
      const offset = physics.robotOriginOffset;
      Body.setAngle(physics.robotBody, robot.headingRad);
      Body.setPosition(physics.robotBody, {
        x: robot.xMm + offset.x * cos - offset.y * sin,
        y: robot.yMm + offset.x * sin + offset.y * cos
      });
    }

    function rotateRobotAround(angleRad, pivotLocalX, pivotLocalY) {
      const pivot = localToWorld(pivotLocalX, pivotLocalY);
      robot.headingRad = normalizeAngle(robot.headingRad + angleRad);
      const rotatedPivot = transformLocalToWorld(
        { xMm: 0, yMm: 0, headingRad: robot.headingRad },
        pivotLocalX,
        pivotLocalY
      );
      robot.xMm = pivot.xMm - rotatedPivot.xMm;
      robot.yMm = pivot.yMm - rotatedPivot.yMm;
      if (physics.robotBody) {
        Body.setVelocity(physics.robotBody, { x: 0, y: 0 });
        Body.setAngularVelocity(physics.robotBody, 0);
        setPhysicsBodyFromRobotPose();
      }
    }

    function turnRobotInPlace(angleRad) {
      rotateRobotAround(angleRad, robotGeometry.axleLocalX, robotGeometry.axleLocalY);
    }

    function resetPhysicsWorld() {
      Composite.clear(physics.engine.world, false, true);
      Engine.clear(physics.engine);
      physics.accumulatorMs = 0;
      stopRobotDrive();

      physics.boundaries = scenario.world.boundaries.map((boundary) => Bodies.rectangle(
        boundary.xMm,
        boundary.yMm,
        boundary.widthMm,
        boundary.heightMm,
        {
          isStatic: true,
          friction: boundary.friction,
          restitution: 0,
          slop: 0
        }
      ));
      const partOptions = {
        density: PHYSICS.robotDensity,
        friction: PHYSICS.robotFriction,
        frictionStatic: PHYSICS.robotStaticFriction,
        frictionAir: scenario.robot.physics.airFriction,
        restitution: 0,
        slop: 0
      };
      const bodyParts = [
        ...robotGeometry.bodyRectangles.map((part) => Bodies.rectangle(
          part.x, part.y, part.width, part.height, partOptions
        )),
        ...driveWheels.map((wheel) => Bodies.rectangle(
          wheel.localX, wheel.localY, wheel.widthMm, wheel.heightMm, partOptions
        )),
        ...colorSensors.map((sensor) => Bodies.rectangle(
          sensor.localX, sensor.localY, sensor.widthMm, sensor.depthMm, partOptions
        ))
      ];
      physics.robotBody = Body.create({
        parts: bodyParts,
        friction: PHYSICS.robotFriction,
        frictionStatic: PHYSICS.robotStaticFriction,
        frictionAir: scenario.robot.physics.airFriction,
        restitution: 0,
        slop: 0
      });
      physics.robotOriginOffset = {
        x: physics.robotBody.position.x,
        y: physics.robotBody.position.y
      };
      setPhysicsBodyFromRobotPose();
      Composite.add(physics.engine.world, [...physics.boundaries, physics.robotBody]);
    }

    function addArtefactPhysicsBody(artefact) {
      const body = Bodies.rectangle(artefact.xMm, artefact.yMm, ARTIFACT_SIZE_MM, ARTIFACT_SIZE_MM, {
        angle: artefact.headingRad,
        density: PHYSICS.artefactDensity,
        friction: PHYSICS.artefactFriction,
        frictionStatic: PHYSICS.artefactStaticFriction,
        frictionAir: PHYSICS.artefactAirFriction,
        restitution: 0,
        slop: 0,
        collisionFilter: {
          group: 0,
          category: 0x0001,
          mask: 0
        }
      });
      artefact.body = body;
      artefact.pendingRelease = true;
      Composite.add(physics.engine.world, body);
    }

    function applyRobotDriveForStep() {
      if (!physics.robotBody) return;

      const body = physics.robotBody;
      const heading = body.angle;
      const stepSeconds = PHYSICS.stepMs / 1000;

      // Pseudocode turn() and a keyboard-only turn must stay reproducible.
      // The wheel model is used for motion and arcs, but a turn in place has
      // no translation or wheel slip to accumulate.
      if (
        Math.abs(physics.drive.linearMmS) < 0.0001
        && Math.abs(physics.drive.angularRadS) > 0.0001
      ) {
        rotateRobotAround(
          physics.drive.angularRadS * stepSeconds,
          robotGeometry.axleLocalX,
          robotGeometry.axleLocalY
        );
        return;
      }

      const forward = {
        x: Math.sin(heading),
        y: -Math.cos(heading)
      };
      const lateral = {
        x: Math.cos(heading),
        y: Math.sin(heading)
      };
      const stepSquared = PHYSICS.stepMs * PHYSICS.stepMs;
      const targetForwardVelocity = physics.drive.linearMmS * stepSeconds;
      const currentForwardVelocity = (
        body.velocity.x * forward.x + body.velocity.y * forward.y
      );
      const maxForwardVelocityChange = accelerationMmS2 * stepSeconds * stepSeconds;
      const forwardVelocityChange = Math.max(
        -maxForwardVelocityChange,
        Math.min(
          maxForwardVelocityChange,
          targetForwardVelocity - currentForwardVelocity
        )
      );
      const forwardForce = body.mass * (
        forwardVelocityChange + targetForwardVelocity * body.frictionAir
      ) / (2 * stepSquared);
      let turnTorque = 0;
      if (Math.abs(physics.drive.angularRadS) > 0.0001) {
        const targetAngularVelocity = physics.drive.angularRadS * stepSeconds;
        const maxAngularVelocityChange = turnAccelerationRadS2 * stepSeconds * stepSeconds;
        const angularVelocityChange = Math.max(
          -maxAngularVelocityChange,
          Math.min(
            maxAngularVelocityChange,
            targetAngularVelocity - body.angularVelocity
          )
        );
        turnTorque = body.inertia * (
          angularVelocityChange + targetAngularVelocity * body.frictionAir
        ) / stepSquared;
      }

      for (const wheel of driveWheels) {
        const localFromMassX = wheel.localX - physics.robotOriginOffset.x;
        const localFromMassY = wheel.localY - physics.robotOriginOffset.y;
        const wheelOffset = {
          x: localFromMassX * Math.cos(heading) - localFromMassY * Math.sin(heading),
          y: localFromMassX * Math.sin(heading) + localFromMassY * Math.cos(heading)
        };
        const wheelPosition = {
          x: body.position.x + wheelOffset.x,
          y: body.position.y + wheelOffset.y
        };
        const wheelVelocity = {
          x: body.velocity.x - body.angularVelocity * wheelOffset.y,
          y: body.velocity.y + body.angularVelocity * wheelOffset.x
        };
        const currentLateralVelocity = (
          wheelVelocity.x * lateral.x + wheelVelocity.y * lateral.y
        );
        const lateralVelocityChange = -currentLateralVelocity * PHYSICS.wheelLateralGrip;
        const lateralForce = (body.mass / 2) * lateralVelocityChange / stepSquared;
        const lateralDistance = wheel.localX - robotGeometry.axleLocalX;
        const wheelForwardForce = forwardForce - lateralDistance * turnTorque /
          (2 * HALF_WHEEL_TRACK_MM * HALF_WHEEL_TRACK_MM);

        Body.applyForce(body, wheelPosition, {
          x: forward.x * wheelForwardForce + lateral.x * lateralForce,
          y: forward.y * wheelForwardForce + lateral.y * lateralForce
        });
      }
    }

    function enforceTopWallContact(body) {
      const overflow = PHYSICS.topSafetyLimitMm - body.bounds.min.y;
      if (overflow <= 0) return;

      Body.setPosition(body, {
        x: body.position.x,
        y: body.position.y + overflow
      });
      Body.setVelocity(body, {
        x: body.velocity.x,
        y: Math.max(0, body.velocity.y)
      });
    }

    function enforceTopWall() {
      enforceTopWallContact(physics.robotBody);
      for (const artefact of artefacts) {
        if (artefact.dropped && artefact.body) {
          enforceTopWallContact(artefact.body);
        }
      }
    }

    function activateReleasedArtefacts() {
      if (!physics.robotBody) return;

      for (const artefact of artefacts) {
        if (!artefact.pendingRelease || !artefact.body) continue;
        if (Collision.collides(physics.robotBody, artefact.body)) continue;

        artefact.pendingRelease = false;
        artefact.body.collisionFilter.mask = 0xFFFFFFFF;
      }
    }

    function applyArtefactGroundFriction() {
      const stepSeconds = PHYSICS.stepMs / 1000;
      const speedReduction = PHYSICS.artefactGroundDecelerationMmS2 * stepSeconds * stepSeconds;
      const staticSpeed = PHYSICS.artefactStaticSpeedMmS * stepSeconds;

      for (const artefact of artefacts) {
        if (!artefact.dropped || !artefact.body || artefact.pendingRelease) continue;

        const body = artefact.body;
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed <= staticSpeed) {
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
          continue;
        }

        const nextSpeed = Math.max(0, speed - speedReduction);
        const velocityScale = nextSpeed / speed;
        Body.setVelocity(body, {
          x: body.velocity.x * velocityScale,
          y: body.velocity.y * velocityScale
        });
        Body.setAngularVelocity(body, body.angularVelocity * PHYSICS.artefactAngularDamping);
      }
    }

    function syncPhysicsState() {
      if (!physics.robotBody) return;

      robot.headingRad = normalizeAngle(physics.robotBody.angle);
      const cos = Math.cos(robot.headingRad);
      const sin = Math.sin(robot.headingRad);
      robot.xMm = physics.robotBody.position.x
        - physics.robotOriginOffset.x * cos + physics.robotOriginOffset.y * sin;
      robot.yMm = physics.robotBody.position.y
        - physics.robotOriginOffset.x * sin - physics.robotOriginOffset.y * cos;

      for (const artefact of artefacts) {
        if (!artefact.dropped || !artefact.body) continue;
        artefact.xMm = artefact.body.position.x;
        artefact.yMm = artefact.body.position.y;
        artefact.headingRad = normalizeAngle(artefact.body.angle);
      }
    }

    function stepPhysics(dtSeconds) {
      if (!physics.robotBody) return;

      physics.accumulatorMs = Math.min(physics.accumulatorMs + dtSeconds * 1000, 100);
      while (physics.accumulatorMs >= PHYSICS.stepMs) {
        applyRobotDriveForStep();
        Engine.update(physics.engine, PHYSICS.stepMs);
        applyArtefactGroundFriction();
        enforceTopWall();
        activateReleasedArtefacts();
        physics.accumulatorMs -= PHYSICS.stepMs;
      }

      enforceTopWall();
      activateReleasedArtefacts();
      syncPhysicsState();
      addTrailPoint();
      updateStatus();
    }

    function addTrailPoint() {
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(robot.xMm - last.xMm, robot.yMm - last.yMm) >= 8) {
        trail.push({ xMm: robot.xMm, yMm: robot.yMm });
        if (trail.length > 700) trail.shift();
      }
    }

    function updateMotion(dtSeconds) {
      if (programState.running) {
        resetManualMotion();
        return;
      }

      if (!keyboardToggle.checked) {
        resetManualMotion();
        stopRobotDrive();
        return;
      }

      const forward = keys.has("ArrowUp") ? 1 : 0;
      const backward = keys.has("ArrowDown") ? 1 : 0;
      const left = keys.has("ArrowLeft") ? 1 : 0;
      const right = keys.has("ArrowRight") ? 1 : 0;
      const drive = forward - backward;
      const turn = right - left;

      const targetLinearSpeed = drive >= 0
        ? drive * forwardSpeedMmS
        : drive * forwardSpeedMmS * reverseScale;
      const targetTurnSpeed = turn * turnSpeedRadS;

      manualLinearSpeedMmS = rampToward(
        manualLinearSpeedMmS,
        targetLinearSpeed,
        accelerationMmS2 * dtSeconds
      );
      manualTurnSpeedRadS = rampToward(
        manualTurnSpeedRadS,
        targetTurnSpeed,
        turnAccelerationRadS2 * dtSeconds
      );

      if (
        Math.abs(manualLinearSpeedMmS) < 0.01
        && Math.abs(manualTurnSpeedRadS) < 0.0001
      ) {
        stopRobotDrive();
        return;
      }

      setRobotDrive(manualLinearSpeedMmS, manualTurnSpeedRadS);
    }

    function dropArtefact(id) {
      const artefact = artefacts.find((item) => item.id === id);
      if (!artefact || artefact.dropped) return;

      const world = localToWorld(artefact.localX, artefact.localY);
      artefact.dropped = true;
      artefact.xMm = world.xMm;
      artefact.yMm = world.yMm;
      artefact.headingRad = robot.headingRad;
      addArtefactPhysicsBody(artefact);
      updateDropButtons();
    }

    const interpreter = createInterpreter({
      scenario,
      getColorValues: buildColorValues,
      errorFactory: localizedError
    });

    function colorCubeId(colorName) {
      return buildColorValues().get(colorName.toLowerCase()) || "None";
    }

    function parseStartPointCommand(raw, lineNumber) {
      return interpreter.parseStartPointCommand(raw, lineNumber);
    }

    function parseProgram(source) {
      return interpreter.parseProgram(source);
    }

    function setProgramStatus(key, mode = "", values = {}) {
      programStatusState = { key, mode, values };
      renderProgramStatus();
    }

    function setProgramStatusFromError(error) {
      if (error?.i18nKey) {
        setProgramStatus(error.i18nKey, "error", error.i18nValues);
      } else {
        setProgramStatus("status.error", "error", { message: error?.message || String(error) });
      }
    }

    function setProgramRunning(running) {
      programState.running = running;
      runProgramButton.textContent = t(running ? "ui.pause" : "ui.run");
      runProgramButton.classList.toggle("secondary-button", programState.paused);
      renderProgramTabs();
    }

    function clearProgramExecution(status = "status.ready") {
      stopRobotDrive();
      programState.running = false;
      programState.paused = false;
      programState.commands = [];
      programState.index = 0;
      programState.active = null;
      setProgramRunning(false);
      setProgramStatus(status);
    }

    function pauseProgramExecution() {
      if (!programState.running) return;

      stopRobotDrive();
      programState.running = false;
      programState.paused = true;
      setProgramRunning(false);
      setProgramStatus("status.paused");
    }

    function resumeProgramExecution() {
      if (!programState.paused || programState.commands.length === 0) {
        startProgram();
        return;
      }

      programState.paused = false;
      setProgramRunning(true);
      const command = programState.active || programState.commands[programState.index];
      if (command) {
        setProgramStatus("status.runningLine", "running", command);
      }
    }

    function resetFromProgram() {
      try {
        resetRobot();
      } catch (error) {
        clearProgramExecution();
        setProgramStatusFromError(error);
      }
    }

    function startProgram() {
      let commands;
      try {
        const startPoint = parseStartPoint(ensureProgramPrologue());
        resetRobot({ stopProgram: false, startPoint });
        commands = parseProgram(programInput.value);
      } catch (error) {
        clearProgramExecution();
        setProgramStatusFromError(error);
        return;
      }

      programState.commands = commands;
      programState.index = 0;
      programState.active = null;
      programState.paused = false;

      if (commands.length === 0) {
        clearProgramExecution("status.done");
        setProgramStatus("status.done", "done");
        return;
      }

      setProgramRunning(true);
      setProgramStatus("status.runningLine", "running", commands[0]);
    }

    function beginProgramCommand(command) {
      if (command.type === "straight") {
        return {
          ...command,
          remainingMm: Math.abs(command.value),
          direction: Math.sign(command.value) || 1,
          speedMmS: 0
        };
      }

      if (command.type === "turn") {
        return {
          ...command,
          remainingRad: Math.abs(command.value) * Math.PI / 180,
          direction: Math.sign(command.value) || 1,
          speedRadS: 0
        };
      }

      if (command.type === "turn_one") {
        const stationaryWheel = command.movingWheel === "left"
          ? driveWheels.find((wheel) => wheel.id === "right")
          : driveWheels.find((wheel) => wheel.id === "left");
        return {
          ...command,
          remainingRad: Math.abs(command.value) * Math.PI / 180,
          direction: Math.sign(command.value) || 1,
          pivotLocalX: stationaryWheel.localX,
          pivotLocalY: stationaryWheel.localY,
          speedRadS: 0
        };
      }

      return command;
    }

    function completeProgramCommand() {
      programState.index += 1;
      programState.active = null;

      if (programState.index >= programState.commands.length) {
        clearProgramExecution("status.done");
        setProgramStatus("status.done", "done");
        return;
      }

      const next = programState.commands[programState.index];
      setProgramStatus("status.runningLine", "running", next);
    }

    function completeProgramMotionAfterPhysics() {
      if (!programState.active?.finishAfterPhysics) return;

      stopRobotDrive();
      completeProgramCommand();
    }

    function failProgram(error) {
      clearProgramExecution();
      setProgramStatusFromError(error);
    }

    function updateProgram(dtSeconds) {
      if (!programState.running) return;

      if (!programState.active) {
        const command = programState.commands[programState.index];
        programState.active = beginProgramCommand(command);
      }

      const command = programState.active;

      if (command.type === "drop") {
        stopRobotDrive();
        dropArtefact(command.value);
        completeProgramCommand();
        return;
      }

      if (command.type === "start_point") {
        stopRobotDrive();
        completeProgramCommand();
        return;
      }

      if (command.type === "read_colors") {
        stopRobotDrive();
        updateProgramColorMapBlock(true);
        completeProgramCommand();
        return;
      }

      if (command.type === "assign") {
        stopRobotDrive();
        completeProgramCommand();
        return;
      }

      if (command.type === "straight") {
        if (command.remainingMm <= 0) {
          stopRobotDrive();
          completeProgramCommand();
          return;
        }

        const motion = acceleratedStep(
          command.remainingMm,
          command.speedMmS,
          forwardSpeedMmS,
          accelerationMmS2,
          dtSeconds
        );
        setRobotDrive(
          (motion.step * command.direction) / Math.max(dtSeconds, 0.001),
          0
        );

        command.remainingMm -= motion.step;
        command.speedMmS = motion.speed;
        if (command.remainingMm <= 0.001) {
          command.finishAfterPhysics = true;
        }
        return;
      }

      if (command.type === "move_to_line") {
        if (colorSensorReading.brightness === null) {
          stopRobotDrive();
          return;
        }

        if (colorSensorReading.brightness < command.threshold) {
          stopRobotDrive();
          completeProgramCommand();
          return;
        }

        setRobotDrive(forwardSpeedMmS, 0);
        return;
      }

      if (command.type === "turn") {
        if (command.remainingRad <= 0) {
          stopRobotDrive();
          completeProgramCommand();
          return;
        }

        const motion = acceleratedStep(
          command.remainingRad,
          command.speedRadS,
          turnSpeedRadS,
          turnAccelerationRadS2,
          dtSeconds
        );
        turnRobotInPlace(motion.step * command.direction);
        command.remainingRad -= motion.step;
        command.speedRadS = motion.speed;

        if (command.remainingRad <= 0.001) {
          stopRobotDrive();
          completeProgramCommand();
        }
        return;
      }

      if (command.type === "turn_one") {
        if (command.remainingRad <= 0) {
          stopRobotDrive();
          completeProgramCommand();
          return;
        }

        const motion = acceleratedStep(
          command.remainingRad,
          command.speedRadS,
          turnSpeedRadS,
          turnAccelerationRadS2,
          dtSeconds
        );
        const stepRad = motion.step * command.direction;
        rotateRobotAround(stepRad, command.pivotLocalX, command.pivotLocalY);

        command.remainingRad -= Math.abs(stepRad);
        command.speedRadS = motion.speed;
        if (command.remainingRad <= 0.001) {
          stopRobotDrive();
          completeProgramCommand();
        }
      }
    }

    function drawField() {
      ctx.clearRect(0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);

      if (background.complete && background.naturalWidth > 0) {
        ctx.drawImage(background, 0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);
      } else {
        ctx.fillStyle = "#d9ded5";
        ctx.fillRect(0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);
      }

      ctx.strokeStyle = "rgba(17, 24, 39, 0.52)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, WORLD_WIDTH_MM, WORLD_HEIGHT_MM);
    }

    function drawArtefact(artefact, xMm, yMm, headingRad) {
      ctx.save();
      ctx.translate(xMm, yMm);
      ctx.rotate(headingRad);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = artefact.color;
      ctx.strokeStyle = "rgba(17, 24, 39, 0.8)";
      ctx.lineWidth = 2;

      for (const rectangle of artifactVisual.rectangles) {
        ctx.fillRect(
          rectangle.x - rectangle.width / 2,
          rectangle.y - rectangle.height / 2,
          rectangle.width,
          rectangle.height
        );
        ctx.strokeRect(
          rectangle.x - rectangle.width / 2,
          rectangle.y - rectangle.height / 2,
          rectangle.width,
          rectangle.height
        );
      }
      ctx.fillStyle = artefact.textColor;
      ctx.font = "bold 24px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(artefact.id, 0, 1);
      ctx.restore();
    }

    function drawDroppedArtefacts() {
      for (const artefact of artefacts) {
        if (artefact.dropped) {
          drawArtefact(artefact, artefact.xMm, artefact.yMm, artefact.headingRad);
        }
      }
    }

    function drawColorSensor(sensor) {
      const halfWidthMm = sensor.widthMm / 2;
      const halfDepthMm = sensor.depthMm / 2;
      const halfFaceSizeMm = sensor.faceSizeMm / 2;
      ctx.save();
      ctx.translate(sensor.localX, sensor.localY);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;

      ctx.fillRect(
        -halfWidthMm,
        -halfDepthMm,
        sensor.widthMm,
        sensor.depthMm
      );
      ctx.strokeRect(
        -halfWidthMm,
        -halfDepthMm,
        sensor.widthMm,
        sensor.depthMm
      );
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(
        -halfFaceSizeMm,
        -halfFaceSizeMm,
        sensor.faceSizeMm,
        sensor.faceSizeMm
      );
      ctx.strokeRect(
        -halfFaceSizeMm,
        -halfFaceSizeMm,
        sensor.faceSizeMm,
        sensor.faceSizeMm
      );
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(0, 0, sensor.lensRadiusMm, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(0, 0, sensor.lensRadiusMm / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawTrail() {
      if (!trailToggle.checked || trail.length < 2) return;

      ctx.save();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.85)";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(trail[0].xMm, trail[0].yMm);
      for (let i = 1; i < trail.length; i += 1) {
        ctx.lineTo(trail[i].xMm, trail[i].yMm);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawRobot() {
      ctx.save();
      ctx.translate(robot.xMm, robot.yMm);
      ctx.rotate(robot.headingRad);

      ctx.beginPath();
      for (const part of robotGeometry.bodyRectangles) {
        ctx.rect(part.x - part.width / 2, part.y - part.height / 2, part.width, part.height);
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fill();

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 3;
      if (robotGeometry.design) {
        const cellSize = robotGeometry.grid.cellSizeMm;
        const originColumn = robotGeometry.grid.originNodeColumn;
        const originRow = robotGeometry.grid.originNodeRow;
        ctx.beginPath();
        for (const [column, row] of robotGeometry.design.bodyCells) {
          const left = (column - originColumn) * cellSize;
          const top = (row - originRow) * cellSize;
          if (!robotBodyCellSet.has(`${column - 1}:${row}`)) {
            ctx.moveTo(left, top);
            ctx.lineTo(left, top + cellSize);
          }
          if (!robotBodyCellSet.has(`${column + 1}:${row}`)) {
            ctx.moveTo(left + cellSize, top);
            ctx.lineTo(left + cellSize, top + cellSize);
          }
          if (!robotBodyCellSet.has(`${column}:${row - 1}`)) {
            ctx.moveTo(left, top);
            ctx.lineTo(left + cellSize, top);
          }
          if (!robotBodyCellSet.has(`${column}:${row + 1}`)) {
            ctx.moveTo(left, top + cellSize);
            ctx.lineTo(left + cellSize, top + cellSize);
          }
        }
        ctx.stroke();
      } else {
        for (const part of robotGeometry.bodyRectangles) {
          ctx.strokeRect(part.x - part.width / 2, part.y - part.height / 2, part.width, part.height);
        }
      }

      ctx.fillStyle = "rgba(17, 24, 39, 0.95)";
      ctx.strokeStyle = "rgba(248, 250, 252, 0.45)";
      ctx.lineWidth = 2;
      ctx.save();
      ctx.setLineDash([8, 5]);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(driveWheels[0].localX, driveWheels[0].localY);
      ctx.lineTo(driveWheels[1].localX, driveWheels[1].localY);
      ctx.stroke();
      ctx.restore();
      for (const wheel of driveWheels) {
        const left = wheel.localX - WHEEL_WIDTH_MM / 2;
        const top = wheel.localY - WHEEL_DIAMETER_MM / 2;
        ctx.fillStyle = "rgba(17, 24, 39, 0.95)";
        ctx.strokeStyle = "rgba(248, 250, 252, 0.45)";
        ctx.lineWidth = 2;
        ctx.fillRect(left, top, WHEEL_WIDTH_MM, WHEEL_DIAMETER_MM);
        ctx.strokeRect(left, top, WHEEL_WIDTH_MM, WHEEL_DIAMETER_MM);
      }

      for (const sensor of colorSensors) {
        drawColorSensor(sensor);
      }

      // Heading 0 points toward the top of the field, so the local arrow points up.
      ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.lineTo(-15, -17);
      ctx.lineTo(-6, -17);
      ctx.lineTo(-6, 27);
      ctx.lineTo(6, 27);
      ctx.lineTo(6, -17);
      ctx.lineTo(15, -17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (const artefact of artefacts) {
        if (!artefact.dropped) {
          drawArtefact(artefact, artefact.localX, artefact.localY, 0);
        }
      }

      ctx.restore();
    }

    function draw() {
      drawField();
      drawTrail();
      drawDroppedArtefacts();
      drawRobot();
      updateColorSensorReading();
    }

    function updateStatus() {
      const headingDeg = normalizeAngle(robot.headingRad) * 180 / Math.PI;
      xValue.textContent = `${robot.xMm.toFixed(1)} mm`;
      yValue.textContent = `${robot.yMm.toFixed(1)} mm`;
      headingValue.textContent = `${headingDeg.toFixed(1)} deg`;
    }

    function updateDropButtons() {
      for (const button of dropButtons) {
        const artefact = artefacts.find((item) => item.id === button.dataset.dropId);
        const dropped = Boolean(artefact && artefact.dropped);
        button.disabled = dropped;
        if (artefact && !dropped) {
          button.style.background = artefact.color;
          button.style.borderColor = artefact.color;
          button.style.color = artefact.textColor;
        } else {
          button.style.background = "#e4e7ec";
          button.style.borderColor = "#cfd4dc";
          button.style.color = "#667085";
        }
      }
    }

    function tick(now) {
      const dtSeconds = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      advanceSimulation(dtSeconds);
      requestAnimationFrame(tick);
    }

    function advanceSimulation(dtSeconds) {
      updateProgram(dtSeconds);
      updateMotion(dtSeconds);
      stepPhysics(dtSeconds);
      completeProgramMotionAfterPhysics();
      draw();
    }

    window.addEventListener("keydown", (event) => {
      if (!keyboardToggle.checked) return;

      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        if (!programState.running) {
          keys.add(event.key);
        }
      }

      if (event.key.toLowerCase() === "r") {
        resetFromProgram();
      }

      if (scenario.programming.dropTargets.includes(event.key) && !programState.running) {
        event.preventDefault();
        dropArtefact(event.key);
      }
    });

    window.addEventListener("keyup", (event) => {
      if (!keyboardToggle.checked) return;

      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        keys.delete(event.key);
      }
    });

    window.addEventListener("blur", () => {
      keys.clear();
    });

    resetButton.addEventListener("click", resetFromProgram);
    runProgramButton.addEventListener("click", () => {
      if (programState.running) {
        pauseProgramExecution();
      } else if (programState.paused) {
        resumeProgramExecution();
      } else {
        startProgram();
      }
    });
    resetProgramButton.addEventListener("click", resetFromProgram);
    newProgramButton.addEventListener("click", createProgram);

    for (const button of dropButtons) {
      button.addEventListener("click", () => dropArtefact(button.dataset.dropId));
    }

    trailToggle.addEventListener("change", () => {
      if (!trailToggle.checked) trail.length = 0;
      if (trailToggle.checked) addTrailPoint();
    });

    keyboardToggle.addEventListener("change", () => {
      if (!keyboardToggle.checked) {
        keys.clear();
      }
    });

    manualColorsToggle.addEventListener("change", updateColorMode);

    for (const select of colorSelects) {
      select.addEventListener("change", refreshColorsAfterManualChange);
    }

    speedInput.addEventListener("input", () => {
      forwardSpeedMmS = Number(speedInput.value);
      speedValue.textContent = `${forwardSpeedMmS} mm/s`;
    });

    accelInput.addEventListener("input", () => {
      accelerationMmS2 = Number(accelInput.value);
      accelValue.textContent = `${accelerationMmS2} mm/s2`;
    });

    turnSpeedInput.addEventListener("input", () => {
      const turnSpeedDegS = Number(turnSpeedInput.value);
      turnSpeedRadS = turnSpeedDegS * Math.PI / 180;
      turnSpeedValue.textContent = `${turnSpeedDegS} deg/s`;
    });

    turnAccelInput.addEventListener("input", () => {
      const turnAccelDegS2 = Number(turnAccelInput.value);
      turnAccelerationRadS2 = turnAccelDegS2 * Math.PI / 180;
      turnAccelValue.textContent = `${turnAccelDegS2} deg/s2`;
    });

    programInput.addEventListener("input", saveProgram);

    background.addEventListener("load", () => {
      assetError.classList.remove("is-visible");
      draw();
    });

    background.addEventListener("error", () => {
      sensorFieldReady = false;
      updateColorSensorReading(true);
      assetError.classList.add("is-visible");
    });

    sensorBackground.addEventListener("load", () => {
      cacheSensorFieldImage();
      updateColorSensorReading(true);
      draw();
    });

    sensorBackground.addEventListener("error", () => {
      sensorFieldReady = false;
      updateColorSensorReading(true);
    });

    sensorBackground.src = SENSOR_MAP_SRC;

    for (const button of languageButtons) {
      button.addEventListener("click", () => setLanguage(button.dataset.language));
    }

    setupColorSelects();
    loadSavedProgram();
    loadColorSettings();
    loadLanguage();
    applyLanguage();
    resetFromProgram();
    if (options.autoStart !== false) {
      requestAnimationFrame(tick);
    } else {
      draw();
    }

    return Object.freeze({
      scenario,
      reset: resetFromProgram,
      run: startProgram,
      pause: pauseProgramExecution,
      resume: resumeProgramExecution,
      parseProgram,
      parseStartPoint,
      advance: advanceSimulation,
      getState() {
        return {
          robot: {
            ...robot,
            widthMm: robotGeometry.widthMm,
            heightMm: robotGeometry.heightMm,
            wheelTrackMm: robotGeometry.wheelTrackMm,
            design: robotGeometry.design
          },
          objects: artefacts.map((artefact) => ({
            id: artefact.id,
            color: artefact.name,
            dropped: Boolean(artefact.dropped),
            xMm: artefact.xMm,
            yMm: artefact.yMm,
            headingRad: artefact.headingRad
          })),
          sensor: { ...colorSensorReading },
          sensors: Object.fromEntries(
            Array.from(colorSensorReadings, ([id, reading]) => [id, { ...reading }])
          ),
          program: {
            running: programState.running,
            paused: programState.paused,
            index: programState.index,
            commandCount: programState.commands.length
          }
        };
      }
    });
    }
