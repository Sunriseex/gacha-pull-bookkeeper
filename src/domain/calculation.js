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
  if (gate === "always") {
    return true;
  }
  if (gate === "monthly") {
    return Boolean(options.monthlySub);
  }
  if (gate === "bp2") {
    return tier >= 2;
  }
  if (gate === "bp3") {
    return tier >= 3;
  }
  return false;
};

const normalizeRewards = (input = {}) =>
  RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = safeNumber(input[key]);
    return acc;
  }, {});

const resolveSourceRewards = (source, row) => {
  const rewards = normalizeRewards(source.rewards);
  if (source.gate === "monthly" && source.monthlyPass) {
    const durationDays = Math.max(0, safeNumber(row.durationDays));
    const renewalDays = Math.max(1, safeNumber(source.monthlyPass.renewalDays || 30));
    const purchases = Math.ceil(durationDays / renewalDays);

    rewards.oroberyl += durationDays * safeNumber(source.monthlyPass.dailyOroberyl);
    rewards.origeometry += purchases * safeNumber(source.monthlyPass.purchaseBonusOrigeometry);
  }

  if (source.weeklyRoutine) {
    const durationDays = Math.max(0, safeNumber(row.durationDays));
    const weeks = Math.floor(durationDays / 7);
    rewards.oroberyl += weeks * safeNumber(source.weeklyRoutine.weeklyOroberyl);
    rewards.arsenal += weeks * safeNumber(source.weeklyRoutine.weeklyArsenal);
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

const sumCosts = (sources) => ({
  origeometry: sources.reduce(
    (sum, source) => sum + safeNumber(source.costs?.origeometry),
    0,
  ),
});

const sourcePullValue = (source) => {
  const rewards = source.rewards ?? {};
  const sourceOrigeometry = Math.max(
    0,
    safeNumber(rewards.origeometry) - safeNumber(source.costs?.origeometry),
  );
  const currencyPulls =
    (safeNumber(rewards.oroberyl) +
      sourceOrigeometry * GAME_RATES.ORIGEOMETRY_TO_OROBERYL) /
    GAME_RATES.OROBERYL_PER_PULL;
  const permitPulls =
    safeNumber(rewards.chartered) +
    safeNumber(rewards.firewalker) +
    safeNumber(rewards.messenger) +
    safeNumber(rewards.hues);

  return currencyPulls + permitPulls;
};

const sourceBreakdown = (sources) =>
  sources.map((source) => ({
    id: source.id,
    label: source.label,
    value: sourcePullValue(source),
  }));

export const calculatePatchTotals = (row, options) => {
  const enabledSources = toSourceFormat(row)
    .filter((source) => isSourceEnabled(source, options))
    .map((source) => ({
      ...source,
      rewards: resolveSourceRewards(source, row),
    }));
  const rewards = sumResources(enabledSources);
  const costs = sumCosts(enabledSources);

  const oroberyl = rewards.oroberyl;
  const origeometry = Math.max(0, rewards.origeometry - costs.origeometry);
  const oroberylFromOri =
    origeometry * GAME_RATES.ORIGEOMETRY_TO_OROBERYL;
  const currencyPulls = oroberylToPulls(oroberyl + oroberylFromOri);

  const chartered = rewards.chartered;
  const basic = rewards.basic;
  const firewalker = rewards.firewalker;
  const messenger = rewards.messenger;
  const hues = rewards.hues;
  const timedPermits = TIMED_PERMIT_KEYS.reduce(
    (sum, key) => sum + safeNumber({ firewalker, messenger, hues }[key]),
    0,
  );

  const arsenal = rewards.arsenal;
  const totalCharacterPullsNoBasic =
    currencyPulls + chartered + firewalker + messenger + hues;

  return {
    patch: row.patch,
    oroberyl,
    origeometry,
    oroberylFromOri,
    origeometrySpentOnBp: costs.origeometry,
    currencyPulls,
    chartered,
    basic,
    firewalker,
    messenger,
    hues,
    timedPermits,
    arsenal,
    totalCharacterPulls: totalCharacterPullsNoBasic,
    totalCharacterPullsNoBasic,
    sourceBreakdown: sourceBreakdown(enabledSources),
  };
};

export const aggregateTotals = (rows, options) =>
  rows
    .map((row) => calculatePatchTotals(row, options))
    .reduce(
      (acc, item) => {
        acc.patchCount += 1;
        acc.oroberyl += item.oroberyl;
        acc.origeometry += item.origeometry;
        acc.oroberylFromOri += item.oroberylFromOri;
        acc.origeometrySpentOnBp += item.origeometrySpentOnBp;
        acc.currencyPulls += item.currencyPulls;
        acc.chartered += item.chartered;
        acc.basic += item.basic;
        acc.firewalker += item.firewalker;
        acc.messenger += item.messenger;
        acc.hues += item.hues;
        acc.timedPermits += item.timedPermits;
        acc.arsenal += item.arsenal;
        acc.totalCharacterPulls += item.totalCharacterPulls;
        acc.totalCharacterPullsNoBasic += item.totalCharacterPullsNoBasic;
        return acc;
      },
      {
        patchCount: 0,
        oroberyl: 0,
        origeometry: 0,
        oroberylFromOri: 0,
        origeometrySpentOnBp: 0,
        currencyPulls: 0,
        chartered: 0,
        basic: 0,
        firewalker: 0,
        messenger: 0,
        hues: 0,
        timedPermits: 0,
        arsenal: 0,
        totalCharacterPulls: 0,
        totalCharacterPullsNoBasic: 0,
      },
    );

export const chartSeries = (rows, options) =>
  rows.map((row) => {
    const totals = calculatePatchTotals(row, options);
    return {
      label: row.patch,
      total: totals.sourceBreakdown.reduce((sum, source) => sum + source.value, 0),
      segments: totals.sourceBreakdown,
    };
  });
