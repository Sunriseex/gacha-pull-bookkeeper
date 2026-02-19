import { safeNumber } from "./conversion.js";

const LEGACY_RESOURCE_KEYS = [
  "oroberyl",
  "origeometry",
  "chartered",
  "basic",
  "firewalker",
  "messenger",
  "hues",
  "arsenal",
];

const uniqStrings = (values = []) =>
  [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];

const positiveOr = (value, fallback) => {
  const numeric = safeNumber(value);
  if (numeric > 0) {
    return numeric;
  }
  return fallback;
};

export const createResourceRecord = (resourceKeys, initialValue = 0) => {
  const base = {};
  for (const key of resourceKeys) {
    base[key] = safeNumber(initialValue);
  }
  return base;
};

const normalizeAliases = (resourceKeys, aliases = {}) => {
  const normalized = {};
  for (const key of resourceKeys) {
    const configured = aliases[key];
    const aliasList = Array.isArray(configured)
      ? configured
      : typeof configured === "string"
        ? [configured]
        : [];
    normalized[key] = uniqStrings([key, ...aliasList]);
  }
  return normalized;
};

const buildAliasToCanonicalMap = (resourceAliases = {}) => {
  const aliasToCanonical = {};
  for (const [canonicalKey, aliases] of Object.entries(resourceAliases)) {
    for (const alias of aliases ?? []) {
      if (!aliasToCanonical[alias]) {
        aliasToCanonical[alias] = canonicalKey;
      }
    }
  }
  return aliasToCanonical;
};

export const getResourceAliasKeys = (economy = {}, key) => {
  if (!key) {
    return [];
  }
  const aliases = economy.resourceAliases?.[key];
  if (Array.isArray(aliases) && aliases.length) {
    return aliases;
  }
  return [key];
};

export const resolveResourceAmount = (record = {}, key, economy = {}) => {
  if (!key) {
    return 0;
  }

  const aliases = getResourceAliasKeys(economy, key);
  const hasCanonical = Object.prototype.hasOwnProperty.call(record, key);
  if (hasCanonical) {
    return safeNumber(record[key]);
  }

  return aliases.reduce((sum, alias) => {
    if (alias === key) {
      return sum;
    }
    return sum + safeNumber(record[alias]);
  }, 0);
};

export const getCanonicalResourceKeyByAlias = (economy = {}, key) =>
  economy.aliasToCanonical?.[key] ?? key;

export const resolveGameEconomy = (game = {}) => {
  const configured = game?.economy ?? {};
  const legacyRates = game?.rates ?? {};
  const legacyPermitKeys = game?.permitKeys ?? {};

  const baseCurrencyKey = configured.baseCurrencyKey || "oroberyl";
  const premiumCurrencyKey = configured.premiumCurrencyKey || "origeometry";
  const altCurrencyKey = configured.altCurrencyKey || "arsenal";

  const pullPermitKeys =
    Array.isArray(configured.pullPermitKeys) && configured.pullPermitKeys.length
      ? configured.pullPermitKeys
      : Array.isArray(legacyPermitKeys.pull) && legacyPermitKeys.pull.length
        ? legacyPermitKeys.pull
        : ["chartered", "firewalker", "messenger", "hues"];

  const timedPermitKeys =
    Array.isArray(configured.timedPermitKeys) && configured.timedPermitKeys.length
      ? configured.timedPermitKeys
      : Array.isArray(legacyPermitKeys.timed)
        ? legacyPermitKeys.timed
        : ["firewalker", "messenger", "hues"];

  const standardPermitKey = configured.standardPermitKey || "basic";

  const resourceKeys = uniqStrings([
    ...(Array.isArray(configured.resourceKeys) ? configured.resourceKeys : LEGACY_RESOURCE_KEYS),
    baseCurrencyKey,
    premiumCurrencyKey,
    altCurrencyKey,
    standardPermitKey,
    ...pullPermitKeys,
    ...timedPermitKeys,
  ]);

  const resourceAliases = normalizeAliases(resourceKeys, configured.resourceAliases ?? {});
  const aliasToCanonical = buildAliasToCanonicalMap(resourceAliases);

  return {
    resourceKeys,
    resourceAliases,
    aliasToCanonical,
    baseCurrencyKey,
    premiumCurrencyKey,
    altCurrencyKey,
    pullPermitKeys: uniqStrings(pullPermitKeys),
    timedPermitKeys: uniqStrings(timedPermitKeys),
    standardPermitKey,
    rates: {
      basePerPull: positiveOr(
        configured?.rates?.basePerPull,
        positiveOr(legacyRates?.OROBERYL_PER_PULL, 500),
      ),
      premiumToBase: positiveOr(
        configured?.rates?.premiumToBase,
        positiveOr(legacyRates?.ORIGEOMETRY_TO_OROBERYL, 75),
      ),
      premiumToAlt: positiveOr(
        configured?.rates?.premiumToAlt,
        positiveOr(legacyRates?.ORIGEOMETRY_TO_ARSENAL, 25),
      ),
    },
  };
};
