import {
  createDefaultRobotDesign,
  normalizeRobotDesign,
  tryNormalizeRobotDesign
} from "../core/robot-design.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix = "robot") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRobotProfileStore(scenario, storage) {
  const profilesKey = scenario.storage.robotProfiles;
  const activeKey = scenario.storage.activeRobotDesign;

  function upgradeLegacyDefault(design) {
    if (
      !design
      || design.schemaVersion !== 1
      || design.bodyCells?.length !== 31 * 31
      || design.wheels?.length !== 2
      || design.sensors?.length !== 1
    ) return design;
    const cells = new Set(design.bodyCells.map(([column, row]) => `${column}:${row}`));
    for (let row = 0; row < 31; row += 1) {
      for (let column = 0; column < 31; column += 1) {
        if (!cells.has(`${column}:${row}`)) return design;
      }
    }
    const wheelPositions = design.wheels
      .map((wheel) => `${wheel.nodeColumn}:${wheel.nodeRow}`)
      .sort()
      .join("|");
    const sensor = design.sensors[0];
    if (
      wheelPositions !== "26:16|6:16"
      || sensor.nodeColumn !== 16
      || sensor.nodeRow !== 4
    ) return design;
    return clone(createDefaultRobotDesign(scenario));
  }

  function defaultProfile() {
    return {
      id: createId(),
      name: "Robot 1",
      updatedAt: new Date().toISOString(),
      design: clone(createDefaultRobotDesign(scenario))
    };
  }

  function loadProfiles() {
    try {
      const parsed = JSON.parse(storage.getItem(profilesKey) || "null");
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
        return { schemaVersion: 1, selectedProfileId: null, profiles: [defaultProfile()] };
      }
      const profiles = parsed.profiles.map((profile) => ({
        id: String(profile.id || createId()),
        name: String(profile.name || "Robot"),
        updatedAt: String(profile.updatedAt || new Date().toISOString()),
        design: clone(upgradeLegacyDefault(profile.design))
      }));
      const selectedProfileId = profiles.some((profile) => profile.id === parsed.selectedProfileId)
        ? parsed.selectedProfileId
        : profiles[0].id;
      return { schemaVersion: 1, selectedProfileId, profiles };
    } catch {
      return { schemaVersion: 1, selectedProfileId: null, profiles: [defaultProfile()] };
    }
  }

  function saveProfiles(collection) {
    storage.setItem(profilesKey, JSON.stringify(collection));
    return collection;
  }

  function ensureProfiles() {
    const collection = loadProfiles();
    if (!collection.selectedProfileId) {
      collection.selectedProfileId = collection.profiles[0].id;
    }
    saveProfiles(collection);
    return collection;
  }

  function updateProfile(profileId, patch) {
    const collection = ensureProfiles();
    const profile = collection.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(`Unknown robot profile: ${profileId}`);
    Object.assign(profile, clone(patch), { updatedAt: new Date().toISOString() });
    saveProfiles(collection);
    return clone(profile);
  }

  return Object.freeze({
    load: ensureProfiles,
    select(profileId) {
      const collection = ensureProfiles();
      if (!collection.profiles.some((profile) => profile.id === profileId)) {
        throw new Error(`Unknown robot profile: ${profileId}`);
      }
      collection.selectedProfileId = profileId;
      saveProfiles(collection);
    },
    create(name = `Robot ${ensureProfiles().profiles.length + 1}`) {
      const collection = ensureProfiles();
      const profile = {
        id: createId(),
        name,
        updatedAt: new Date().toISOString(),
        design: clone(createDefaultRobotDesign(scenario))
      };
      collection.profiles.push(profile);
      collection.selectedProfileId = profile.id;
      saveProfiles(collection);
      return clone(profile);
    },
    update: updateProfile,
    duplicate(profileId) {
      const collection = ensureProfiles();
      const source = collection.profiles.find((profile) => profile.id === profileId);
      if (!source) throw new Error(`Unknown robot profile: ${profileId}`);
      const copy = {
        id: createId(),
        name: `${source.name} copy`,
        updatedAt: new Date().toISOString(),
        design: clone(source.design)
      };
      collection.profiles.push(copy);
      collection.selectedProfileId = copy.id;
      saveProfiles(collection);
      return clone(copy);
    },
    remove(profileId) {
      const collection = ensureProfiles();
      if (collection.profiles.length <= 1) throw new Error("The last robot profile cannot be deleted");
      collection.profiles = collection.profiles.filter((profile) => profile.id !== profileId);
      if (collection.selectedProfileId === profileId) collection.selectedProfileId = collection.profiles[0].id;
      saveProfiles(collection);
    },
    validation(profile) {
      return tryNormalizeRobotDesign(scenario, profile.design);
    },
    importProfile(profileId) {
      const collection = ensureProfiles();
      const profile = collection.profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error(`Unknown robot profile: ${profileId}`);
      const design = normalizeRobotDesign(scenario, profile.design);
      const snapshot = {
        schemaVersion: 1,
        profileId: profile.id,
        profileName: profile.name,
        importedAt: new Date().toISOString(),
        design: clone(design)
      };
      storage.setItem(activeKey, JSON.stringify(snapshot));
      return snapshot;
    },
    active() {
      try {
        const snapshot = JSON.parse(storage.getItem(activeKey) || "null");
        if (!snapshot || snapshot.schemaVersion !== 1) return { snapshot: null, error: null };
        const upgraded = upgradeLegacyDefault(snapshot.design);
        const design = normalizeRobotDesign(scenario, upgraded);
        const normalizedSnapshot = { ...snapshot, design };
        if (upgraded !== snapshot.design) storage.setItem(activeKey, JSON.stringify(normalizedSnapshot));
        return { snapshot: normalizedSnapshot, error: null };
      } catch (error) {
        return { snapshot: null, error };
      }
    },
    clearActive() {
      storage.removeItem(activeKey);
    }
  });
}

export { createRobotProfileStore };
