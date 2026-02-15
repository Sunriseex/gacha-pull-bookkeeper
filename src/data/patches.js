import { GENERATED_PATCHES } from "./patches.generated.js";

const rewards = ({
  oroberyl = 0,
  origeometry = 0,
  chartered = 0,
  basic = 0,
  firewalker = 0,
  messenger = 0,
  hues = 0,
  arsenal = 0,
} = {}) => ({
  oroberyl,
  origeometry,
  chartered,
  basic,
  firewalker,
  messenger,
  hues,
  arsenal,
});

const scalePerDuration = ({
  unit = "day",
  everyDays = 1,
  rounding = "floor",
  rewardsPerCycle = {},
} = {}) => ({
  type: "per_duration",
  unit,
  everyDays,
  rounding,
  rewards: rewards(rewardsPerCycle),
});

const source = ({
  id,
  label,
  gate = "always",
  optionKey = null,
  countInPulls = true,
  rewards: baseRewards = {},
  costs = {},
  scalers = [],
} = {}) => ({
  id,
  label,
  gate,
  optionKey,
  countInPulls,
  rewards: rewards(baseRewards),
  costs: rewards(costs),
  scalers,
});

const monthlyPassDailySource = () =>
  source({
    id: "monthly",
    label: "Monthly Pass",
    gate: "monthly",
    scalers: [
      scalePerDuration({
        unit: "day",
        rewardsPerCycle: { oroberyl: 200 },
      }),
    ],
  });

const monthlyPassBonusSource = () =>
  source({
    id: "monthlyBonus",
    label: "Monthly Pass Bonus",
    gate: "monthly",
    countInPulls: false,
    scalers: [
      scalePerDuration({
        unit: "cycle",
        everyDays: 30,
        rounding: "ceil",
        rewardsPerCycle: { origeometry: 12 },
      }),
    ],
  });

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Patch schema error: ${message}`);
  }
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const validateRewardsShape = (value, context) => {
  assert(value && typeof value === "object", `${context} rewards must be an object`);
  const keys = [
    "oroberyl",
    "origeometry",
    "chartered",
    "basic",
    "firewalker",
    "messenger",
    "hues",
    "arsenal",
  ];
  for (const key of keys) {
    assert(
      hasOwn(value, key),
      `${context} rewards is missing key "${key}"`,
    );
    assert(
      Number.isFinite(Number(value[key])),
      `${context} rewards.${key} must be numeric`,
    );
  }
};

const validateSource = (src, context) => {
  assert(src && typeof src === "object", `${context} must be an object`);
  assert(typeof src.id === "string" && src.id.trim(), `${context}.id is required`);
  assert(
    typeof src.label === "string" && src.label.trim(),
    `${context}.label is required`,
  );
  assert(
    ["always", "monthly", "bp2", "bp3"].includes(src.gate),
    `${context}.gate must be one of always|monthly|bp2|bp3`,
  );
  if (src.optionKey !== null && src.optionKey !== undefined) {
    assert(
      typeof src.optionKey === "string" && src.optionKey.trim(),
      `${context}.optionKey must be a non-empty string`,
    );
  }
  validateRewardsShape(src.rewards, `${context}.rewards`);
  validateRewardsShape(src.costs, `${context}.costs`);
  assert(Array.isArray(src.scalers), `${context}.scalers must be an array`);
  for (const [scalerIndex, scaler] of src.scalers.entries()) {
    const scalerCtx = `${context}.scalers[${scalerIndex}]`;
    assert(scaler.type === "per_duration", `${scalerCtx}.type must be per_duration`);
    assert(
      ["day", "cycle"].includes(scaler.unit),
      `${scalerCtx}.unit must be day or cycle`,
    );
    assert(
      Number.isFinite(Number(scaler.everyDays)) && Number(scaler.everyDays) > 0,
      `${scalerCtx}.everyDays must be > 0`,
    );
    assert(
      ["floor", "ceil", "round"].includes(scaler.rounding),
      `${scalerCtx}.rounding must be floor|ceil|round`,
    );
    validateRewardsShape(scaler.rewards, `${scalerCtx}.rewards`);
  }
};

const validatePatch = (patch, context) => {
  assert(patch && typeof patch === "object", `${context} must be an object`);
  assert(typeof patch.id === "string" && patch.id.trim(), `${context}.id is required`);
  assert(
    typeof patch.patch === "string" && patch.patch.trim(),
    `${context}.patch is required`,
  );
  assert(
    Number.isFinite(Number(patch.durationDays)) && Number(patch.durationDays) > 0,
    `${context}.durationDays must be > 0`,
  );
  assert(Array.isArray(patch.sources), `${context}.sources must be an array`);
  assert(patch.sources.length > 0, `${context}.sources must not be empty`);

  const sourceIds = new Set();
  for (const [sourceIndex, src] of patch.sources.entries()) {
    validateSource(src, `${context}.sources[${sourceIndex}]`);
    assert(
      !sourceIds.has(src.id),
      `${context} has duplicate source id "${src.id}"`,
    );
    sourceIds.add(src.id);
  }
};

const validateGame = (game, gameIndex) => {
  const context = `games[${gameIndex}]`;
  assert(game && typeof game === "object", `${context} must be an object`);
  assert(typeof game.id === "string" && game.id.trim(), `${context}.id is required`);
  assert(
    typeof game.title === "string" && game.title.trim(),
    `${context}.title is required`,
  );
  assert(game.rates && typeof game.rates === "object", `${context}.rates is required`);
  assert(
    Number(game.rates.ORIGEOMETRY_TO_OROBERYL) > 0,
    `${context}.rates.ORIGEOMETRY_TO_OROBERYL must be > 0`,
  );
  assert(
    Number(game.rates.ORIGEOMETRY_TO_ARSENAL) > 0,
    `${context}.rates.ORIGEOMETRY_TO_ARSENAL must be > 0`,
  );
  assert(
    Number(game.rates.OROBERYL_PER_PULL) > 0,
    `${context}.rates.OROBERYL_PER_PULL must be > 0`,
  );
  assert(
    Array.isArray(game.patches) && game.patches.length > 0,
    `${context}.patches must be a non-empty array`,
  );

  const patchIds = new Set();
  for (const [patchIndex, patch] of game.patches.entries()) {
    validatePatch(patch, `${context}.patches[${patchIndex}]`);
    assert(
      !patchIds.has(patch.id),
      `${context} has duplicate patch id "${patch.id}"`,
    );
    patchIds.add(patch.id);
  }
};

export const GAME_CATALOG = {
  schemaVersion: "2.0",
  games: [
    {
      id: "arknights-endfield",
      title: "Arknights: Endfield",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 75,
        ORIGEOMETRY_TO_ARSENAL: 25,
        OROBERYL_PER_PULL: 500,
      },
      defaultOptions: {
        monthlySub: true,
        battlePassTier: 1,
        includeBpCrates: true,
        includeAicQuotaExchange: true,
        includeUrgentRecruit: true,
        includeHhDossier: true,
      },
      patches: [
        {
          id: "1.0",
          patch: "1.0",
          versionName: "Zeroth Directive",
          startDate: "2026-01-22",
          durationDays: 54,
          notes: "Derived from Новая таблица - 1.0(1).csv with corrected Daily/Monthly to 10800.",
          sources: [
            source({
              id: "events",
              label: "Events",
              rewards: {
                oroberyl: 3000,
                chartered: 12,
                firewalker: 5,
                messenger: 5,
                hues: 5,
              },
            }),
            source({
              id: "permanent",
              label: "Permanent Content",
              rewards: {
                oroberyl: 54876,
                origeometry: 153,
                basic: 92,
              },
            }),
            source({
              id: "mailbox",
              label: "Mailbox & Web Events",
              rewards: {
                oroberyl: 6949,
                chartered: 10,
                basic: 20,
              },
            }),
            source({
              id: "dailyActivity",
              label: "Daily Activity",
              scalers: [
                scalePerDuration({
                  unit: "day",
                  rewardsPerCycle: { oroberyl: 200 },
                }),
              ],
            }),
            source({
              id: "weekly",
              label: "Weekly Routine",
              scalers: [
                scalePerDuration({
                  unit: "cycle",
                  everyDays: 7,
                  rounding: "floor",
                  rewardsPerCycle: {
                    oroberyl: 500,
                    arsenal: 100,
                  },
                }),
              ],
            }),
            source({
              id: "monumental",
              label: "Monumental Etching",
              scalers: [
                scalePerDuration({
                  unit: "cycle",
                  everyDays: 30,
                  rounding: "ceil",
                  rewardsPerCycle: { oroberyl: 1200 },
                }),
              ],
            }),
            source({
              id: "aicQuota",
              label: "AIC Quota Exchange",
              optionKey: "includeAicQuotaExchange",
              rewards: { chartered: 15 },
            }),
            source({
              id: "urgentRecruit",
              label: "Urgent Recruit",
              optionKey: "includeUrgentRecruit",
              rewards: { chartered: 30 },
            }),
            source({
              id: "hhDossier",
              label: "HH Dossier",
              optionKey: "includeHhDossier",
              rewards: { chartered: 20 },
            }),
            monthlyPassDailySource(),
            monthlyPassBonusSource(),
            source({
              id: "bp2Core",
              label: "Originium Supply Pass",
              gate: "bp2",
              countInPulls: false,
              rewards: { origeometry: 3 },
            }),
            source({
              id: "bp3Core",
              label: "Protocol Customized Pass",
              gate: "bp3",
              countInPulls: false,
              rewards: {
                origeometry: 36,
                arsenal: 2400,
              },
            }),
            source({
              id: "bpCrateM",
              label: "Exchange Crate-o-Surprise [M]",
              gate: "bp2",
              optionKey: "includeBpCrates",
              rewards: { oroberyl: 1102 },
            }),
            source({
              id: "bpCrateL",
              label: "Exchange Crate-o-Surprise [L]",
              gate: "bp3",
              optionKey: "includeBpCrates",
              rewards: { oroberyl: 334 },
            }),
          ],
        },
      ],
    },
  ],
};

if (Array.isArray(GENERATED_PATCHES) && GENERATED_PATCHES.length > 0) {
  GAME_CATALOG.games[0].patches = GENERATED_PATCHES;
}

for (const [gameIndex, game] of GAME_CATALOG.games.entries()) {
  validateGame(game, gameIndex);
}

export const ACTIVE_GAME = GAME_CATALOG.games[0];
export const PATCHES = ACTIVE_GAME.patches;
