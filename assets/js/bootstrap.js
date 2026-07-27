import { createSimulator } from "./app.js";
import { createRobotProfileStore } from "./adapters/robot-profiles.js";
import { getScenario } from "./core/registry.js";
import "./scenarios/wro-2026-junior.js";

const scenario = getScenario("wro-2026-junior");
const robotProfiles = createRobotProfileStore(scenario, window.localStorage);
const activeRobot = robotProfiles.active();
const defaultSimulator = createSimulator({
  scenarioId: "wro-2026-junior",
  robotDesign: activeRobot.snapshot?.design
});

const robotUiText = {
  ru: {
    editor: "Редактор робота", import: "Импортировать робота", standard: "Стандартный робот",
    cancel: "Отмена", active: "Активный робот", defaultName: "Стандартный робот",
    noProfiles: "Нет корректных профилей. Откройте редактор и исправьте конструкцию.",
    cells: "клеток", sensors: "датчиков"
  },
  en: {
    editor: "Robot editor", import: "Import robot", standard: "Default robot",
    cancel: "Cancel", active: "Active robot", defaultName: "Default robot",
    noProfiles: "No valid profiles. Open the editor and fix a design.",
    cells: "cells", sensors: "sensors"
  }
};

function setupRobotProfileUi() {
  const dialog = document.querySelector("#robotImportDialog");
  const list = document.querySelector("#robotImportList");
  const error = document.querySelector("#robotImportError");
  const importButton = document.querySelector("#importRobotButton");
  const defaultButton = document.querySelector("#defaultRobotButton");
  const activeLabel = document.querySelector("#activeRobotProfile");
  const validProfiles = () => robotProfiles.load().profiles.filter(
    (profile) => robotProfiles.validation(profile).design
  );
  const currentLanguage = () => window.localStorage.getItem(scenario.storage.language) || "ru";
  const tr = (key) => robotUiText[currentLanguage()]?.[key] || robotUiText.ru[key];

  function applyText() {
    document.querySelector("#robotEditorLink").textContent = tr("editor");
    importButton.textContent = tr("import");
    defaultButton.textContent = tr("standard");
    document.querySelector("#robotImportTitle").textContent = tr("import");
    document.querySelector("#cancelRobotImport").textContent = tr("cancel");
    document.querySelector("#confirmRobotImport").textContent = tr("import");
    activeLabel.textContent = `${tr("active")}: ${activeRobot.snapshot?.profileName || tr("defaultName")}`;
  }

  function renderProfiles() {
    const profiles = validProfiles();
    list.replaceChildren(...profiles.map((profile, index) => {
      const validation = robotProfiles.validation(profile);
      const label = document.createElement("label");
      label.className = "robot-import-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "robotProfile";
      input.value = profile.id;
      input.checked = index === 0;
      const content = document.createElement("span");
      content.textContent = profile.name;
      const details = document.createElement("small");
      details.textContent = `${validation.design.bodyCells.length} ${tr("cells")} · ${validation.design.sensors.length} ${tr("sensors")}`;
      content.append(details);
      label.append(input, content);
      return label;
    }));
    error.classList.toggle("is-visible", profiles.length === 0);
    error.textContent = profiles.length ? "" : tr("noProfiles");
    document.querySelector("#confirmRobotImport").disabled = profiles.length === 0;
  }

  importButton.addEventListener("click", () => {
    applyText();
    renderProfiles();
    dialog.showModal();
  });
  document.querySelector("#cancelRobotImport").addEventListener("click", () => dialog.close());
  document.querySelector("#confirmRobotImport").addEventListener("click", () => {
    const selected = dialog.querySelector('input[name="robotProfile"]:checked');
    if (!selected) return;
    robotProfiles.importProfile(selected.value);
    window.location.reload();
  });
  defaultButton.addEventListener("click", () => {
    robotProfiles.clearActive();
    window.location.reload();
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", applyText);
  });
  applyText();
}

setupRobotProfileUi();

if (activeRobot.error) {
  const assetError = document.querySelector("#assetError");
  if (assetError) {
    assetError.hidden = false;
    assetError.classList.add("is-visible");
    assetError.textContent = `Robot design error: ${activeRobot.error.message}`;
  }
}

export { activeRobot, defaultSimulator, robotProfiles };
