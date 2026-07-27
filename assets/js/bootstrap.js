import { createSimulator } from "./app.js";
import "./scenarios/wro-2026-junior.js";

const defaultSimulator = createSimulator({
  scenarioId: "wro-2026-junior"
});

export { defaultSimulator };
