import { resolveGameEconomy } from "../domain/economy.js";

const format = (n) => new Intl.NumberFormat("ru-RU").format(n);
const formatSmart = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) {
    return String(n);
  }
  if (Math.abs(value % 1) < 0.0001) {
    return format(Math.round(value));
  }
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
};

const safeAvg = (sum, count) => (count > 0 ? sum / count : 0);

const ICON_SETS = {
  "arknights-endfield": {
    oroberyl: "./assets/Endfield/Oroberyl.png",
    origeometry: "./assets/Endfield/Origeometry.png",
    arsenal: "./assets/Endfield/Arsenal_Ticket.png",
    basic: "./assets/Endfield/Basic_HH_Permit.png",
    chartered: "./assets/Endfield/Chartered_HH_Permit.png",
    timed: "./assets/Endfield/Timed_HH_Permit.png",
    firewalker: "./assets/Endfield/Timed_HH_Permit.png",
    messenger: "./assets/Endfield/Timed_HH_Permit.png",
    hues: "./assets/Endfield/Timed_HH_Permit.png",
  },
  "wuthering-waves": {
    astrite: "./assets/WuWa/Astrite.webp",
    lunite: "./assets/WuWa/Astrite.webp",
    forgingToken: "./assets/WuWa/Forging_Tide.webp",
    radiantTide: "./assets/WuWa/Radiant_Tide.webp",
    forgingTide: "./assets/WuWa/Forging_Tide.webp",
    lustrousTide: "./assets/WuWa/Lustrous_Tide.webp",
    timed: "./assets/WuWa/Forging_Tide.webp",
    // Legacy aliases.
    oroberyl: "./assets/WuWa/Astrite.webp",
    chartered: "./assets/WuWa/Radiant_Tide.webp",
    firewalker: "./assets/WuWa/Forging_Tide.webp",
    basic: "./assets/WuWa/Lustrous_Tide.webp",
  },
  "zenless-zone-zero": {
    polychrome: "./assets/ZZZ/Polychrome.webp",
    monochrome: "./assets/ZZZ/Polychrome.webp",
    boopon: "./assets/ZZZ/Boopon.webp",
    encryptedMasterTape: "./assets/ZZZ/Encrypted_Master_Tape.webp",
    masterTape: "./assets/ZZZ/Master_Tape.webp",
    // Legacy aliases.
    oroberyl: "./assets/ZZZ/Polychrome.webp",
    origeometry: "./assets/ZZZ/Polychrome.webp",
    chartered: "./assets/ZZZ/Encrypted_Master_Tape.webp",
    basic: "./assets/ZZZ/Master_Tape.webp",
    arsenal: "./assets/ZZZ/Boopon.webp",
  },
  "genshin-impact": {
    primogem: "./assets/Genshin/Primogem.webp",
    genesisCrystal: "./assets/Genshin/Primogem.webp",
    intertwinedFate: "./assets/Genshin/Intertwined_Fate.webp",
    acquaintFate: "./assets/Genshin/Acquaint_Fate.webp",
    // Legacy aliases.
    oroberyl: "./assets/Genshin/Primogem.webp",
    origeometry: "./assets/Genshin/Primogem.webp",
    chartered: "./assets/Genshin/Intertwined_Fate.webp",
    basic: "./assets/Genshin/Acquaint_Fate.webp",
  },
  "honkai-star-rail": {
    stellarJade: "./assets/HSR/Stellar_Jade.webp",
    oneiricShard: "./assets/HSR/Stellar_Jade.webp",
    specialPass: "./assets/HSR/Star_Rail_Special_Pass.webp",
    railPass: "./assets/HSR/Star_Rail_Pass.webp",
    // Legacy aliases.
    oroberyl: "./assets/HSR/Stellar_Jade.webp",
    origeometry: "./assets/HSR/Stellar_Jade.webp",
    chartered: "./assets/HSR/Star_Rail_Special_Pass.webp",
    basic: "./assets/HSR/Star_Rail_Pass.webp",
  },
};

const getResourceLabel = (game, key, fallback) => {
  const labels = game?.ui?.resourceLabels ?? {};
  return labels[key] ?? fallback;
};

const getResourceIcon = (game, key) => {
  const explicit = game?.ui?.resourceIcons?.[key];
  if (explicit) {
    return explicit;
  }
  return ICON_SETS[game?.id]?.[key] ?? null;
};

const cardsConfig = (totals, game) => {
  const economy = totals?.economy ?? resolveGameEconomy(game);
  const resources = totals?.resources ?? {};

  const avgPulls = safeAvg(totals.totalCharacterPullsNoBasicExact, totals.patchCount);
  const pullSummaryLabel =
    game?.ui?.pullSummaryLabel ?? "Total Character Pulls";

  const baseKey = economy.baseCurrencyKey;
  const premiumKey = economy.premiumCurrencyKey;
  const altKey = economy.altCurrencyKey;

  const featuredPermitKey =
    economy.pullPermitKeys.find((key) => !economy.timedPermitKeys.includes(key)) ||
    economy.pullPermitKeys[0] ||
    "chartered";
  const timedPermitKey = economy.timedPermitKeys[0] || "timed";

  const baseLabel = getResourceLabel(game, baseKey, "Base Currency");
  const premiumLabel = getResourceLabel(game, premiumKey, "Premium Currency");
  const altLabel = getResourceLabel(game, altKey, "Alt Currency");
  const timedLabel = getResourceLabel(
    game,
    "timed",
    getResourceLabel(game, timedPermitKey, "Timed Event Permits"),
  );

  const premiumHintParts = [];
  if (totals.premiumAsBaseAmount > 0) {
    premiumHintParts.push(`as ${baseLabel}: ${format(totals.premiumAsBaseAmount)}`);
  }
  if (totals.premiumAsAltAmount > 0) {
    premiumHintParts.push(`as ${altLabel}: ${format(totals.premiumAsAltAmount)}`);
  }

  return [
    { label: pullSummaryLabel, value: Math.round(totals.totalCharacterPullsNoBasicExact * 10) / 10 },
    { label: "Avg Pulls Per Patch", value: Math.round(avgPulls * 10) / 10 },
    { label: "Pulls From Currency", value: Math.round(totals.currencyPullsExact * 10) / 10 },
    {
      label: getResourceLabel(game, featuredPermitKey, "Featured Pull Permit"),
      value: resources[featuredPermitKey] ?? 0,
      icon: getResourceIcon(game, featuredPermitKey),
      hidden: (resources[featuredPermitKey] ?? 0) <= 0,
    },
    {
      label: timedLabel,
      value: totals.timedPermits,
      icon: getResourceIcon(game, "timed") || getResourceIcon(game, timedPermitKey),
      hidden: totals.timedPermits <= 0,
    },
    {
      label: getResourceLabel(game, economy.standardPermitKey, "Standard Pull Permit"),
      value: resources[economy.standardPermitKey] ?? 0,
      icon: getResourceIcon(game, economy.standardPermitKey),
      hidden: (resources[economy.standardPermitKey] ?? 0) <= 0,
    },
    {
      label: altLabel,
      value: totals.altCurrencyAmount,
      icon: getResourceIcon(game, altKey),
      hidden: totals.altCurrencyAmount <= 0,
    },
    {
      label: baseLabel,
      value: totals.baseCurrencyAmount,
      icon: getResourceIcon(game, baseKey),
    },
    {
      label: premiumLabel,
      value: totals.premiumCurrencyAmount,
      icon: getResourceIcon(game, premiumKey),
      className: "origeometry-card",
      hint: premiumHintParts.join(" | "),
      hidden: totals.premiumCurrencyAmount <= 0,
    },
    { label: "Patch Count", value: totals.patchCount },
  ].filter((card) => !card.hidden);
};

export const renderTotals = (target, totals, game) => {
  target.innerHTML = "";
  for (const cardConfig of cardsConfig(totals, game)) {
    const { label, value, hint, icon, className } = cardConfig;
    const card = document.createElement("article");
    card.className = `result-card${className ? ` ${className}` : ""}${
      icon ? " has-icon" : ""
    }`;
    if (icon) {
      const absoluteIconUrl = new URL(icon, window.location.href).href;
      card.style.setProperty("--card-icon", `url("${absoluteIconUrl}")`);
    }
    const labelNode = document.createElement("strong");
    labelNode.textContent = label;
    const valueNode = document.createElement("span");
    valueNode.textContent = formatSmart(value);
    card.appendChild(labelNode);
    card.appendChild(valueNode);
    if (hint) {
      const hintNode = document.createElement("small");
      hintNode.textContent = hint;
      card.appendChild(hintNode);
    }
    target.appendChild(card);
  }
};
