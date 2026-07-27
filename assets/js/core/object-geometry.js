function materializeNumberedObjectVisual(visual) {
  const bodySizeMm = visual.sizeMm;
  const coreSizeMm = visual.coreSizeMm;
  const sideTabWidthMm = visual.sideTabWidthMm;
  const halfBodyMm = bodySizeMm / 2;
  const halfCoreMm = coreSizeMm / 2;
  const rectangles = [
    {
      kind: "left-tab",
      x: -halfBodyMm - sideTabWidthMm / 2,
      y: 0,
      width: sideTabWidthMm,
      height: coreSizeMm
    },
    {
      kind: "right-tab",
      x: halfBodyMm + sideTabWidthMm / 2,
      y: 0,
      width: sideTabWidthMm,
      height: coreSizeMm
    },
    {
      kind: "body",
      x: 0,
      y: 0,
      width: bodySizeMm,
      height: bodySizeMm
    },
    {
      kind: "panel",
      x: 0,
      y: 0,
      width: coreSizeMm,
      height: coreSizeMm
    }
  ].map(Object.freeze);

  return Object.freeze({
    bodySizeMm,
    coreSizeMm,
    sideTabWidthMm,
    widthMm: bodySizeMm + sideTabWidthMm * 2,
    heightMm: bodySizeMm,
    rectangles: Object.freeze(rectangles)
  });
}

export { materializeNumberedObjectVisual };
