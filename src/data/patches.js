import {
  GENERATED_PATCHES as GENERATED_ENDFIELD_PATCHES,
  GENERATED_PATCHES_META as GENERATED_ENDFIELD_META,
} from "./endfield.generated.js";
import {
  GENERATED_PATCHES as GENERATED_WUWA_PATCHES,
  GENERATED_PATCHES_META as GENERATED_WUWA_META,
} from "./wuwa.generated.js";
import {
  GENERATED_PATCHES as GENERATED_ZZZ_PATCHES,
  GENERATED_PATCHES_META as GENERATED_ZZZ_META,
} from "./zzz.generated.js";
import {
  GENERATED_PATCHES as GENERATED_GENSHIN_PATCHES,
  GENERATED_PATCHES_META as GENERATED_GENSHIN_META,
} from "./genshin.generated.js";
import {
  GENERATED_PATCHES as GENERATED_HSR_PATCHES,
  GENERATED_PATCHES_META as GENERATED_HSR_META,
} from "./hsr.generated.js";

const ENDFIELD_GAME_ID = "arknights-endfield";
const WUWA_GAME_ID = "wuthering-waves";
const ZZZ_GAME_ID = "zenless-zone-zero";
const GENSHIN_GAME_ID = "genshin-impact";
const HSR_GAME_ID = "honkai-star-rail";

const rewards = (value = {}) => {
  const normalized = {};
  for (const [key, amount] of Object.entries(value ?? {})) {
    normalized[key] = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  }
  return normalized;
};

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

const validateRewardsShape = (value, context) => {
  assert(value && typeof value === "object", `${context} rewards must be an object`);
  for (const [key, amount] of Object.entries(value)) {
    assert(typeof key === "string" && key.trim(), `${context} has an invalid key`);
    assert(
      Number.isFinite(Number(amount)),
      `${context}.${key} must be numeric`,
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
      Number.isFinite(Number(src.pulls)),
      `${context}.pulls must be numeric`,
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
  if (patch.tags !== undefined) {
    assert(Array.isArray(patch.tags), `${context}.tags must be an array when provided`);
    for (const [tagIndex, tag] of patch.tags.entries()) {
      assert(
        typeof tag === "string" && tag.trim(),
        `${context}.tags[${tagIndex}] must be a non-empty string`,
      );
    }
  }
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


const validateEconomy = (economy, context) => {
  assert(economy && typeof economy === "object", `${context}.economy is required`);
  assert(
    Array.isArray(economy.resourceKeys) && economy.resourceKeys.length > 0,
    `${context}.economy.resourceKeys must be a non-empty array`,
  );

  for (const [idx, key] of economy.resourceKeys.entries()) {
    assert(
      typeof key === "string" && key.trim(),
      `${context}.economy.resourceKeys[${idx}] must be a non-empty string`,
    );
  }

  const uniqueKeys = new Set(economy.resourceKeys);
  assert(
    uniqueKeys.size === economy.resourceKeys.length,
    `${context}.economy.resourceKeys contains duplicates`,
  );

  const requiredKeyProps = [
    "baseCurrencyKey",
    "premiumCurrencyKey",
    "altCurrencyKey",
    "standardPermitKey",
  ];

  for (const prop of requiredKeyProps) {
    const value = economy[prop];
    assert(
      typeof value === "string" && value.trim(),
      `${context}.economy.${prop} must be a non-empty string`,
    );
    assert(
      uniqueKeys.has(value),
      `${context}.economy.${prop} must exist in economy.resourceKeys`,
    );
  }

  const permitArrays = [
    ["pullPermitKeys", economy.pullPermitKeys],
    ["timedPermitKeys", economy.timedPermitKeys],
  ];

  for (const [prop, values] of permitArrays) {
    assert(Array.isArray(values), `${context}.economy.${prop} must be an array`);
    for (const [idx, key] of values.entries()) {
      assert(
        typeof key === "string" && key.trim(),
        `${context}.economy.${prop}[${idx}] must be a non-empty string`,
      );
      assert(
        uniqueKeys.has(key),
        `${context}.economy.${prop}[${idx}] must exist in economy.resourceKeys`,
      );
    }
  }

  if (economy.resourceAliases !== null && economy.resourceAliases !== undefined) {
    assert(
      economy.resourceAliases && typeof economy.resourceAliases === "object",
      `${context}.economy.resourceAliases must be an object`,
    );
    for (const [canonicalKey, aliases] of Object.entries(economy.resourceAliases)) {
      assert(
        uniqueKeys.has(canonicalKey),
        `${context}.economy.resourceAliases key "${canonicalKey}" must exist in economy.resourceKeys`,
      );
      assert(
        Array.isArray(aliases),
        `${context}.economy.resourceAliases.${canonicalKey} must be an array`,
      );
      for (const [idx, aliasKey] of aliases.entries()) {
        assert(
          typeof aliasKey === "string" && aliasKey.trim(),
          `${context}.economy.resourceAliases.${canonicalKey}[${idx}] must be a non-empty string`,
        );
      }
    }
  }

  assert(
    economy.rates && typeof economy.rates === "object",
    `${context}.economy.rates is required`,
  );
  assert(
    Number(economy.rates.basePerPull) > 0,
    `${context}.economy.rates.basePerPull must be > 0`,
  );
  assert(
    Number(economy.rates.premiumToBase) >= 0,
    `${context}.economy.rates.premiumToBase must be >= 0`,
  );
  assert(
    Number(economy.rates.premiumToAlt) >= 0,
    `${context}.economy.rates.premiumToAlt must be >= 0`,
  );
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
  validateEconomy(game.economy, context);
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
            astrite: 3455,
            radiantTide: 4,
            forgingTide: 0,
            lustrousTide: 24,
          },
          pulls: 25.6,
        }),
        source({
          id: "permanent",
          label: "Permanent Content",
          rewards: {
            astrite: 21765,
            radiantTide: 15,
            forgingTide: 0,
            lustrousTide: 58,
          },
          pulls: 151.0,
        }),
        source({
          id: "mailbox",
          label: "Mailbox/Miscellaneous",
          rewards: {
            astrite: 920,
            radiantTide: 30,
            forgingTide: 0,
            lustrousTide: 45,
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
            astrite: 3960,
            radiantTide: 6,
            forgingTide: 0,
            lustrousTide: 17,
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
            astrite: 680,
            radiantTide: 5,
            forgingTide: 2,
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
              rewardsPerCycle: { astrite: 90 },
            }),
          ],
          pulls: 20.3,
        }),
      ],
    },
  ];

const ZZZ_BASE_PATCHES = [
  {
    id: "1.0",
    patch: "1.0",
    versionName: "Version 1.0",
    startDate: "2024-07-04",
    durationDays: 41,
    notes: "Baseline fallback patch for Zenless Zone Zero. Real values are imported from generated data.",
    sources: [
      source({
        id: "events",
        label: "Events",
        rewards: {
          polychrome: 3040,
          encryptedMasterTape: 20,
          masterTape: 10,
          boopon: 19,
        },
      }),
    ],
  },
];
const GENSHIN_BASE_PATCHES = [
  {
    id: "1.0",
    patch: "1.0",
    versionName: "Version 1.0",
    startDate: "2020-09-28",
    durationDays: 42,
    notes: "Baseline fallback patch for Genshin Impact. Real values are imported from generated data.",
    sources: [
      source({
        id: "baseline",
        label: "Baseline",
        rewards: {
          primogem: 11986.9863,
          acquaintFate: 11.90410959,
          intertwinedFate: 16.90410959,
        },
      }),
    ],
  },
];

const HSR_BASE_PATCHES = [
  {
    id: "1.0",
    patch: "1.0",
    versionName: "Version 1.0",
    startDate: "2023-04-26",
    durationDays: 42,
    notes: "Baseline fallback patch for Honkai: Star Rail. Real values are imported from generated data.",
    sources: [
      source({
        id: "dailyTraining",
        label: "Daily Training",
        rewards: {
          stellarJade: 2520,
        },
      }),
      source({
        id: "weeklyModes",
        label: "Weekly Modes",
        rewards: {
          stellarJade: 780,
          railPass: 6,
        },
      }),
      source({
        id: "treasuresLightward",
        label: "Treasures Lightward",
        rewards: {
          stellarJade: 1800,
        },
      }),
      source({
        id: "embersStore",
        label: "Embers Store",
        rewards: {
          specialPass: 6.9,
          railPass: 6.9,
        },
      }),
      source({
        id: "travelLogEvents",
        label: "Travel Log Events",
        rewards: {
          stellarJade: 540,
          specialPass: 10,
        },
      }),
      source({
        id: "permanent",
        label: "Permanent Content",
        rewards: {
          stellarJade: 23125,
          railPass: 155,
        },
      }),
      source({
        id: "mailbox",
        label: "Mailbox & Web Events",
        rewards: {
          stellarJade: 1163,
          specialPass: 10,
          railPass: 20,
        },
      }),
      source({
        id: "paidBattlePass",
        label: "Paid Battle Pass",
        gate: "bp2",
        rewards: {
          stellarJade: 680,
          specialPass: 4,
        },
      }),
      source({
        id: "supplyPass",
        label: "Supply Pass",
        gate: "monthly",
        rewards: {
          stellarJade: 4200,
        },
      }),
    ],
  },
];
export const GAME_CATALOG = {
  schemaVersion: "3.2",
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
      economy: {
        resourceKeys: ["oroberyl", "origeometry", "arsenal", "chartered", "basic", "firewalker", "messenger", "hues"],
        baseCurrencyKey: "oroberyl",
        premiumCurrencyKey: "origeometry",
        altCurrencyKey: "arsenal",
        pullPermitKeys: ["chartered", "firewalker", "messenger", "hues"],
        timedPermitKeys: ["firewalker", "messenger", "hues"],
        standardPermitKey: "basic",
        rates: {
          basePerPull: 500,
          premiumToBase: 75,
          premiumToAlt: 25,
        },
      },
      defaultOptions: {
        monthlySub: false,
        battlePassTier: 2,
        includeBpCrates: true,
        includeAicQuotaExchange: true,
        includeUrgentRecruit: false,
        includeHhDossier: false,
      },
      ui: {
        chartTitle: "Character pulls per version",
        pullSummaryLabel: "Total Character Pulls (No Basic)",
        monthlyPassLabel: "Monthly Pass",
        backgroundImage: "./assets/backgrounds/endfield_background.png",
        ownerUid: "6639599843",
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
        pull: ["radiantTide", "forgingTide"],
        timed: ["forgingTide"],
      },
      economy: {
        resourceKeys: [
          "astrite",
          "lunite",
          "forgingToken",
          "radiantTide",
          "lustrousTide",
          "forgingTide",
        ],
        resourceAliases: {
          astrite: ["oroberyl"],
          lunite: ["origeometry"],
          forgingToken: ["arsenal"],
          radiantTide: ["chartered"],
          lustrousTide: ["basic"],
          forgingTide: ["firewalker"],
        },
        baseCurrencyKey: "astrite",
        premiumCurrencyKey: "lunite",
        altCurrencyKey: "forgingToken",
        pullPermitKeys: ["radiantTide", "forgingTide"],
        timedPermitKeys: ["forgingTide"],
        standardPermitKey: "lustrousTide",
        rates: {
          basePerPull: 160,
          premiumToBase: 1,
          premiumToAlt: 1,
        },
      },
      defaultOptions: {
        monthlySub: false,
        battlePassTier: 1,
      },
      ui: {
        chartTitle: "Event pulls per version",
        pullSummaryLabel: "Total Event Pulls (No Lustrous)",
        monthlyPassLabel: "Lunite Subscription",
        backgroundImage: "./assets/backgrounds/wuwa_background.jpg",
        ownerUid: "605020180",
        battlePass: {
          label: "Pioneer Podcast",
          tiers: [
            { value: 1, label: "F2P" },
            { value: 2, label: "Paid" },
          ],
        },
        optionalToggles: [],
        resourceLabels: {
          astrite: "Astrites",
          lunite: "Lunite",
          forgingToken: "Forging Tokens",
          radiantTide: "Radiant Tide",
          timed: "Forging Tide",
          forgingTide: "Forging Tide",
          lustrousTide: "Lustrous Tide",
        },
      },
      patches: WUWA_BASE_PATCHES,
    },
    {
      id: ZZZ_GAME_ID,
      title: "Zenless Zone Zero",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 1,
        ORIGEOMETRY_TO_ARSENAL: 1,
        OROBERYL_PER_PULL: 160,
      },
      permitKeys: {
        pull: ["encryptedMasterTape"],
        timed: [],
      },
      economy: {
        resourceKeys: [
          "polychrome",
          "monochrome",
          "boopon",
          "encryptedMasterTape",
          "masterTape",
        ],
        resourceAliases: {
          polychrome: ["oroberyl"],
          monochrome: ["origeometry"],
          boopon: ["arsenal"],
          encryptedMasterTape: ["chartered"],
          masterTape: ["basic"],
        },
        baseCurrencyKey: "polychrome",
        premiumCurrencyKey: "monochrome",
        altCurrencyKey: "boopon",
        pullPermitKeys: ["encryptedMasterTape"],
        timedPermitKeys: [],
        standardPermitKey: "masterTape",
        rates: {
          basePerPull: 160,
          premiumToBase: 1,
          premiumToAlt: 1,
        },
      },
      defaultOptions: {
        monthlySub: false,
        battlePassTier: 1,
      },
      ui: {
        chartTitle: "Exclusive pulls per version",
        pullSummaryLabel: "Total Exclusive Pulls",
        monthlyPassLabel: "Inter-Knot Membership",
        backgroundImage: "./assets/backgrounds/zzz_background.jpg",
        battlePass: {
          label: "Battle Pass",
          tiers: [
            { value: 1, label: "F2P" },
            { value: 2, label: "Paid" },
          ],
        },
        optionalToggles: [],
        resourceLabels: {
          polychrome: "Polychromes",
          monochrome: "Monochrome",
          boopon: "Boopons",
          encryptedMasterTape: "Encrypted Master Tape",
          masterTape: "Master Tape",
        },
      },
      patches: ZZZ_BASE_PATCHES,
    },
    {
      id: GENSHIN_GAME_ID,
      title: "Genshin Impact",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 1,
        ORIGEOMETRY_TO_ARSENAL: 1,
        OROBERYL_PER_PULL: 160,
      },
      permitKeys: {
        pull: ["intertwinedFate"],
        timed: [],
      },
      economy: {
        resourceKeys: [
          "primogem",
          "genesisCrystal",
          "starglitter",
          "intertwinedFate",
          "acquaintFate",
        ],
        resourceAliases: {
          primogem: ["oroberyl"],
          genesisCrystal: ["origeometry"],
          starglitter: ["arsenal"],
          intertwinedFate: ["chartered"],
          acquaintFate: ["basic"],
        },
        baseCurrencyKey: "primogem",
        premiumCurrencyKey: "genesisCrystal",
        altCurrencyKey: "starglitter",
        pullPermitKeys: ["intertwinedFate"],
        timedPermitKeys: [],
        standardPermitKey: "acquaintFate",
        rates: {
          basePerPull: 160,
          premiumToBase: 1,
          premiumToAlt: 1,
        },
      },
      defaultOptions: {
        monthlySub: false,
        battlePassTier: 1,
      },
      ui: {
        chartTitle: "Wishes per version",
        pullSummaryLabel: "Total Wishes (No Acquaint)",
        monthlyPassLabel: "Welkin Moon",
        backgroundImage: "./assets/backgrounds/genshin_background.jpg",
        battlePass: {
          label: "Battle Pass",
          tiers: [
            { value: 1, label: "F2P" },
            { value: 2, label: "Paid" },
          ],
        },
        optionalToggles: [],
        resourceLabels: {
          primogem: "Primogems",
          genesisCrystal: "Genesis Crystals",
          starglitter: "Masterless Starglitter",
          intertwinedFate: "Intertwined Fate",
          acquaintFate: "Acquaint Fate",
        },
      },
      patches: GENSHIN_BASE_PATCHES,
    },
    {
      id: HSR_GAME_ID,
      title: "Honkai: Star Rail",
      rates: {
        ORIGEOMETRY_TO_OROBERYL: 1,
        ORIGEOMETRY_TO_ARSENAL: 1,
        OROBERYL_PER_PULL: 160,
      },
      permitKeys: {
        pull: ["specialPass"],
        timed: [],
      },
      economy: {
        resourceKeys: [
          "stellarJade",
          "oneiricShard",
          "tracksOfDestiny",
          "specialPass",
          "railPass",
        ],
        resourceAliases: {
          stellarJade: ["oroberyl"],
          oneiricShard: ["origeometry"],
          tracksOfDestiny: ["arsenal"],
          specialPass: ["chartered"],
          railPass: ["basic"],
        },
        baseCurrencyKey: "stellarJade",
        premiumCurrencyKey: "oneiricShard",
        altCurrencyKey: "tracksOfDestiny",
        pullPermitKeys: ["specialPass"],
        timedPermitKeys: [],
        standardPermitKey: "railPass",
        rates: {
          basePerPull: 160,
          premiumToBase: 1,
          premiumToAlt: 1,
        },
      },
      defaultOptions: {
        monthlySub: false,
        battlePassTier: 1,
      },
      ui: {
        chartTitle: "Limited pulls per version",
        pullSummaryLabel: "Total Limited Pulls (No Star Rail Pass)",
        monthlyPassLabel: "Supply Pass",
        backgroundImage: "./assets/backgrounds/hsr_background.jpeg",
        battlePass: {
          label: "Nameless Honor",
          tiers: [
            { value: 1, label: "F2P" },
            { value: 2, label: "Paid" },
          ],
        },
        optionalToggles: [],
        resourceLabels: {
          stellarJade: "Stellar Jade",
          oneiricShard: "Oneiric Shard",
          tracksOfDestiny: "Tracks of Destiny",
          specialPass: "Star Rail Special Pass",
          railPass: "Star Rail Pass",
        },
      },
      patches: HSR_BASE_PATCHES,
    },
  ],
};

const generatedByGame = {
  [ENDFIELD_GAME_ID]: GENERATED_ENDFIELD_PATCHES,
  [WUWA_GAME_ID]: GENERATED_WUWA_PATCHES,
  [ZZZ_GAME_ID]: GENERATED_ZZZ_PATCHES,
  [GENSHIN_GAME_ID]: GENERATED_GENSHIN_PATCHES,
  [HSR_GAME_ID]: GENERATED_HSR_PATCHES,
};

const generatedMetaByGame = {
  [ENDFIELD_GAME_ID]: GENERATED_ENDFIELD_META,
  [WUWA_GAME_ID]: GENERATED_WUWA_META,
  [ZZZ_GAME_ID]: GENERATED_ZZZ_META,
  [GENSHIN_GAME_ID]: GENERATED_GENSHIN_META,
  [HSR_GAME_ID]: GENERATED_HSR_META,
};

GAME_CATALOG.games = GAME_CATALOG.games.map((game) => {
  const generatedPatches = Array.isArray(generatedByGame[game.id])
    ? generatedByGame[game.id]
    : [];
  const generatedMeta = generatedMetaByGame[game.id];

  return {
    ...game,
    generatedAt: typeof generatedMeta?.generatedAt === "string" ? generatedMeta.generatedAt : "",
    patches: mergeGeneratedPatches(game.patches, generatedPatches),
  };
});

for (const [gameIndex, game] of GAME_CATALOG.games.entries()) {
  validateGame(game, gameIndex);
}

export const DEFAULT_GAME_ID = ENDFIELD_GAME_ID;
export const getGameById = (id) =>
  GAME_CATALOG.games.find((game) => game.id === id) ?? GAME_CATALOG.games[0];

export const ACTIVE_GAME = getGameById(DEFAULT_GAME_ID);
export const PATCHES = ACTIVE_GAME.patches;















