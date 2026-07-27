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
