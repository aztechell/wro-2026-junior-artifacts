  function createSimulationModel(scenario, robotDefinition = scenario.robot) {
    const robot = {
      xMm: scenario.robot.startPose.xMm,
      yMm: scenario.robot.startPose.yMm,
      headingRad: scenario.robot.startPose.headingDeg * Math.PI / 180
    };
    const objects = scenario.objects.instances.map((object) => ({
      ...object,
      dropped: false,
      xMm: null,
      yMm: null,
      headingRad: 0,
      body: null,
      pendingRelease: false
    }));
    const configuredSensors = robotDefinition.sensors || scenario.robot.defaultDesign?.sensors || [];
    const sensors = new Map(
      configuredSensors.map((sensor) => [
        sensor.id,
        {
          color: "unknown",
          brightness: null,
          swatch: "#98a2b3"
        }
      ])
    );

    return {
      robot,
      objects,
      sensors,
      keys: new Set(),
      trail: [],
      program: {
        running: false,
        paused: false,
        commands: [],
        index: 0,
        active: null
      }
    };
  }

  function resetObjectState(object) {
    object.dropped = false;
    object.xMm = null;
    object.yMm = null;
    object.headingRad = 0;
    object.body = null;
    object.pendingRelease = false;
  }

export {
  createSimulationModel,
  resetObjectState
};
