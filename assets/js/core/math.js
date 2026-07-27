  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function rampToward(current, target, maxDelta) {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return current;
  }

  function acceleratedStep(remaining, currentSpeed, maxSpeed, acceleration, dtSeconds) {
    if (remaining <= 0 || dtSeconds <= 0) {
      return { step: 0, speed: 0 };
    }
    const safeAcceleration = Math.max(1, acceleration);
    const stopSpeed = Math.sqrt(2 * safeAcceleration * remaining);
    const targetSpeed = Math.min(maxSpeed, stopSpeed);
    const nextSpeed = rampToward(currentSpeed, targetSpeed, safeAcceleration * dtSeconds);
    const averageSpeed = (currentSpeed + nextSpeed) / 2;
    const step = Math.min(remaining, Math.max(0, averageSpeed * dtSeconds));
    return { step, speed: step >= remaining - 0.001 ? 0 : nextSpeed };
  }

  function normalizeAngle(rad) {
    let value = rad;
    while (value <= -Math.PI) value += Math.PI * 2;
    while (value > Math.PI) value -= Math.PI * 2;
    return value;
  }

  function localToWorld(pose, localX, localY) {
    const cos = Math.cos(pose.headingRad);
    const sin = Math.sin(pose.headingRad);
    return {
      xMm: pose.xMm + localX * cos - localY * sin,
      yMm: pose.yMm + localX * sin + localY * cos
    };
  }

export {
  acceleratedStep,
  clamp,
  localToWorld,
  normalizeAngle,
  rampToward
};
