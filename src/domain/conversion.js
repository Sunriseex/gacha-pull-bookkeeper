import { GAME_RATES } from "../config/gameConfig.js";

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const origeometryToOroberyl = (origeometry) =>
  Math.floor(asNumber(origeometry) * GAME_RATES.ORIGEOMETRY_TO_OROBERYL);

export const origeometryToArsenalTickets = (origeometry) =>
  Math.floor(asNumber(origeometry) * GAME_RATES.ORIGEOMETRY_TO_ARSENAL);

export const oroberylToPulls = (oroberyl) =>
  Math.floor(asNumber(oroberyl) / GAME_RATES.OROBERYL_PER_PULL);

export const safeNumber = asNumber;
