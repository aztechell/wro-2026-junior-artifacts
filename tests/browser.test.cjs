const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const serverModuleUrl = pathToFileURL(
  path.join(projectRoot, "scripts", "static-server.mjs")
).href;

test("index.html works over HTTP with ES modules and current behavior", {
  timeout: 30_000
}, async (t) => {
  const { createStaticServer } = await import(serverModuleUrl);
  const server = createStaticServer(projectRoot);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const projectUrl = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto(projectUrl);
  await page.waitForFunction(async () => {
    const { defaultSimulator } = await import("/assets/js/bootstrap.js");
    return Boolean(defaultSimulator);
  });

  assert.equal(await page.title(), "Симулятор поля WRO 2026 Junior");
  assert.deepEqual(
    await page.locator("[data-drop-id]").allTextContents(),
    ["1", "2", "3", "4"]
  );
  assert.deepEqual(
    await page.locator("#field").evaluate((canvas) => [canvas.width, canvas.height]),
    [1000, 1000]
  );
  assert.equal(
    await page.evaluate(async () => {
      const { listScenarios } = await import("/assets/js/core/registry.js");
      return listScenarios()[0].id;
    }),
    "wro-2026-junior"
  );

  await page.evaluate(() => {
    localStorage.setItem("wro2026JuniorLanguage", "en");
    localStorage.setItem("wro2026JuniorPseudocodeTabs", JSON.stringify({
      activeProgramId: "legacy-tab",
      programs: [{
        id: "legacy-tab",
        code: "startPoint(340, 820, 0)\nstraight(42)"
      }]
    }));
  });
  await page.reload();
  await page.waitForFunction(async () => {
    const { defaultSimulator } = await import("/assets/js/bootstrap.js");
    return Boolean(defaultSimulator);
  });
  await page.evaluate(async () => {
    window.__testSimulator = (await import("/assets/js/bootstrap.js")).defaultSimulator;
  });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.locator("#programInput").inputValue(), /straight\(42\)/);

  await page.getByRole("tab", { name: /Solution 1/ }).click();
  assert.equal(await page.locator("#programInput").getAttribute("readonly"), "");
  await page.getByRole("tab", { name: "Code 1" }).click();

  await page.locator("#programInput").fill("startPoint(340, 820, 0)\nstraight(100)");
  await page.locator("#runProgramButton").click();
  await page.waitForFunction(
    () => window.__testSimulator.getState().robot.yMm < 722,
    null,
    { timeout: 5_000 }
  );
  await page.waitForFunction(
    () => window.__testSimulator.getState().program.running === false,
    null,
    { timeout: 5_000 }
  );
  const robot = await page.evaluate(() => window.__testSimulator.getState().robot);
  assert.ok(Math.abs(robot.xMm - 340) < 1);
  assert.ok(Math.abs(robot.yMm - 720) < 2, `unexpected y position: ${robot.yMm}`);

  await page.locator("#programInput").fill("startPoint(340, 820, 0)\nstraight(300)");
  await page.locator("#runProgramButton").click();
  await page.waitForFunction(() => window.__testSimulator.getState().program.running);
  await page.locator("#runProgramButton").click();
  const paused = await page.evaluate(() => window.__testSimulator.getState());
  assert.equal(paused.program.paused, true);
  await page.waitForTimeout(150);
  const pausedY = await page.evaluate(() => window.__testSimulator.getState().robot.yMm);
  assert.ok(Math.abs(pausedY - paused.robot.yMm) < 0.1);
  await page.locator("#runProgramButton").click();
  await page.waitForFunction(
    () => window.__testSimulator.getState().program.running === false,
    null,
    { timeout: 5_000 }
  );

  await page.locator("#programInput").fill("startPoint(340, 820, 0)");
  await page.locator("#resetProgramButton").click();
  await page.locator("#keyboardToggle").check();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.up("ArrowUp");
  assert.ok(
    await page.evaluate(() => window.__testSimulator.getState().robot.yMm < 820)
  );
  await page.locator("#keyboardToggle").uncheck();

  await page.locator("#manualColorsToggle").check();
  const configuredColors = ["yellow", "blue", "black", "green"];
  const colorSelects = page.locator("[data-color-select]");
  for (let index = 0; index < configuredColors.length; index += 1) {
    await colorSelects.nth(index).selectOption(configuredColors[index]);
  }
  await page.locator("#resetProgramButton").click();
  assert.deepEqual(
    await page.evaluate(() => window.__testSimulator.getState().objects.map((object) => object.color)),
    configuredColors
  );

  await page.locator('[data-drop-id="1"]').click();
  assert.equal(
    await page.evaluate(
      () => window.__testSimulator.getState().objects.find((object) => object.id === "1").dropped
    ),
    true
  );

  await page.locator("#programInput").fill("startPoint(340, 200, 0)\nstraight(500)");
  await page.locator("#runProgramButton").click();
  await page.waitForFunction(
    () => window.__testSimulator.getState().robot.yMm < 150,
    null,
    { timeout: 5_000 }
  );
  await page.waitForFunction(
    () => window.__testSimulator.getState().program.running === false,
    null,
    { timeout: 5_000 }
  );
  assert.ok(
    await page.evaluate(() => window.__testSimulator.getState().robot.yMm >= 122.9)
  );

  await page.waitForFunction(
    () => window.__testSimulator.getState().sensor.brightness !== null
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
});

test("robot editor saves profiles and simulator imports an explicit snapshot", {
  timeout: 30_000
}, async (t) => {
  const { createStaticServer } = await import(serverModuleUrl);
  const server = createStaticServer(projectRoot);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const projectUrl = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto(`${projectUrl}robot-editor.html`);
  await page.locator("#profileList .profile-item").first().waitFor();
  assert.equal(await page.locator("#cellCount").textContent(), "1024");
  assert.equal(await page.locator("#wheelTrack").textContent(), "160 mm");
  await page.locator("#profileName").fill("Custom Grid");

  const canvas = page.locator("#robotGrid");
  const canvasBox = await canvas.boundingBox();
  const scale = canvasBox.width / 704;
  await canvas.dblclick({ position: { x: (32 + 31.5 * 20) * scale, y: (32 + 31.5 * 20) * scale } });
  assert.equal(await page.locator("#cellCount").textContent(), "1023");

  await page.locator('[data-tool="wheel"]').click();
  await page.mouse.move(
    canvasBox.x + (32 + 6 * 20) * scale,
    canvasBox.y + (32 + 16 * 20) * scale
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + (32 + 8 * 20) * scale,
    canvasBox.y + (32 + 16 * 20) * scale,
    { steps: 4 }
  );
  await page.mouse.up();
  assert.equal(await page.locator("#wheelTrack").textContent(), "128 mm");
  await canvas.dblclick({
    position: { x: (32 + 24 * 20) * scale, y: (32 + 16 * 20) * scale }
  });
  assert.match(await page.locator("#validationState").textContent(), /exactly two wheels/);
  await canvas.click({ position: { x: (32 + 24 * 20) * scale, y: (32 + 16 * 20) * scale } });
  assert.equal(await page.locator("#wheelTrack").textContent(), "128 mm");

  await page.locator('[data-tool="sensor"]').click();
  await canvas.click({ position: { x: (32 + 16 * 20) * scale, y: (32 + 24 * 20) * scale } });
  assert.equal(await page.locator("#sensorCount").textContent(), "2");
  await page.mouse.move(
    canvasBox.x + (32 + 16 * 20) * scale,
    canvasBox.y + (32 + 24 * 20) * scale
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + (32 + 18 * 20) * scale,
    canvasBox.y + (32 + 26 * 20) * scale,
    { steps: 4 }
  );
  await page.mouse.up();
  await canvas.dblclick({
    position: { x: (32 + 16 * 20) * scale, y: (32 + 4 * 20) * scale }
  });
  assert.equal(await page.locator("#sensorCount").textContent(), "1");
  assert.equal(await page.locator("#validationState").getAttribute("class"), "validation-state valid");
  assert.equal(await page.locator('#sensorList input[type="radio"]').count(), 1);

  await page.locator('[data-tool="object"]').click();
  await page.mouse.move(
    canvasBox.x + (32 + 8 * 20) * scale,
    canvasBox.y + (32 + 8 * 20) * scale
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + (32 + 6 * 20) * scale,
    canvasBox.y + (32 + 8 * 20) * scale,
    { steps: 4 }
  );
  await page.mouse.up();
  await canvas.dblclick({
    position: { x: (32 + 6 * 20) * scale, y: (32 + 8 * 20) * scale }
  });
  await page.mouse.move(
    canvasBox.x + (32 + 8 * 20) * scale,
    canvasBox.y + (32 + 8 * 20) * scale
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + (32 + 6 * 20) * scale,
    canvasBox.y + (32 + 8 * 20) * scale,
    { steps: 4 }
  );
  await page.mouse.up();
  assert.equal(await page.locator("#objectCount").textContent(), "4");
  assert.equal(await page.locator("#validationState").getAttribute("class"), "validation-state valid");

  await page.reload();
  await page.locator("#profileList .profile-item").first().waitFor();
  assert.equal(await page.locator("#profileName").inputValue(), "Custom Grid");
  assert.equal(await page.locator("#cellCount").textContent(), "1023");
  assert.equal(await page.locator("#sensorCount").textContent(), "1");
  assert.equal(await page.locator("#wheelTrack").textContent(), "128 mm");

  await Promise.all([
    page.waitForNavigation(),
    page.locator("#useInSimulator").click()
  ]);
  await page.waitForFunction(async () => Boolean((await import("/assets/js/bootstrap.js")).defaultSimulator));
  assert.match(await page.locator("#activeRobotProfile").textContent(), /Custom Grid/);
  const importedState = await page.evaluate(
    async () => (await import("/assets/js/bootstrap.js")).defaultSimulator.getState()
  );
  assert.equal(importedState.robot.design.bodyCells.length, 1023);
  assert.equal(importedState.robot.wheelTrackMm, 128);
  assert.ok(
    importedState.robot.design.sensors.some(
      (sensor) => sensor.nodeColumn === 18 && sensor.nodeRow === 26
    )
  );
  assert.ok(
    importedState.robot.design.attachments.some(
      (attachment) => (
        attachment.objectId === "1"
        && attachment.nodeColumn === 6
        && attachment.nodeRow === 8
      )
    )
  );
  assert.equal(Object.keys(importedState.sensors).length, 1);

  await Promise.all([
    page.waitForNavigation(),
    page.locator("#defaultRobotButton").click()
  ]);
  assert.match(await page.locator("#activeRobotProfile").textContent(), /Default robot|Стандартный робот/);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
});
