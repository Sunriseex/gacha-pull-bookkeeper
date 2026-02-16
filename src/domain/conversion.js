import { DEFAULT_RATES } from "../config/gameConfig.js";

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const resolveRate = (rates, key) => {
  const candidate = asNumber(rates?.[key]);
  if (candidate > 0) {
    return candidate;
  }
  return asNumber(DEFAULT_RATES[key]);
};

export const origeometryToOroberyl = (origeometry, rates = DEFAULT_RATES) =>
  Math.floor(asNumber(origeometry) * resolveRate(rates, "ORIGEOMETRY_TO_OROBERYL"));

export const origeometryToArsenalTickets = (origeometry, rates = DEFAULT_RATES) =>
  Math.floor(asNumber(origeometry) * resolveRate(rates, "ORIGEOMETRY_TO_ARSENAL"));

export const oroberylToPulls = (oroberyl, rates = DEFAULT_RATES) => {
  const pullRate = resolveRate(rates, "OROBERYL_PER_PULL");
  if (pullRate <= 0) {
    return 0;
  }
  return Math.floor(asNumber(oroberyl) / pullRate);
};

export const safeNumber = asNumber;
