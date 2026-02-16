import { GENERATED_PATCHES as GENERATED_ENDFIELD_PATCHES } from "./endfield.generated.js";
import { GENERATED_PATCHES as GENERATED_WUWA_PATCHES } from "./wuwa.generated.js";

const ENDFIELD_GAME_ID = "arknights-endfield";
const WUWA_GAME_ID = "wuthering-waves";

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
  pulls = null,
  rewards: baseRewards = {},
  costs = {},
  scalers = [],
  bpCrateModel = null,
} = {}) => ({
  id,
  label,
  gate,
  optionKey,
  countInPulls,
  pulls,
  rewards: rewards(baseRewards),
  costs: rewards(costs),
  scalers,
  bpCrateModel,
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
  if (src.pulls !== null && src.pulls !== undefined) {
    assert(
      Number.isFinite(Number(src.pulls)) && Number(src.pulls) >= 0,
      `${context}.pulls must be a non-negative number`,
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
  if (src.bpCrateModel !== null && src.bpCrateModel !== undefined) {
    const model = src.bpCrateModel;
    const modelCtx = `${context}.bpCrateModel`;
    assert(
      model && typeof model === "object",
      `${modelCtx} must be an object`,
    );
    assert(
      model.type === "post_bp60_estimate",
      `${modelCtx}.type must be post_bp60_estimate`,
    );
    assert(
      Number.isFinite(Number(model.daysToLevel60Tier3)) &&
        Number(model.daysToLevel60Tier3) > 0,
      `${modelCtx}.daysToLevel60Tier3 must be > 0`,
    );
    assert(
      Number.isFinite(Number(model.tier2XpBonus)) &&
        Number(model.tier2XpBonus) >= 0,
      `${modelCtx}.tier2XpBonus must be >= 0`,
    );
    assert(
      Number.isFinite(Number(model.tier3XpBonus)) &&
        Number(model.tier3XpBonus) >= 0,
      `${modelCtx}.tier3XpBonus must be >= 0`,
    );
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
  assert(
    game.ui && typeof game.ui === "object",
    `${context}.ui is required`,
  );
  assert(
    Array.isArray(game.ui?.battlePass?.tiers) &&
      game.ui.battlePass.tiers.length > 0,
    `${context}.ui.battlePass.tiers is required`,
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

const patchVersionKey = (value) => {
  const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    return null;
  }
  return [major, minor];
};

const sortByPatchVersion = (patches) =>
  [...patches].sort((a, b) => {
    const keyA = patchVersionKey(a.patch);
    const keyB = patchVersionKey(b.patch);
    if (keyA && keyB) {
      if (keyA[0] !== keyB[0]) {
        return keyA[0] - keyB[0];
      }
      return keyA[1] - keyB[1];
    }
    return String(a.patch).localeCompare(String(b.patch), "en");
  });

const mergeGeneratedPatches = (basePatches, generatedPatches = []) => {
  const merged = new Map(basePatches.map((patch) => [patch.id, patch]));
  for (const patch of generatedPatches) {
    if (patch && typeof patch.id === "string") {
      merged.set(patch.id, patch);
    }
  }
  return sortByPatchVersion([...merged.values()]);
};

const END_FIELD_BASE_PATCHES = [
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
        bpCrateModel: {
          type: "post_bp60_estimate",
          daysToLevel60Tier3: 21,
          tier2XpBonus: 0.03,
          tier3XpBonus: 0.06,
        },
      }),
      source({
        id: "bpCrateL",
        label: "Exchange Crate-o-Surprise [L]",
        gate: "bp3",
        optionKey: "includeBpCrates",
        rewards: { oroberyl: 334 },
        bpCrateModel: {
          type: "post_bp60_estimate",
          daysToLevel60Tier3: 21,
          tier2XpBonus: 0.03,
          tier3XpBonus: 0.06,
        },
      }),
    ],
  },
];

const WUWA_BASE_PATCHES = [
  {
    id: "1.0",
    patch: "1.0",
    versionName: "Global Release",
    startDate: "2024-05-22",
    durationDays: 36,
    notes: "Aggregated directly from Wuthering Waves spreadsheet rows.",
      sources: [
        source({
          id: "events",
          label: "Version Events",
          rewards: {
            oroberyl: 3455,
            chartered: 4,
            firewalker: 0,
            basic: 24,
          },
          pulls: 25.6,
        }),
        source({
          id: "permanent",
          label: "Permanent Content",
          rewards: {
            oroberyl: 21765,
            chartered: 15,
            firewalker: 0,
            basic: 58,
          },
          pulls: 151.0,
        }),
        source({
          id: "mailbox",
          label: "Mailbox/Miscellaneous",
          rewards: {
            oroberyl: 920,
            chartered: 30,
            firewalker: 0,
            basic: 45,
          },
          pulls: 35.8,
        }),
        source({
          id: "dailyActivity",
          label: "Daily Activity",
          rewards: {},
          pulls: 13.5,
        }),
        source({
          id: "endgameModes",
          label: "Endgame Modes",
          rewards: {
            oroberyl: 3960,
            chartered: 6,
            firewalker: 0,
            basic: 17,
          },
          pulls: 11.3,
        }),
        source({
          id: "coralShop",
          label: "Coral Shop",
          rewards: {},
          pulls: 6.0,
        }),
        source({
          id: "weaponPulls",
          label: "Weapon Pulls",
          rewards: {},
          pulls: 11.0,
        }),
        source({
          id: "paidPodcast",
          label: "Paid Pioneer Podcast",
          gate: "bp2",
        rewards: {
            oroberyl: 680,
            chartered: 5,
            firewalker: 2,
          },
          pulls: 9.3,
        }),
        source({
          id: "monthly",
          label: "Lunite Subscription",
          gate: "monthly",
          scalers: [
            scalePerDuration({
              unit: "day",
              rewardsPerCycle: { oroberyl: 90 },
            }),
          ],
          pulls: 20.3,
        }),
      ],
    },
  ];

export const GAME_CATALOG = {
  schemaVersion: "3.0",
  games: [
    {
      id: ENDFIELD_GAME_ID,
      title: "Arknights: Endfield",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 75,
        ORIGEOMETRY_TO_ARSENAL: 25,
        OROBERYL_PER_PULL: 500,
      },
      permitKeys: {
        pull: ["chartered", "firewalker", "messenger", "hues"],
        timed: ["firewalker", "messenger", "hues"],
      },
      defaultOptions: {
        monthlySub: true,
        battlePassTier: 1,
        includeBpCrates: true,
        includeAicQuotaExchange: true,
        includeUrgentRecruit: true,
        includeHhDossier: true,
      },
      ui: {
        chartTitle: "Character pulls per version",
        pullSummaryLabel: "Total Character Pulls (No Basic)",
        monthlyPassLabel: "Monthly Pass",
        backgroundImage: "./assets/backgrounds/endfield_background.png",
        battlePass: {
          label: "Battle Pass",
          tiers: [
            { value: 1, label: "Basic Supply" },
            { value: 2, label: "Originium Supply" },
            { value: 3, label: "Protocol Customized" },
          ],
        },
        optionalToggles: [
          { key: "includeBpCrates", label: "Include BP 60+ Crates [M]/[L]" },
          { key: "includeAicQuotaExchange", label: "AIC Quota Exchange" },
          { key: "includeUrgentRecruit", label: "Urgent Recruit" },
          { key: "includeHhDossier", label: "HH Dossier" },
        ],
        resourceLabels: {
          oroberyl: "Oroberyl",
          origeometry: "Origeometry",
          arsenal: "Arsenal Tickets",
          chartered: "Chartered HH Permit",
          timed: "Timed Event Permits",
          basic: "Basic HH Permit",
        },
      },
      patches: END_FIELD_BASE_PATCHES,
    },
    {
      id: WUWA_GAME_ID,
      title: "Wuthering Waves",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 1,
        ORIGEOMETRY_TO_ARSENAL: 1,
        OROBERYL_PER_PULL: 160,
      },
      permitKeys: {
        pull: ["chartered", "firewalker"],
        timed: ["firewalker"],
      },
      defaultOptions: {
        monthlySub: true,
        battlePassTier: 1,
      },
      ui: {
        chartTitle: "Event pulls per version",
        pullSummaryLabel: "Total Event Pulls (No Lustrous)",
        monthlyPassLabel: "Lunite Subscription",
        backgroundImage: "./assets/backgrounds/wuwa_background.jpg",
        battlePass: {
          label: "Pioneer Podcast",
          tiers: [
            { value: 1, label: "F2P" },
            { value: 2, label: "Paid" },
          ],
        },
        optionalToggles: [],
        resourceLabels: {
          oroberyl: "Astrites",
          origeometry: "Lunite",
          arsenal: "Forging Tokens",
          chartered: "Radiant Tide",
          timed: "Forging Tide",
          basic: "Lustrous Tide",
        },
      },
      patches: WUWA_BASE_PATCHES,
    },
  ],
};

const generatedByGame = {
  [ENDFIELD_GAME_ID]: GENERATED_ENDFIELD_PATCHES,
  [WUWA_GAME_ID]: GENERATED_WUWA_PATCHES,
};

GAME_CATALOG.games = GAME_CATALOG.games.map((game) => ({
  ...game,
  patches: mergeGeneratedPatches(
    game.patches,
    Array.isArray(generatedByGame[game.id]) ? generatedByGame[game.id] : [],
  ),
}));

for (const [gameIndex, game] of GAME_CATALOG.games.entries()) {
  validateGame(game, gameIndex);
}

export const DEFAULT_GAME_ID = ENDFIELD_GAME_ID;
export const getGameById = (id) =>
  GAME_CATALOG.games.find((game) => game.id === id) ?? GAME_CATALOG.games[0];

export const ACTIVE_GAME = getGameById(DEFAULT_GAME_ID);
export const PATCHES = ACTIVE_GAME.patches;
