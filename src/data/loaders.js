import { safeNumber } from "../domain/conversion.js";

const NUMERIC_KEYS = [
  "oroberyl",
  "origeometry",
  "chartered",
  "basic",
  "firewalker",
  "messenger",
  "hues",
  "arsenal",
];

const makeValueGroup = (source, prefix = "") =>
  NUMERIC_KEYS.reduce((acc, key) => {
    acc[key] = safeNumber(source[`${prefix}${key}`]);
    return acc;
  }, {});

const ensureRowShape = (raw) => {
  const patch = String(raw.patch ?? "").trim();
  if (!patch) {
    return null;
  }

  const hasNested = raw.base && raw.battlePass;
  if (hasNested) {
    return {
      patch,
      base: makeValueGroup(raw.base),
      monthlySub: makeValueGroup(raw.monthlySub ?? {}),
      battlePass: {
        1: makeValueGroup(raw.battlePass?.[1] ?? {}),
        2: makeValueGroup(raw.battlePass?.[2] ?? {}),
        3: makeValueGroup(raw.battlePass?.[3] ?? {}),
      },
    };
  }

  return {
    patch,
    base: makeValueGroup(raw),
    monthlySub: makeValueGroup(raw, "monthly_"),
    battlePass: {
      1: makeValueGroup(raw, "bp1_"),
      2: makeValueGroup(raw, "bp2_"),
      3: makeValueGroup(raw, "bp3_"),
    },
  };
};

const parseCsvLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const parseCsv = (text) => {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, idx) => {
      row[header] = values[idx] ?? "";
      return row;
    }, {});
  });
};

const asPatchList = (items) =>
  items
    .map((raw) => ensureRowShape(raw))
    .filter((row) => row !== null);

export const loadLocalJson = async (
  url = "./src/data/patches.sample.json",
) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить JSON: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("JSON должен быть массивом патчей");
  }
  return asPatchList(data);
};

export const loadSheetCsv = async (csvUrl) => {
  if (!csvUrl) {
    throw new Error("Укажите CSV URL Google Sheets");
  }

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить CSV: ${response.status}`);
  }

  const text = await response.text();
  const rows = parseCsv(text);
  return asPatchList(rows);
};
