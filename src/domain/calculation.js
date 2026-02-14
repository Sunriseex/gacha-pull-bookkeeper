import { TIMED_PERMIT_KEYS } from "../config/gameConfig.js";
import {
  origeometryToOroberyl,
  oroberylToPulls,
  safeNumber,
} from "./conversion.js";

const BONUS_KEYS = [
  "oroberyl",
  "origeometry",
  "chartered",
  "basic",
  "firewalker",
  "messenger",
  "hues",
  "arsenal",
];

const emptyBonus = () =>
  BONUS_KEYS.reduce((acc, key) => {
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

const resolveBonus = (row, options) => {
  const result = emptyBonus();

  if (options.monthlySub && row.monthlySub) {
    for (const key of BONUS_KEYS) {
      result[key] += safeNumber(row.monthlySub[key]);
    }
  }

  const tier = normalizeTier(options.battlePassTier);
  const battlePassRewards = row.battlePass?.[tier];
  if (battlePassRewards) {
    for (const key of BONUS_KEYS) {
      result[key] += safeNumber(battlePassRewards[key]);
    }
  }

  return result;
};

export const calculatePatchTotals = (row, options) => {
  const bonus = resolveBonus(row, options);
  const base = row.base ?? {};

  const oroberyl = safeNumber(base.oroberyl) + bonus.oroberyl;
  const origeometry = safeNumber(base.origeometry) + bonus.origeometry;
  const oroberylFromOri = origeometryToOroberyl(origeometry);
  const currencyPulls = oroberylToPulls(oroberyl + oroberylFromOri);

  const chartered = safeNumber(base.chartered) + bonus.chartered;
  const basic = safeNumber(base.basic) + bonus.basic;
  const firewalker = safeNumber(base.firewalker) + bonus.firewalker;
  const messenger = safeNumber(base.messenger) + bonus.messenger;
  const hues = safeNumber(base.hues) + bonus.hues;
  const timedPermits = TIMED_PERMIT_KEYS.reduce(
    (sum, key) => sum + safeNumber({ firewalker, messenger, hues }[key]),
    0,
  );

  const arsenal = safeNumber(base.arsenal) + bonus.arsenal;
  const totalCharacterPulls =
    currencyPulls + chartered + basic + firewalker + messenger + hues;

  return {
    patch: row.patch,
    oroberyl,
    origeometry,
    oroberylFromOri,
    currencyPulls,
    chartered,
    basic,
    firewalker,
    messenger,
    hues,
    timedPermits,
    arsenal,
    totalCharacterPulls,
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
        acc.currencyPulls += item.currencyPulls;
        acc.chartered += item.chartered;
        acc.basic += item.basic;
        acc.firewalker += item.firewalker;
        acc.messenger += item.messenger;
        acc.hues += item.hues;
        acc.timedPermits += item.timedPermits;
        acc.arsenal += item.arsenal;
        acc.totalCharacterPulls += item.totalCharacterPulls;
        return acc;
      },
      {
        patchCount: 0,
        oroberyl: 0,
        origeometry: 0,
        oroberylFromOri: 0,
        currencyPulls: 0,
        chartered: 0,
        basic: 0,
        firewalker: 0,
        messenger: 0,
        hues: 0,
        timedPermits: 0,
        arsenal: 0,
        totalCharacterPulls: 0,
      },
    );

export const chartSeries = (rows, options) =>
  rows.map((row) => {
    const totals = calculatePatchTotals(row, options);
    return {
      label: row.patch,
      value: totals.totalCharacterPulls,
    };
  });
