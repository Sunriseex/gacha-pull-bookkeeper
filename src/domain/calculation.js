import {
  DEFAULT_RATES,
  PERMIT_KEYS,
  RESOURCE_KEYS,
  TIMED_PERMIT_KEYS,
} from "../config/gameConfig.js";
import { oroberylToPulls, safeNumber } from "./conversion.js";

const emptyResources = () =>
  RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

const normalizeTier = (tier) => {
  const normalized = Number(tier);
  if (normalized === 2 || normalized === 3) {
    return normalized;
  }
  return 1;
};

const resolveRates = (gameOrRates = {}) =>
  gameOrRates.rates && typeof gameOrRates.rates === "object"
    ? gameOrRates.rates
    : gameOrRates;

const resolvePermitKeys = (game = {}) => {
  const defaults = {
    pull: [
      PERMIT_KEYS.chartered,
      PERMIT_KEYS.firewalker,
      PERMIT_KEYS.messenger,
      PERMIT_KEYS.hues,
    ],
    timed: TIMED_PERMIT_KEYS,
  };
  const configured = game?.permitKeys ?? {};
  const pull = Array.isArray(configured.pull) && configured.pull.length
    ? configured.pull
    : defaults.pull;
  const timed = Array.isArray(configured.timed) && configured.timed.length
    ? configured.timed
    : defaults.timed;
  return {
    pull: pull.filter((key) => RESOURCE_KEYS.includes(key)),
    timed: timed.filter((key) => RESOURCE_KEYS.includes(key)),
  };
};

const isSourceEnabled = (source, options) => {
  const gate = source.gate ?? "always";
  const tier = normalizeTier(options.battlePassTier);
  let gateEnabled = false;

  if (gate === "always") {
    gateEnabled = true;
  } else if (gate === "monthly") {
    gateEnabled = Boolean(options.monthlySub);
  } else if (gate === "bp2") {
    gateEnabled = tier >= 2;
  } else if (gate === "bp3") {
    gateEnabled = tier >= 3;
  }

  if (!gateEnabled) {
    return false;
  }
  if (source.optionKey) {
    return Boolean(options[source.optionKey]);
  }
  return true;
};

const applyRounding = (value, rounding) => {
  if (rounding === "ceil") {
    return Math.ceil(value);
  }
  if (rounding === "round") {
    return Math.round(value);
  }
  return Math.floor(value);
};

const normalizeRewards = (input = {}) =>
  RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = safeNumber(input[key]);
    return acc;
  }, {});

const resolveBpCrateScale = (source, row, options) => {
  const model = source.bpCrateModel ?? {};
  const durationDays = Math.max(0, safeNumber(row.durationDays));
  const daysToLevel60Tier3 = Math.max(
    0,
    safeNumber(model.daysToLevel60Tier3 ?? 21),
  );
  const tier2XpBonus = safeNumber(model.tier2XpBonus ?? 0.03);
  const tier3XpBonus = safeNumber(model.tier3XpBonus ?? 0.06);
  const tier = normalizeTier(options.battlePassTier);

  const currentBonus =
    tier >= 3 ? tier3XpBonus : tier >= 2 ? tier2XpBonus : 0;
  const referenceBonus = tier3XpBonus;
  const referenceRemainingDays = Math.max(0, durationDays - daysToLevel60Tier3);
  if (referenceRemainingDays <= 0) {
    return 0;
  }

  const daysToLevel60Current = Math.ceil(
    daysToLevel60Tier3 * (1 + referenceBonus) / (1 + currentBonus),
  );
  const currentRemainingDays = Math.max(0, durationDays - daysToLevel60Current);
  const timeScale = currentRemainingDays / referenceRemainingDays;
  const xpScale = (1 + currentBonus) / (1 + referenceBonus);
  return Math.max(0, timeScale * xpScale);
};

const resolveSourceRewards = (source, row, options) => {
  const rewards = normalizeRewards(source.rewards);
  if (source.bpCrateModel?.type === "post_bp60_estimate") {
    const scale = resolveBpCrateScale(source, row, options);
    for (const key of RESOURCE_KEYS) {
      rewards[key] *= scale;
    }
  }

  for (const scaler of source.scalers ?? []) {
    if (scaler.type !== "per_duration") {
      continue;
    }
    const durationDays = Math.max(0, safeNumber(row.durationDays));
    const everyDays = Math.max(1, safeNumber(scaler.everyDays || 1));
    const unit = scaler.unit ?? "day";
    let cycles = 0;
    if (unit === "day") {
      cycles = durationDays;
    } else {
      cycles = applyRounding(durationDays / everyDays, scaler.rounding);
    }

    const scaled = normalizeRewards(scaler.rewards);
    for (const key of RESOURCE_KEYS) {
      rewards[key] += cycles * safeNumber(scaled[key]);
    }
  }

  return rewards;
};

const toSourceFormat = (row) => {
  if (Array.isArray(row.sources)) {
    return row.sources;
  }

  const battlePassTier2 = row.battlePass?.[2] ?? {};
  const battlePassTier3 = row.battlePass?.[3] ?? {};
  const bp2Cost = safeNumber(row.battlePassCosts?.[2]);

  return [
    {
      id: "base",
      label: "Base",
      gate: "always",
      rewards: row.base ?? {},
    },
    {
      id: "monthly",
      label: "Monthly Pass",
      gate: "monthly",
      rewards: row.monthlySub ?? {},
    },
    {
      id: "bp2",
      label: "Battle Pass Tier 2",
      gate: "bp2",
      rewards: battlePassTier2,
      costs: { origeometry: bp2Cost },
    },
    {
      id: "bp3",
      label: "Battle Pass Tier 3",
      gate: "bp3",
      rewards: battlePassTier3,
    },
  ];
};

const sumResources = (sources) => {
  const total = emptyResources();
  for (const source of sources) {
    for (const key of RESOURCE_KEYS) {
      total[key] += safeNumber(source.rewards?.[key]);
    }
  }
  return total;
};

const pullEligibleSources = (sources) =>
  sources.filter((source) => source.countInPulls !== false);

const resolveRate = (rates, key) => {
  const candidate = safeNumber(rates?.[key]);
  if (candidate > 0) {
    return candidate;
  }
  return safeNumber(DEFAULT_RATES[key]);
};

const sumCosts = (sources) => ({
  ...RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = sources.reduce(
      (sum, source) => sum + safeNumber(source.costs?.[key]),
      0,
    );
    return acc;
  }, {}),
});

const sourcePullValue = (source, permitKeys, rates) => {
  if (source.countInPulls === false) {
    return 0;
  }
  if (
    source.pulls !== undefined &&
    source.pulls !== null &&
    Number.isFinite(Number(source.pulls))
  ) {
    return Math.max(0, Number(source.pulls));
  }
  const rewards = source.rewards ?? {};
  const perPull = resolveRate(rates, "OROBERYL_PER_PULL");
  if (perPull <= 0) {
    return 0;
  }
  const currencyPulls = safeNumber(rewards.oroberyl) / perPull;
  const permitPulls = permitKeys.pull.reduce(
    (sum, key) => sum + safeNumber(rewards[key]),
    0,
  );

  return currencyPulls + permitPulls;
};

const sourceBreakdown = (sources, permitKeys, rates) =>
  sources.map((source) => ({
    id: source.id,
    label: source.label,
    value: sourcePullValue(source, permitKeys, rates),
  })).filter((source) => source.value > 0);

export const calculatePatchTotals = (row, options, gameOrRates = {}) => {
  const rates = resolveRates(gameOrRates);
  const permitKeys = resolvePermitKeys(gameOrRates);
  const enabledSources = toSourceFormat(row)
    .filter((source) => isSourceEnabled(source, options))
    .map((source) => ({
      ...source,
      rewards: resolveSourceRewards(source, row, options),
    }));
  const rewards = sumResources(enabledSources);
  const costs = sumCosts(enabledSources);
  const pullSources = pullEligibleSources(enabledSources);
  const pullRewards = sumResources(pullSources);
  const resolvedSourceBreakdown = sourceBreakdown(enabledSources, permitKeys, rates);

  const oroberyl = rewards.oroberyl;
  const origeometry = Math.max(0, rewards.origeometry - costs.origeometry);
  const oroberylFromOri =
    origeometry * resolveRate(rates, "ORIGEOMETRY_TO_OROBERYL");
  const perPull = resolveRate(rates, "OROBERYL_PER_PULL");
  const currencyPullsExact =
    perPull > 0 ? pullRewards.oroberyl / perPull : 0;
  const currencyPulls = oroberylToPulls(pullRewards.oroberyl, rates);

  const chartered = rewards.chartered;
  const basic = rewards.basic;
  const firewalker = rewards.firewalker;
  const messenger = rewards.messenger;
  const hues = rewards.hues;
  const arsenal = rewards.arsenal;

  const timedPermits = permitKeys.timed.reduce(
    (sum, key) => sum + safeNumber(rewards[key]),
    0,
  );
  const timedPermitsForPulls = permitKeys.timed.reduce(
    (sum, key) => sum + safeNumber(pullRewards[key]),
    0,
  );
  const permitPullsForPulls = permitKeys.pull.reduce(
    (sum, key) => sum + safeNumber(pullRewards[key]),
    0,
  );

  const totalCharacterPullsNoBasicExact = resolvedSourceBreakdown.reduce(
    (sum, source) => sum + source.value,
    0,
  );
  const totalCharacterPullsNoBasic =
    Math.floor(totalCharacterPullsNoBasicExact);

  return {
    patch: row.patch,
    oroberyl,
    origeometry,
    oroberylFromOri,
    currencyPullsExact,
    currencyPulls,
    chartered,
    basic,
    firewalker,
    messenger,
    hues,
    timedPermits,
    arsenal,
    totalCharacterPulls: totalCharacterPullsNoBasic,
    totalCharacterPullsNoBasicExact,
    totalCharacterPullsNoBasic,
    sourceBreakdown: resolvedSourceBreakdown,
  };
};

export const aggregateTotals = (rows, options, gameOrRates = {}) =>
  rows
    .map((row) => calculatePatchTotals(row, options, gameOrRates))
    .reduce(
      (acc, item) => {
        acc.patchCount += 1;
        acc.oroberyl += item.oroberyl;
        acc.origeometry += item.origeometry;
        acc.oroberylFromOri += item.oroberylFromOri;
        acc.currencyPullsExact += item.currencyPullsExact;
        acc.currencyPulls += item.currencyPulls;
        acc.chartered += item.chartered;
        acc.basic += item.basic;
        acc.firewalker += item.firewalker;
        acc.messenger += item.messenger;
        acc.hues += item.hues;
        acc.timedPermits += item.timedPermits;
        acc.arsenal += item.arsenal;
        acc.totalCharacterPulls += item.totalCharacterPulls;
        acc.totalCharacterPullsNoBasicExact += item.totalCharacterPullsNoBasicExact;
        acc.totalCharacterPullsNoBasic += item.totalCharacterPullsNoBasic;
        return acc;
      },
      {
        patchCount: 0,
        oroberyl: 0,
        origeometry: 0,
        oroberylFromOri: 0,
        currencyPullsExact: 0,
        currencyPulls: 0,
        chartered: 0,
        basic: 0,
        firewalker: 0,
        messenger: 0,
        hues: 0,
        timedPermits: 0,
        arsenal: 0,
        totalCharacterPulls: 0,
        totalCharacterPullsNoBasicExact: 0,
        totalCharacterPullsNoBasic: 0,
      },
    );

export const chartSeries = (rows, options, gameOrRates = {}) =>
  rows.map((row) => {
    const totals = calculatePatchTotals(row, options, gameOrRates);
    return {
      label: row.patch,
      total: totals.sourceBreakdown.reduce((sum, source) => sum + source.value, 0),
      segments: totals.sourceBreakdown,
    };
  });
