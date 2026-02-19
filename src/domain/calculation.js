import { safeNumber } from "./conversion.js";
import {
  createResourceRecord,
  getCanonicalResourceKeyByAlias,
  resolveGameEconomy,
  resolveResourceAmount,
} from "./economy.js";

const normalizeTier = (tier) => {
  const normalized = Number(tier);
  if (normalized === 2 || normalized === 3) {
    return normalized;
  }
  return 1;
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

const normalizeRewards = (input = {}, economy) => {
  const normalized = createResourceRecord(economy.resourceKeys, 0);
  for (const key of economy.resourceKeys) {
    normalized[key] = resolveResourceAmount(input, key, economy);
  }
  return normalized;
};

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
    (daysToLevel60Tier3 * (1 + referenceBonus)) / (1 + currentBonus),
  );
  const currentRemainingDays = Math.max(0, durationDays - daysToLevel60Current);
  const timeScale = currentRemainingDays / referenceRemainingDays;
  const xpScale = (1 + currentBonus) / (1 + referenceBonus);
  return Math.max(0, timeScale * xpScale);
};

const resolveSourceRewards = (source, row, options, economy) => {
  const rewards = normalizeRewards(source.rewards, economy);
  if (source.bpCrateModel?.type === "post_bp60_estimate") {
    const scale = resolveBpCrateScale(source, row, options);
    for (const key of economy.resourceKeys) {
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

    const scaled = normalizeRewards(scaler.rewards, economy);
    for (const key of economy.resourceKeys) {
      rewards[key] += cycles * safeNumber(scaled[key]);
    }
  }

  return rewards;
};

const makeRewardGroup = (source = {}, economy, prefix = "") =>
  economy.resourceKeys.reduce((acc, key) => {
    const prefixedKey = `${prefix}${key}`;
    if (Object.prototype.hasOwnProperty.call(source, prefixedKey)) {
      acc[key] = safeNumber(source[prefixedKey]);
      return acc;
    }

    acc[key] = resolveResourceAmount(source, key, economy);
    return acc;
  }, createResourceRecord(economy.resourceKeys, 0));

const toSourceFormat = (row, economy) => {
  if (Array.isArray(row.sources)) {
    return row.sources;
  }

  const battlePassTier2 = row.battlePass?.[2] ?? {};
  const battlePassTier3 = row.battlePass?.[3] ?? {};
  const bp2Cost = safeNumber(row.battlePassCosts?.[2]);

  const premiumCost = createResourceRecord(economy.resourceKeys, 0);
  premiumCost[economy.premiumCurrencyKey] = bp2Cost;

  return [
    {
      id: "base",
      label: "Base",
      gate: "always",
      rewards: makeRewardGroup(row.base ?? {}, economy),
    },
    {
      id: "monthly",
      label: "Monthly Pass",
      gate: "monthly",
      rewards: makeRewardGroup(row.monthlySub ?? {}, economy),
    },
    {
      id: "bp2",
      label: "Battle Pass Tier 2",
      gate: "bp2",
      rewards: makeRewardGroup(battlePassTier2, economy),
      costs: premiumCost,
    },
    {
      id: "bp3",
      label: "Battle Pass Tier 3",
      gate: "bp3",
      rewards: makeRewardGroup(battlePassTier3, economy),
    },
  ];
};

const sumResources = (sources, economy) => {
  const total = createResourceRecord(economy.resourceKeys, 0);
  for (const source of sources) {
    for (const key of economy.resourceKeys) {
      total[key] += resolveResourceAmount(source.rewards, key, economy);
    }
  }
  return total;
};

const pullEligibleSources = (sources) =>
  sources.filter((source) => source.countInPulls !== false);

const sumCosts = (sources, economy) =>
  economy.resourceKeys.reduce((acc, key) => {
    acc[key] = sources.reduce(
      (sum, source) => sum + resolveResourceAmount(source.costs, key, economy),
      0,
    );
    return acc;
  }, createResourceRecord(economy.resourceKeys, 0));

const sourcePullValue = (source, economy) => {
  if (source.countInPulls === false) {
    return 0;
  }
  if (
    source.pulls !== undefined &&
    source.pulls !== null &&
    Number.isFinite(Number(source.pulls))
  ) {
    return Number(source.pulls);
  }

  const rewards = source.rewards ?? {};
  const basePerPull = safeNumber(economy.rates.basePerPull);
  if (basePerPull <= 0) {
    return 0;
  }

  const currencyPulls = resolveResourceAmount(rewards, economy.baseCurrencyKey, economy) / basePerPull;
  const permitPulls = economy.pullPermitKeys.reduce(
    (sum, key) => sum + resolveResourceAmount(rewards, key, economy),
    0,
  );

  return currencyPulls + permitPulls;
};

const normalizeBreakdownForStackedChart = (segments) => {
  const normalized = segments.map((segment) => ({ ...segment }));
  const negativeTotal = normalized
    .filter((segment) => segment.value < 0)
    .reduce((sum, segment) => sum + Math.abs(segment.value), 0);

  // Keep totals consistent even when source data includes corrective negative pulls.
  if (negativeTotal > 0) {
    let remaining = negativeTotal;
    const positiveIndices = normalized
      .map((segment, idx) => ({ idx, value: segment.value }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((entry) => entry.idx);

    for (const idx of positiveIndices) {
      if (remaining <= 0) {
        break;
      }
      const current = normalized[idx].value;
      const deduction = Math.min(current, remaining);
      normalized[idx].value = current - deduction;
      remaining -= deduction;
    }
  }

  return normalized.filter((segment) => segment.value > 0);
};

const sourceBreakdown = (sources, economy) =>
  normalizeBreakdownForStackedChart(
    sources.map((source) => ({
      id: source.id,
      label: source.label,
      value: sourcePullValue(source, economy),
    })),
  );

const legacyValue = (bucket, key, economy) => {
  if (Object.prototype.hasOwnProperty.call(bucket ?? {}, key)) {
    return safeNumber(bucket[key]);
  }

  const canonicalKey = getCanonicalResourceKeyByAlias(economy, key);
  if (Object.prototype.hasOwnProperty.call(bucket ?? {}, canonicalKey)) {
    return safeNumber(bucket[canonicalKey]);
  }

  return 0;
};

export const calculatePatchTotals = (row, options, game = {}) => {
  const economy = resolveGameEconomy(game);
  const enabledSources = toSourceFormat(row, economy)
    .filter((source) => isSourceEnabled(source, options))
    .map((source) => ({
      ...source,
      rewards: resolveSourceRewards(source, row, options, economy),
    }));

  const rewards = sumResources(enabledSources, economy);
  const costs = sumCosts(enabledSources, economy);
  const pullSources = pullEligibleSources(enabledSources);
  const pullRewards = sumResources(pullSources, economy);
  const resolvedSourceBreakdown = sourceBreakdown(enabledSources, economy);

  const baseCurrencyAmount = resolveResourceAmount(rewards, economy.baseCurrencyKey, economy);
  const premiumCurrencyAmount = Math.max(
    0,
    resolveResourceAmount(rewards, economy.premiumCurrencyKey, economy) -
      resolveResourceAmount(costs, economy.premiumCurrencyKey, economy),
  );
  const altCurrencyAmount = resolveResourceAmount(rewards, economy.altCurrencyKey, economy);

  const premiumAsBaseAmount = premiumCurrencyAmount * safeNumber(economy.rates.premiumToBase);
  const premiumAsAltAmount = premiumCurrencyAmount * safeNumber(economy.rates.premiumToAlt);

  const basePerPull = safeNumber(economy.rates.basePerPull);
  const currencyPullsExact =
    basePerPull > 0
      ? resolveResourceAmount(pullRewards, economy.baseCurrencyKey, economy) / basePerPull
      : 0;
  const currencyPulls = Math.floor(currencyPullsExact);

  const timedPermits = economy.timedPermitKeys.reduce(
    (sum, key) => sum + resolveResourceAmount(rewards, key, economy),
    0,
  );

  const totalCharacterPullsNoBasicExact = resolvedSourceBreakdown.reduce(
    (sum, source) => sum + source.value,
    0,
  );
  const totalCharacterPullsNoBasic = Math.floor(totalCharacterPullsNoBasicExact);

  return {
    patch: row.patch,
    economy,
    resources: rewards,
    costs,
    pullResources: pullRewards,
    baseCurrencyAmount,
    premiumCurrencyAmount,
    altCurrencyAmount,
    premiumAsBaseAmount,
    premiumAsAltAmount,
    currencyPullsExact,
    currencyPulls,
    timedPermits,
    totalCharacterPulls: totalCharacterPullsNoBasic,
    totalCharacterPullsNoBasicExact,
    totalCharacterPullsNoBasic,
    sourceBreakdown: resolvedSourceBreakdown,

    // Legacy compatibility fields (to keep existing consumers stable).
    oroberyl: legacyValue(rewards, "oroberyl", economy),
    origeometry: Math.max(
      0,
      legacyValue(rewards, "origeometry", economy) -
        legacyValue(costs, "origeometry", economy),
    ),
    oroberylFromOri:
      Math.max(
        0,
        legacyValue(rewards, "origeometry", economy) -
          legacyValue(costs, "origeometry", economy),
      ) * safeNumber(economy.rates.premiumToBase),
    chartered: legacyValue(rewards, "chartered", economy),
    basic: legacyValue(rewards, "basic", economy),
    firewalker: legacyValue(rewards, "firewalker", economy),
    messenger: legacyValue(rewards, "messenger", economy),
    hues: legacyValue(rewards, "hues", economy),
    arsenal: legacyValue(rewards, "arsenal", economy),
  };
};

export const aggregateTotals = (rows, options, game = {}) => {
  const economy = resolveGameEconomy(game);

  const initialResources = createResourceRecord(economy.resourceKeys, 0);
  const initialCosts = createResourceRecord(economy.resourceKeys, 0);
  const initialPullResources = createResourceRecord(economy.resourceKeys, 0);

  const aggregated = rows
    .map((row) => calculatePatchTotals(row, options, game))
    .reduce(
      (acc, item) => {
        acc.patchCount += 1;
        acc.baseCurrencyAmount += item.baseCurrencyAmount;
        acc.premiumCurrencyAmount += item.premiumCurrencyAmount;
        acc.altCurrencyAmount += item.altCurrencyAmount;
        acc.premiumAsBaseAmount += item.premiumAsBaseAmount;
        acc.premiumAsAltAmount += item.premiumAsAltAmount;
        acc.currencyPullsExact += item.currencyPullsExact;
        acc.currencyPulls += item.currencyPulls;
        acc.timedPermits += item.timedPermits;
        acc.totalCharacterPulls += item.totalCharacterPulls;
        acc.totalCharacterPullsNoBasicExact += item.totalCharacterPullsNoBasicExact;
        acc.totalCharacterPullsNoBasic += item.totalCharacterPullsNoBasic;

        for (const key of economy.resourceKeys) {
          acc.resources[key] += safeNumber(item.resources[key]);
          acc.costs[key] += safeNumber(item.costs[key]);
          acc.pullResources[key] += safeNumber(item.pullResources[key]);
        }

        return acc;
      },
      {
        patchCount: 0,
        economy,
        resources: initialResources,
        costs: initialCosts,
        pullResources: initialPullResources,
        baseCurrencyAmount: 0,
        premiumCurrencyAmount: 0,
        altCurrencyAmount: 0,
        premiumAsBaseAmount: 0,
        premiumAsAltAmount: 0,
        currencyPullsExact: 0,
        currencyPulls: 0,
        timedPermits: 0,
        totalCharacterPulls: 0,
        totalCharacterPullsNoBasicExact: 0,
        totalCharacterPullsNoBasic: 0,
      },
    );

  return {
    ...aggregated,
    // Legacy compatibility fields.
    oroberyl: legacyValue(aggregated.resources, "oroberyl", aggregated.economy),
    origeometry: Math.max(
      0,
      legacyValue(aggregated.resources, "origeometry", aggregated.economy) -
        legacyValue(aggregated.costs, "origeometry", aggregated.economy),
    ),
    oroberylFromOri:
      Math.max(
        0,
        legacyValue(aggregated.resources, "origeometry", aggregated.economy) -
          legacyValue(aggregated.costs, "origeometry", aggregated.economy),
      ) * safeNumber(aggregated.economy.rates.premiumToBase),
    chartered: legacyValue(aggregated.resources, "chartered", aggregated.economy),
    basic: legacyValue(aggregated.resources, "basic", aggregated.economy),
    firewalker: legacyValue(aggregated.resources, "firewalker", aggregated.economy),
    messenger: legacyValue(aggregated.resources, "messenger", aggregated.economy),
    hues: legacyValue(aggregated.resources, "hues", aggregated.economy),
    arsenal: legacyValue(aggregated.resources, "arsenal", aggregated.economy),
  };
};

export const chartSeries = (rows, options, game = {}) =>
  rows.map((row) => {
    const totals = calculatePatchTotals(row, options, game);
    return {
      label: row.patch,
      total: totals.sourceBreakdown.reduce((sum, source) => sum + source.value, 0),
      segments: totals.sourceBreakdown,
    };
  });
