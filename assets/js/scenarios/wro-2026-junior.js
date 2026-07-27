import { registerScenario } from "../core/registry.js";

const DEFAULT_BODY_CELLS = Array.from({ length: 32 * 32 }, (_, index) => [
  index % 32,
  Math.floor(index / 32)
]);

    const BUILT_IN_PROGRAMS = Object.freeze([
      Object.freeze({
        id: "solution-1",
        readonly: true,
        labelKey: "tabs.solution1",
        code: `startPoint(340, 820, 0)

colors =
[Yellow: None,
Blue: None,
Black: None,
Green: None,
Red: None]
readColors()

// самый простой алгоритм

straight(800)
straight(-150)
turn(90)
straight(390)

for color in colors {
  if color == 1 {
    straight(130)
    turn(-90)
    straight(55)
    drop(1)
    straight(-130)
    straight(130)
    straight(-55)
    turn(90)
    straight(-130)

  } else if color == 2 {
    turn(-90)
    straight(140)
    drop(2)
    straight(-140)
    turn(90)

  } else if color == 3 {
    straight(130)
    turn(90)
    straight(-55)
    drop(3)
    straight(100)
    straight(-100)
    straight(55)
    turn(-90)
    straight(-130)

  } else if color == 4 {
    turn(90)
    straight(-140)
    drop(4)
    straight(140)
    turn(-90)
  }

  straight(-131)
}`
      }),
      Object.freeze({
        id: "solution-2",
        readonly: true,
        labelKey: "tabs.solution2",
        code: `startPoint(340, 820, 0)

colors =
[Yellow: None,
Blue: None,
Black: None,
Green: None,
Red: None]
readColors()

// может ставить одновременно два кубика

straight(800)
straight(-150)
turn(90)
straight(390)

for color in colors {
  if color == 1 {
    straight(130)
    turn(-90)
    straight(55)
    drop(1)
    straight(-130)
    straight(130)
    straight(-55)
    turn(90)
    straight(-130)

  } else if color == 2 {
    turn(-90)
    straight(140)
    drop(2)
    if next == 1 {
      drop(1)
      next = 5
    }
    straight(-140)
    turn(90)

  } else if color == 3 {
    straight(130)
    turn(90)
    straight(-55)
    drop(3)
    straight(100)
    straight(-100)
    straight(55)
    turn(-90)
    straight(-130)

  } else if color == 4 {
    turn(90)
    straight(-140)
    drop(4)
    if next == 3 {
      drop(3)
      next = 5
    }
    straight(140)
    turn(-90)
  }

  straight(-131)
}`
      }),
      Object.freeze({
        id: "solution-3",
        readonly: true,
        labelKey: "tabs.solution3",
        code: `startPoint(340, 820, 0)

colors =
[Yellow: None,
Blue: None,
Black: None,
Green: None,
Red: None]
readColors()

// может ставить одновременно два кубика и ставит кубики оптимальным способом

straight(800)
straight(-150)
turn(90)
straight(390)

for color in colors {
  if color == 1 {
    straight(130)
    turn(-90)

    if previous == None {
      straight(140)
      drop(1)
      straight(-140)

    } else {
      straight(55)
      drop(1)
      straight(-130)
      straight(130)
      straight(-55)
    }
    turn(90)
    straight(-130)

  } else if color == 2 {
    turn(-90)
    straight(140)
    drop(2)
    if next == 1 {
      drop(1)
      next = 5
    }
    straight(-140)
    turn(90)

  } else if color == 3 {
    straight(130)
    turn(90)

    if previous == None {
      straight(-140)
      drop(3)
      straight(140)

    } else {
      straight(-55)
      drop(3)
      straight(130)
      straight(-130)
      straight(55)
    }
    turn(-90)
    straight(-130)

  } else if color == 4 {
    turn(90)
    straight(-140)
    drop(4)
    if next == 3 {
      drop(3)
      next = 5
    }
    straight(140)
    turn(-90)
  }

  straight(-131)
}`
      }),
      Object.freeze({
        id: "solution-4",
        readonly: true,
        labelKey: "tabs.solution4",
        code: `startPoint(340, 820, 0)

colors =
[Yellow: None,
Blue: None,
Black: None,
Green: None,
Red: None]
readColors()

// выравнивание об стену перед тем как поставить

straight(800)
straight(-150)
turn(90)
straight(390)

for color in colors {
  if color == 1 {
    straight(130)
    turn(-90)

    if previous == None {
      straight(160)
      straight(-10)
      drop(1)
      straight(-140)

    } else {
      straight(55)
      drop(1)
      straight(-130)
      straight(130)
      straight(-55)
    }
    turn(90)
    straight(-130)

  } else if color == 2 {
    turn(-90)
    straight(160)
    straight(-10)
    drop(2)
    if next == 1 {
      drop(1)
      next = 5
    }
    straight(-140)
    turn(90)

  } else if color == 3 {
    straight(130)
    turn(90)

    if previous == None {
      straight(-160)
      straight(-10)
      drop(3)
      straight(140)

    } else {
      straight(-55)
      drop(3)
      straight(130)
      straight(-130)
      straight(55)
    }
    turn(-90)
    straight(-130)

  } else if color == 4 {
    turn(90)
    straight(-160)
    straight(-10)
    drop(4)
    if next == 3 {
      drop(3)
      next = 5
    }
    straight(140)
    turn(-90)
  }

  straight(-131)
}`
      }),
      Object.freeze({
        id: "alignment",
        readonly: true,
        labelKey: "tabs.alignment",
        code: `startPoint(340, 820, 0)

colors =
[Yellow: None,
Blue: None,
Black: None,
Green: None,
Red: None]
readColors()

// выравнивание по стене и линии

straight(800)
straight(-150)
turn(90)
moveToLine(10)`
      })
    ]);

    const translations = {
      ru: {
        tabs: {
          program: "Код {number}",
          solution1: "Решение 1",
          solution2: "Решение 2",
          solution3: "Решение 3",
          solution4: "Решение 4",
          alignment: "Выравнивание",
          newProgram: "Новый код",
          closeProgram: "Закрыть код {number}",
          readOnlySolution: "Готовое решение: изменение отключено"
        },
        meta: {
          title: "Симулятор поля WRO 2026 Junior"
        },
        color: {
          yellow: "Жёлтый",
          blue: "Синий",
          black: "Чёрный",
          green: "Зелёный",
          red: "Красный"
        },
        sensor: {
          black: "Чёрный",
          blue: "Синий",
          green: "Зелёный",
          yellow: "Жёлтый",
          red: "Красный",
          white: "Белый",
          unknown: "Неизвестно"
        },
        ui: {
          fieldCrop: "Фрагмент поля",
          robotSize: "Размер робота",
          reset: "Сброс",
          manualColors: "Цвета вручную",
          cube1: "Кубик 1",
          cube2: "Кубик 2",
          cube3: "Кубик 3",
          cube4: "Кубик 4",
          trail: "След",
          keyboardControl: "Управление клавишами",
          speed: "Скорость",
          accel: "Ускорение",
          turn: "Поворот",
          turnAccel: "Ускорение поворота",
          heading: "Курс",
          colorSensor: "Датчик цвета",
          sensorColor: "Цвет",
          reflectedLight: "Отражённый свет",
          pseudocode: "Псевдокод",
          run: "Запуск",
          pause: "Пауза",
          russian: "Русский",
          english: "English"
        },
        aria: {
          programTabs: "Вкладки программ",
          newProgram: "Новый код",
          simulationControls: "Управление симуляцией",
          dropArtefacts: "Сброс артефактов",
          testColors: "Тестовые цвета",
          simulationField: "Поле симуляции",
          pseudocodeEditor: "Редактор псевдокода",
          language: "Язык интерфейса",
          colorSensor: "Датчик цвета"
        },
        help: {
          comment: "Комментарий до конца строки; он не выполняется.",
          summary: "Справочник псевдокода",
          movement: "Движение",
          startPoint: "Стартовая поза: X, Y в мм и угол в градусах.",
          straight: "Вперед на мм; отрицательное значение едет назад.",
          moveToLine: "Едет вперёд, пока отражённый свет не станет меньше порога.",
          turn: "Поворот на месте; положительный угол вправо.",
          turnOne: "Поворот вокруг левого или правого колеса.",
          drop: "Оставить кубик с номером от 1 до 4.",
          conditions: "Условия",
          if: "Сравнение цвета с номером кубика или None.",
          elif: "Следующая ветка условия; также работает else if.",
          logic: "Объединяют проверки: color == 2 and next == 1.",
          else: "Ветка, если предыдущие условия не подошли.",
          loopColors: "Цикл и цвета",
          readColors: "Заполняет блок colors текущими цветами кубиков.",
          for: "Перебор: Yellow, Blue, Black, Green, Red.",
          variables: "Текущий, следующий и предыдущий цвет внутри цикла.",
          assign: "Присваивание значения 1..5 или None; до readColors() все цвета равны None."
        },
        status: {
          ready: "Готово",
          paused: "Пауза",
          done: "Готово",
          error: "Ошибка: {message}",
          runningLine: "Строка {line}: {label}",
          codeAutosaveUnavailable: "Автосохранение кода недоступно",
          colorSettingsAutosaveUnavailable: "Автосохранение настроек цветов недоступно",
          fieldImageLoadFailed: "Не удалось загрузить изображение поля"
        },
        errors: {
          unknownColorOrVariable: "Строка {line}: неизвестный цвет или переменная \"{name}\"",
          forExpectsColors: "Строка {line}: for ожидает colors",
          unknownColor: "Строка {line}: неизвестный цвет \"{name}\"",
          ifExpectsComparison: "Строка {line}: if ожидает Color == 1..5, Color == None, and/or",
          emptyAndCondition: "Строка {line}: пустое условие and",
          emptyOrCondition: "Строка {line}: пустое условие or",
          startPointExpects: "Строка {line}: startPoint ожидает x, y, heading",
          readColorsExpectsNoArguments: "Строка {line}: readColors не принимает аргументы",
          assignmentExpectsValue: "Строка {line}: присваивание ожидает Color = 1..5 или Color = None",
          invalidNumber: "Строка {line}: неверное число",
          turnOneExpects: "Строка {line}: turn_one ожидает left/right и угол",
          moveToLineExpects: "Строка {line}: moveToLine ожидает значение от 0 до 100",
          unknownSyntax: "Строка {line}: неизвестный синтаксис",
          dropExpects: "Строка {line}: drop ожидает 1..4",
          unknownCommand: "Строка {line}: неизвестная команда \"{name}\"",
          startPointFirst: "Строка {line}: startPoint должен быть первой командой",
          startPointOnlyBeginning: "Строка {line}: startPoint разрешен только в начале",
          unexpectedBrace: "Строка {line}: неожиданная }",
          forSyntax: "Строка {line}: for ожидает \"for color in colors {\"",
          ifSyntax: "Строка {line}: if ожидает \"if Color == 1 {\"",
          unmatchedBranch: "Строка {line}: {branch} без соответствующего if",
          missingBrace: "Строка {line}: пропущена }",
          elseSyntax: "Строка {line}: else ожидает \"else {\" или \"else if Color == 1 {\""
        }
      },
      en: {
        tabs: {
          program: "Code {number}",
          solution1: "Solution 1",
          solution2: "Solution 2",
          solution3: "Solution 3",
          solution4: "Solution 4",
          alignment: "Alignment",
          newProgram: "New code",
          closeProgram: "Close code {number}",
          readOnlySolution: "Built-in solution: editing is disabled"
        },
        meta: {
          title: "WRO 2026 Junior Field Simulator"
        },
        color: {
          yellow: "Yellow",
          blue: "Blue",
          black: "Black",
          green: "Green",
          red: "Red"
        },
        sensor: {
          black: "Black",
          blue: "Blue",
          green: "Green",
          yellow: "Yellow",
          red: "Red",
          white: "White",
          unknown: "Unknown"
        },
        ui: {
          fieldCrop: "Field crop",
          robotSize: "Robot size",
          reset: "Reset",
          manualColors: "Manual colors",
          cube1: "Cube 1",
          cube2: "Cube 2",
          cube3: "Cube 3",
          cube4: "Cube 4",
          trail: "Trail",
          keyboardControl: "Keyboard control",
          speed: "Speed",
          accel: "Accel",
          turn: "Turn",
          turnAccel: "Turn accel",
          heading: "Heading",
          colorSensor: "Color sensor",
          sensorColor: "Color",
          reflectedLight: "Reflected light",
          pseudocode: "Pseudocode",
          run: "Run",
          pause: "Pause",
          russian: "Russian",
          english: "English"
        },
        aria: {
          programTabs: "Program tabs",
          newProgram: "New code",
          simulationControls: "Simulation controls",
          dropArtefacts: "Drop artefacts",
          testColors: "Test colors",
          simulationField: "Simulation field",
          pseudocodeEditor: "Pseudocode editor",
          language: "Interface language",
          colorSensor: "Color sensor"
        },
        help: {
          comment: "Comment to the end of the line; it is not executed.",
          summary: "Pseudocode reference",
          movement: "Motion",
          startPoint: "Start pose: X and Y in mm, heading in degrees.",
          straight: "Move in mm; a negative value moves backward.",
          moveToLine: "Moves forward until reflected light becomes lower than the threshold.",
          turn: "Turn in place; a positive angle turns right.",
          turnOne: "Turn around the left or right wheel.",
          drop: "Leave cube number 1 through 4.",
          conditions: "Conditions",
          if: "Compare a color with a cube number or None.",
          elif: "Next condition branch; else if also works.",
          logic: "Combine checks: color == 2 and next == 1.",
          else: "Branch used when previous conditions do not match.",
          loopColors: "Loop and colors",
          readColors: "Fills the colors block with the current cube colors.",
          for: "Iterates: Yellow, Blue, Black, Green, Red.",
          variables: "Current, next, and previous color within the loop.",
          assign: "Assign 1..5 or None; all colors are None before readColors()."
        },
        status: {
          ready: "Ready",
          paused: "Paused",
          done: "Done",
          error: "Error: {message}",
          runningLine: "Line {line}: {label}",
          codeAutosaveUnavailable: "Code autosave unavailable",
          colorSettingsAutosaveUnavailable: "Color settings autosave unavailable",
          fieldImageLoadFailed: "Field image failed to load"
        },
        errors: {
          unknownColorOrVariable: "Line {line}: unknown color or variable \"{name}\"",
          forExpectsColors: "Line {line}: for expects colors",
          unknownColor: "Line {line}: unknown color \"{name}\"",
          ifExpectsComparison: "Line {line}: if expects Color == 1..5, Color == None, and/or",
          emptyAndCondition: "Line {line}: if has empty and condition",
          emptyOrCondition: "Line {line}: if has empty or condition",
          startPointExpects: "Line {line}: startPoint expects x, y, heading",
          readColorsExpectsNoArguments: "Line {line}: readColors expects no arguments",
          assignmentExpectsValue: "Line {line}: assignment expects Color = 1..5 or Color = None",
          invalidNumber: "Line {line}: invalid number",
          turnOneExpects: "Line {line}: turn_one expects left/right and angle",
          moveToLineExpects: "Line {line}: moveToLine expects a value from 0 to 100",
          unknownSyntax: "Line {line}: unknown syntax",
          dropExpects: "Line {line}: drop expects 1..4",
          unknownCommand: "Line {line}: unknown command \"{name}\"",
          startPointFirst: "Line {line}: startPoint must be the first command",
          startPointOnlyBeginning: "Line {line}: startPoint is allowed only at the beginning",
          unexpectedBrace: "Line {line}: unexpected }",
          forSyntax: "Line {line}: for expects \"for color in colors {\"",
          ifSyntax: "Line {line}: if expects \"if Color == 1 {\"",
          unmatchedBranch: "Line {line}: {branch} without matching if",
          missingBrace: "Line {line}: missing }",
          elseSyntax: "Line {line}: else expects \"else {\" or \"else if Color == 1 {\""
        }
      }
    };

  const wro2026JuniorScenario = registerScenario({
    schemaVersion: 1,
    id: "wro-2026-junior",
    meta: {
      title: {
        ru: "Симулятор поля WRO 2026 Junior",
        en: "WRO 2026 Junior Field Simulator"
      },
      shortTitle: "WRO 2026 Junior"
    },
    storage: {
      legacyProgram: "wro2026JuniorPseudocode",
      programTabs: "wro2026JuniorPseudocodeTabs",
      colorSettings: "wro2026JuniorColorSettings",
      language: "wro2026JuniorLanguage",
      robotProfiles: "wro2026JuniorRobotProfilesV1",
      activeRobotDesign: "wro2026JuniorActiveRobotDesignV1"
    },
    world: {
      widthMm: 1000,
      heightMm: 1000,
      backgroundSrc: "assets/field-crop-1000.png",
      sensorMapSrc: "assets/field-crop-1000.png",
      boundaries: [
        {
          id: "top",
          type: "rectangle",
          xMm: 500,
          yMm: -10,
          widthMm: 3000,
          heightMm: 24,
          safetyLimitMm: -2,
          friction: 1
        }
      ]
    },
    robot: {
      body: {
        type: "grid"
      },
      drive: {
        type: "differential",
        wheelDiameterMm: 62.4,
        wheelWidthMm: 24,
        reverseScale: 0.72,
        lateralGrip: 0.62
      },
      startPose: {
        xMm: 340,
        yMm: 820,
        headingDeg: 0
      },
      physics: {
        density: 0.02,
        friction: 0.7,
        staticFriction: 1,
        airFriction: 0.04
      },
      editor: {
        grid: {
          columns: 32,
          rows: 32,
          cellSizeMm: 8,
          originNodeColumn: 16,
          originNodeRow: 16
        },
        sensorTypes: {
          color: {
            labelKey: "ui.colorSensor",
            widthMm: 24,
            depthMm: 24,
            faceSizeMm: 16,
            lensRadiusMm: 5,
            palette: [
            { name: "black", red: 17, green: 24, blue: 39, swatch: "#111827" },
            { name: "blue", red: 37, green: 99, blue: 235, swatch: "#2563eb" },
            { name: "green", red: 22, green: 163, blue: 74, swatch: "#16a34a" },
            { name: "yellow", red: 250, green: 204, blue: 21, swatch: "#facc15" },
            { name: "red", red: 220, green: 38, blue: 38, swatch: "#dc2626" },
            { name: "white", red: 255, green: 255, blue: 255, swatch: "#ffffff" }
            ]
          }
        }
      },
      defaultDesign: {
        schemaVersion: 1,
        scenarioId: "wro-2026-junior",
        bodyCells: DEFAULT_BODY_CELLS,
        wheels: [
          { id: "left", nodeColumn: 6, nodeRow: 16 },
          { id: "right", nodeColumn: 26, nodeRow: 16 }
        ],
        sensors: [
          { id: "front-color", type: "color", nodeColumn: 16, nodeRow: 4 }
        ],
        primarySensorId: "front-color",
        attachments: [
          { objectId: "1", nodeColumn: 8, nodeRow: 8 },
          { objectId: "2", nodeColumn: 24, nodeRow: 8 },
          { objectId: "3", nodeColumn: 24, nodeRow: 24 },
          { objectId: "4", nodeColumn: 8, nodeRow: 24 }
        ]
      }
    },
    physics: {
      stepMs: 1000 / 60,
      positionIterations: 16,
      velocityIterations: 8,
      constraintIterations: 4
    },
    controls: {
      linear: {
        speed: { min: 80, max: 800, step: 10, value: 500 },
        acceleration: { min: 200, max: 3000, step: 100, value: 1400 }
      },
      turn: {
        speed: { min: 60, max: 540, step: 10, value: 240 },
        acceleration: { min: 120, max: 1800, step: 60, value: 720 }
      }
    },
    objects: {
      palette: [
        { name: "red", color: "#dc2626", textColor: "#ffffff" },
        { name: "blue", color: "#2563eb", textColor: "#ffffff" },
        { name: "green", color: "#16a34a", textColor: "#ffffff" },
        { name: "black", color: "#111827", textColor: "#ffffff" },
        { name: "yellow", color: "#facc15", textColor: "#111827" }
      ],
      visual: {
        sizeMm: 48,
        coreSizeMm: 32,
        sideTabWidthMm: 8
      },
      physics: {
        density: 0.0015,
        friction: 0.8,
        staticFriction: 1,
        airFriction: 0.08,
        groundDecelerationMmS2: 1800,
        staticSpeedMmS: 25,
        angularDamping: 0.35
      },
      instances: [
        { id: "1", type: "numbered-artifact", localX: -62, localY: -62 },
        { id: "2", type: "numbered-artifact", localX: 62, localY: -62 },
        { id: "3", type: "numbered-artifact", localX: 62, localY: 62 },
        { id: "4", type: "numbered-artifact", localX: -62, localY: 62 }
      ]
    },
    programming: {
      colorOrder: [
        { name: "yellow", codeName: "Yellow", labelKey: "color.yellow" },
        { name: "blue", codeName: "Blue", labelKey: "color.blue" },
        { name: "black", codeName: "Black", labelKey: "color.black" },
        { name: "green", codeName: "Green", labelKey: "color.green" },
        { name: "red", codeName: "Red", labelKey: "color.red" }
      ],
      assignmentValues: ["1", "2", "3", "4", "5", "None"],
      dropTargets: ["1", "2", "3", "4"],
      lineSensorId: "front-color",
      builtInPrograms: BUILT_IN_PROGRAMS
    },
    translations
  });

export { wro2026JuniorScenario };
