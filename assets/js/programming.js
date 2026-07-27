(function initializeSimulatorProgramming(global) {
  "use strict";

  const api = global.AlgoSimulator = global.AlgoSimulator || {};

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createInterpreter({ scenario, getColorValues, errorFactory }) {
    const colors = scenario.programming.colorOrder;
    const knownColors = new Set(colors.map((color) => color.name.toLowerCase()));
    const assignmentValues = scenario.programming.assignmentValues.map(String);
    const normalizedValues = new Map(
      assignmentValues.map((value) => [value.toLowerCase(), value])
    );
    const valuePattern = assignmentValues.map(escapeRegExp).join("|");
    const assignmentPattern = new RegExp(
      `^([a-z_][a-z0-9_]*)\\s*=\\s*(${valuePattern})$`,
      "i"
    );
    const comparisonPattern = new RegExp(
      `^([a-z_][a-z0-9_]*)\\s*(==|=|!=)\\s*(${valuePattern})$`,
      "i"
    );
    const firstColorPattern = new RegExp(
      `^\\[\\s*${escapeRegExp(colors[0].codeName)}\\s*:`,
      "i"
    );
    const dropTargets = new Set(scenario.programming.dropTargets.map(String));

    function fail(key, values) {
      throw errorFactory(key, values);
    }

    function stripLineComment(line) {
      return line.replace(/\/\/.*$/, "");
    }

    function isColorMapLine(line) {
      return firstColorPattern.test(stripLineComment(line).trim());
    }

    function findColorMapBlockEnd(lines, startIndex) {
      if (!/^colors\s*=\s*$/i.test(stripLineComment(lines[startIndex] || "").trim())) {
        return -1;
      }

      for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (/\]\s*$/.test(stripLineComment(lines[index]))) {
          return index;
        }
      }
      return -1;
    }

    function knownColorName(name) {
      return knownColors.has(name.toLowerCase());
    }

    function colorObjectId(colorName, parseState = null) {
      const normalizedName = colorName.toLowerCase();
      if (parseState?.assignedColorIds.has(normalizedName)) {
        return parseState.assignedColorIds.get(normalizedName);
      }
      return getColorValues().get(normalizedName) || "None";
    }

    function resolveColorName(name, scope, lineNumber) {
      const normalizedName = name.toLowerCase();
      if (knownColorName(normalizedName)) return normalizedName;
      if (scope[normalizedName]) return scope[normalizedName];
      fail("errors.unknownColorOrVariable", { line: lineNumber, name });
    }

    function parseColorList(source, lineNumber) {
      const raw = source.trim();
      if (/^colors$/i.test(raw)) {
        return colors.map((color) => color.name);
      }

      const names = raw.split(/\s*,\s*|\s+/).filter(Boolean);
      if (names.length === 0) {
        fail("errors.forExpectsColors", { line: lineNumber });
      }
      return names.map((name) => {
        if (!knownColorName(name)) {
          fail("errors.unknownColor", { line: lineNumber, name });
        }
        return name.toLowerCase();
      });
    }

    function createParseState() {
      return {
        assignedColorIds: new Map(colors.map((color) => [color.name, "None"]))
      };
    }

    function cloneParseState(parseState) {
      return { assignedColorIds: new Map(parseState.assignedColorIds) };
    }

    function commitParseState(target, source) {
      target.assignedColorIds.clear();
      for (const [colorName, objectId] of source.assignedColorIds) {
        target.assignedColorIds.set(colorName, objectId);
      }
    }

    function applyCommandToParseState(command, parseState) {
      if (command.type === "assign" && command.colorName !== null) {
        parseState.assignedColorIds.set(command.colorName, command.value);
      }
      if (command.type === "read_colors") {
        for (const [colorName, objectId] of getColorValues()) {
          parseState.assignedColorIds.set(colorName, objectId);
        }
      }
    }

    function isIdentifierCharacter(character) {
      return Boolean(character && /[a-z0-9_]/i.test(character));
    }

    function isWordOperatorAt(source, index, word) {
      return source.slice(index, index + word.length).toLowerCase() === word
        && !isIdentifierCharacter(source[index - 1])
        && !isIdentifierCharacter(source[index + word.length]);
    }

    function splitLogicalExpression(source, word, symbol) {
      const parts = [];
      let depth = 0;
      let start = 0;

      for (let i = 0; i < source.length; i += 1) {
        const character = source[i];
        if (character === "(") {
          depth += 1;
          continue;
        }
        if (character === ")") {
          depth -= 1;
          if (depth < 0) break;
          continue;
        }
        if (depth !== 0) continue;

        if (source.slice(i, i + symbol.length) === symbol) {
          parts.push(source.slice(start, i).trim());
          start = i + symbol.length;
          i = start - 1;
          continue;
        }
        if (isWordOperatorAt(source, i, word)) {
          parts.push(source.slice(start, i).trim());
          start = i + word.length;
          i = start - 1;
        }
      }

      if (parts.length === 0) return [source.trim()];
      parts.push(source.slice(start).trim());
      return parts;
    }

    function hasEnclosingParentheses(source) {
      if (!source.startsWith("(") || !source.endsWith(")")) return false;
      let depth = 0;
      for (let i = 0; i < source.length; i += 1) {
        if (source[i] === "(") depth += 1;
        else if (source[i] === ")") depth -= 1;
        if (depth === 0 && i < source.length - 1) return false;
      }
      return depth === 0;
    }

    function stripEnclosingParentheses(source) {
      let result = source.trim();
      while (hasEnclosingParentheses(result)) {
        result = result.slice(1, -1).trim();
      }
      return result;
    }

    function evaluateComparison(source, lineNumber, scope, parseState) {
      const match = stripEnclosingParentheses(source).match(comparisonPattern);
      if (!match) {
        fail("errors.ifExpectsComparison", { line: lineNumber });
      }
      const actual = colorObjectId(
        resolveColorName(match[1], scope, lineNumber),
        parseState
      );
      const expected = normalizedValues.get(match[3].toLowerCase());
      return match[2] === "!=" ? actual !== expected : actual === expected;
    }

    function evaluateAndExpression(source, lineNumber, scope, parseState) {
      const parts = splitLogicalExpression(
        stripEnclosingParentheses(source),
        "and",
        "&&"
      );
      if (parts.some((part) => part.length === 0)) {
        fail("errors.emptyAndCondition", { line: lineNumber });
      }
      return parts.every((part) => evaluateComparison(part, lineNumber, scope, parseState));
    }

    function evaluateIfCondition(source, lineNumber, scope, parseState) {
      const parts = splitLogicalExpression(
        stripEnclosingParentheses(source),
        "or",
        "||"
      );
      if (parts.some((part) => part.length === 0)) {
        fail("errors.emptyOrCondition", { line: lineNumber });
      }
      return parts.some((part) => evaluateAndExpression(part, lineNumber, scope, parseState));
    }

    function normalizeProgramLines(source) {
      const sourceLines = source.split(/\r?\n/);
      const normalized = [];

      for (let index = 0; index < sourceLines.length; index += 1) {
        const mapEnd = findColorMapBlockEnd(sourceLines, index);
        if (mapEnd >= index) {
          index = mapEnd;
          continue;
        }
        const text = stripLineComment(sourceLines[index]);
        if (isColorMapLine(text)) continue;
        normalized.push(...text
          .replace(/}\s*(?=(?:elif|else)\b)/gi, "}\n")
          .split("\n")
          .map((part) => ({ text: part, lineNumber: index + 1 })));
      }
      return normalized;
    }

    function resolveAssignmentColorName(name, scope, lineNumber) {
      const normalizedName = name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(scope, normalizedName)) {
        const resolvedName = scope[normalizedName];
        if (resolvedName === "__none__") return null;
        if (knownColorName(resolvedName)) return resolvedName;
      }
      if (knownColorName(normalizedName)) return normalizedName;
      fail("errors.unknownColorOrVariable", { line: lineNumber, name });
    }

    function parseCommandLine(raw, lineNumber, scope = {}) {
      const startPointMatch = raw.match(/^startPoint\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)$/i);
      if (startPointMatch) {
        return {
          type: "start_point",
          xMm: Number(startPointMatch[1]),
          yMm: Number(startPointMatch[2]),
          headingDeg: Number(startPointMatch[3]),
          line: lineNumber,
          label: raw
        };
      }
      if (/^startPoint\b/i.test(raw)) {
        fail("errors.startPointExpects", { line: lineNumber });
      }

      if (/^readColors\s*\(\s*\)$/i.test(raw)) {
        return { type: "read_colors", line: lineNumber, label: raw };
      }
      if (/^readColors\b/i.test(raw)) {
        fail("errors.readColorsExpectsNoArguments", { line: lineNumber });
      }

      const assignmentMatch = raw.match(assignmentPattern);
      if (assignmentMatch) {
        return {
          type: "assign",
          colorName: resolveAssignmentColorName(assignmentMatch[1], scope, lineNumber),
          value: normalizedValues.get(assignmentMatch[2].toLowerCase()),
          line: lineNumber,
          label: raw
        };
      }
      if (/^[a-z_][a-z0-9_]*\s*=/i.test(raw)) {
        fail("errors.assignmentExpectsValue", { line: lineNumber });
      }

      const turnOneMatch = raw.match(/^turn_one\s*\(\s*(left|right)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)$/i);
      if (turnOneMatch) {
        const value = Number(turnOneMatch[2]);
        if (!Number.isFinite(value)) fail("errors.invalidNumber", { line: lineNumber });
        return {
          type: "turn_one",
          movingWheel: turnOneMatch[1].toLowerCase(),
          value,
          line: lineNumber,
          label: raw
        };
      }
      if (/^turn_one\b/i.test(raw)) {
        fail("errors.turnOneExpects", { line: lineNumber });
      }

      const match = raw.match(/^([a-z]+)\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*\)$/i);
      if (!match) fail("errors.unknownSyntax", { line: lineNumber });
      const name = match[1].toLowerCase();
      const value = Number(match[2]);
      if (!Number.isFinite(value)) fail("errors.invalidNumber", { line: lineNumber });

      if (name === "straight") {
        return { type: "straight", value, line: lineNumber, label: raw };
      }
      if (name === "turn") {
        return { type: "turn", value, line: lineNumber, label: raw };
      }
      if (name === "movetoline") {
        if (value < 0 || value > 100) {
          fail("errors.moveToLineExpects", { line: lineNumber });
        }
        return { type: "move_to_line", threshold: value, line: lineNumber, label: raw };
      }
      if (name === "drop") {
        const id = String(value);
        if (!Number.isInteger(value) || !dropTargets.has(id)) {
          fail("errors.dropExpects", { line: lineNumber });
        }
        return { type: "drop", value: id, line: lineNumber, label: raw };
      }
      fail("errors.unknownCommand", { line: lineNumber, name });
    }

    function parseStartPointCommand(raw, lineNumber) {
      const command = parseCommandLine(raw, lineNumber);
      if (command.type !== "start_point") {
        fail("errors.startPointFirst", { line: lineNumber });
      }
      return command;
    }

    function parseIfChain(lines, ifIndex, ifMatch, scope, parseState) {
      const commands = [];
      let matched = evaluateIfCondition(ifMatch[1], lines[ifIndex].lineNumber, scope, parseState);
      let branchState = cloneParseState(parseState);
      let block = parseCommandBlock(lines, ifIndex + 1, true, scope, branchState);

      if (matched) {
        commands.push(...block.commands);
        commitParseState(parseState, branchState);
      }

      let nextIndex = block.nextIndex;
      while (nextIndex < lines.length) {
        const raw = lines[nextIndex].text.trim();
        const lineNumber = lines[nextIndex].lineNumber;
        if (!raw || isColorMapLine(raw)) {
          nextIndex += 1;
          continue;
        }
        const elifMatch = raw.match(/^(?:elif|else\s+if)\s+(.+?)\s*\{\s*$/i);
        if (elifMatch) {
          const conditionResult = evaluateIfCondition(elifMatch[1], lineNumber, scope, parseState);
          branchState = cloneParseState(parseState);
          block = parseCommandBlock(lines, nextIndex + 1, true, scope, branchState);
          if (!matched && conditionResult) {
            commands.push(...block.commands);
            commitParseState(parseState, branchState);
            matched = true;
          }
          nextIndex = block.nextIndex;
          continue;
        }
        if (/^else\s*\{\s*$/i.test(raw)) {
          branchState = cloneParseState(parseState);
          block = parseCommandBlock(lines, nextIndex + 1, true, scope, branchState);
          if (!matched) {
            commands.push(...block.commands);
            commitParseState(parseState, branchState);
          }
          nextIndex = block.nextIndex;
          break;
        }
        if (/^else\b/i.test(raw)) {
          fail("errors.elseSyntax", { line: lineNumber });
        }
        break;
      }
      return { commands, nextIndex };
    }

    function parseCommandBlock(lines, startIndex, needsClosingBrace, scope = {}, parseState = createParseState()) {
      const commands = [];
      let index = startIndex;

      while (index < lines.length) {
        const raw = lines[index].text.trim();
        const lineNumber = lines[index].lineNumber;
        if (!raw || isColorMapLine(raw)) {
          index += 1;
          continue;
        }
        if (raw === "}") {
          if (!needsClosingBrace) fail("errors.unexpectedBrace", { line: lineNumber });
          return { commands, nextIndex: index + 1 };
        }

        const forMatch = raw.match(/^for\s+([a-z_][a-z0-9_]*)\s+in\s+(.+?)\s*\{\s*$/i);
        if (forMatch) {
          const variableName = forMatch[1].toLowerCase();
          const loopColors = parseColorList(forMatch[2], lineNumber);
          let nextIndex = index + 1;
          for (let colorIndex = 0; colorIndex < loopColors.length; colorIndex += 1) {
            const colorName = loopColors[colorIndex];
            const block = parseCommandBlock(lines, index + 1, true, {
              ...scope,
              previous: loopColors[colorIndex - 1] || "__none__",
              previous_color: loopColors[colorIndex - 1] || "__none__",
              next: loopColors[colorIndex + 1] || "__none__",
              next_color: loopColors[colorIndex + 1] || "__none__",
              [variableName]: colorName
            }, parseState);
            commands.push(...block.commands);
            nextIndex = block.nextIndex;
          }
          index = nextIndex;
          continue;
        }
        if (/^for\b/i.test(raw)) fail("errors.forSyntax", { line: lineNumber });

        const ifMatch = raw.match(/^if\s+(.+?)\s*\{\s*$/i);
        if (ifMatch) {
          const chain = parseIfChain(lines, index, ifMatch, scope, parseState);
          commands.push(...chain.commands);
          index = chain.nextIndex;
          continue;
        }
        if (/^if\b/i.test(raw)) fail("errors.ifSyntax", { line: lineNumber });
        if (/^(?:elif|else\s+if|else)\b/i.test(raw)) {
          fail("errors.unmatchedBranch", {
            line: lineNumber,
            branch: raw.split(/\s+/)[0]
          });
        }

        const command = parseCommandLine(raw, lineNumber, scope);
        commands.push(command);
        applyCommandToParseState(command, parseState);
        index += 1;
      }

      if (needsClosingBrace) {
        fail("errors.missingBrace", {
          line: lines.length > 0 ? lines[lines.length - 1].lineNumber : 1
        });
      }
      return { commands, nextIndex: index };
    }

    function parseProgram(source) {
      const lines = normalizeProgramLines(source);
      const firstCommandLine = lines.find((line) => line.text.trim().length > 0);
      if (!firstCommandLine) fail("errors.startPointFirst", { line: 1 });
      parseStartPointCommand(firstCommandLine.text.trim(), firstCommandLine.lineNumber);
      const { commands } = parseCommandBlock(lines, 0, false, {}, createParseState());
      if (commands[0]?.type !== "start_point") {
        fail("errors.startPointFirst", { line: firstCommandLine.lineNumber });
      }
      const laterStartPoint = commands.find(
        (command, index) => command.type === "start_point" && index > 0
      );
      if (laterStartPoint) {
        fail("errors.startPointOnlyBeginning", { line: laterStartPoint.line });
      }
      return commands;
    }

    return Object.freeze({
      stripLineComment,
      isColorMapLine,
      findColorMapBlockEnd,
      parseCommandLine,
      parseStartPointCommand,
      parseProgram
    });
  }

  api.createInterpreter = createInterpreter;
})(globalThis);
