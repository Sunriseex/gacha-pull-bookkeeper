import { GAME_RATES, TIMED_PERMIT_KEYS } from "../config/gameConfig.js";
import { oroberylToPulls, safeNumber } from "./conversion.js";

const RESOURCE_KEYS = [
  "oroberyl",
  "origeometry",
  "chartered",
  "basic",
  "firewalker",
  "messenger",
  "hues",
  "arsenal",
];

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

const resolveSourceRewards = (source, row) => {
  const rewards = normalizeRewards(source.rewards);

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
      label: "Originium Supply Pass",
      gate: "bp2",
      rewards: battlePassTier2,
      costs: { origeometry: bp2Cost },
    },
    {
      id: "bp3",
      label: "Protocol Customized Pass",
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
  return safeNumber(GAME_RATES[key]);
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

const sourcePullValue = (source, rates = GAME_RATES) => {
  if (source.countInPulls === false) {
    return 0;
  }
  const rewards = source.rewards ?? {};
  const costs = source.costs ?? {};
  const sourceOrigeometry = Math.max(
    0,
    safeNumber(rewards.origeometry) - safeNumber(costs.origeometry),
  );
  const perPull = resolveRate(rates, "OROBERYL_PER_PULL");
  if (perPull <= 0) {
    return 0;
  }
  const currencyPulls =
    (safeNumber(rewards.oroberyl) +
      sourceOrigeometry * resolveRate(rates, "ORIGEOMETRY_TO_OROBERYL")) /
    perPull;
  const permitPulls =
    safeNumber(rewards.chartered) +
    safeNumber(rewards.firewalker) +
    safeNumber(rewards.messenger) +
    safeNumber(rewards.hues);

  return currencyPulls + permitPulls;
};

const sourceBreakdown = (sources, rates = GAME_RATES) =>
  sources.map((source) => ({
    id: source.id,
    label: source.label,
    value: sourcePullValue(source, rates),
  })).filter((source) => source.value > 0);

export const calculatePatchTotals = (row, options, rates = GAME_RATES) => {
  const enabledSources = toSourceFormat(row)
    .filter((source) => isSourceEnabled(source, options))
    .map((source) => ({
      ...source,
      rewards: resolveSourceRewards(source, row),
    }));
  const rewards = sumResources(enabledSources);
  const costs = sumCosts(enabledSources);
  const pullSources = pullEligibleSources(enabledSources);
  const pullRewards = sumResources(pullSources);
  const pullCosts = sumCosts(pullSources);

  const oroberyl = rewards.oroberyl;
  const origeometry = Math.max(0, rewards.origeometry - costs.origeometry);
  const oroberylFromOri =
    origeometry * resolveRate(rates, "ORIGEOMETRY_TO_OROBERYL");
  const pullOrigeometry = Math.max(
    0,
    pullRewards.origeometry - pullCosts.origeometry,
  );
  const pullOroberylFromOri =
    pullOrigeometry * resolveRate(rates, "ORIGEOMETRY_TO_OROBERYL");
  const perPull = resolveRate(rates, "OROBERYL_PER_PULL");
  const currencyPullsExact =
    perPull > 0
      ? (pullRewards.oroberyl + pullOroberylFromOri) / perPull
      : 0;
  const currencyPulls = oroberylToPulls(
    pullRewards.oroberyl + pullOroberylFromOri,
    rates,
  );

  const chartered = rewards.chartered;
  const charteredForPulls = pullRewards.chartered;
  const basic = rewards.basic;
  const firewalker = rewards.firewalker;
  const messenger = rewards.messenger;
  const hues = rewards.hues;
  const firewalkerForPulls = pullRewards.firewalker;
  const messengerForPulls = pullRewards.messenger;
  const huesForPulls = pullRewards.hues;
  const timedPermits = TIMED_PERMIT_KEYS.reduce(
    (sum, key) => sum + safeNumber({ firewalker, messenger, hues }[key]),
    0,
  );
  const timedPermitsForPulls = TIMED_PERMIT_KEYS.reduce(
    (sum, key) =>
      sum + safeNumber({ firewalker: firewalkerForPulls, messenger: messengerForPulls, hues: huesForPulls }[key]),
    0,
  );

  const arsenal = rewards.arsenal;
  const totalCharacterPullsNoBasicExact =
    currencyPullsExact + charteredForPulls + timedPermitsForPulls;
  const totalCharacterPullsNoBasic =
    currencyPulls + charteredForPulls + timedPermitsForPulls;

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
    sourceBreakdown: sourceBreakdown(enabledSources, rates),
  };
};

export const aggregateTotals = (rows, options, rates = GAME_RATES) =>
  rows
    .map((row) => calculatePatchTotals(row, options, rates))
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

export const chartSeries = (rows, options, rates = GAME_RATES) =>
  rows.map((row) => {
    const totals = calculatePatchTotals(row, options, rates);
    return {
      label: row.patch,
      total: totals.sourceBreakdown.reduce((sum, source) => sum + source.value, 0),
      segments: totals.sourceBreakdown,
    };
  });
