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

const END_FIELD_ICONS = {
  oroberyl: "./assets/icons/Oroberyl.png",
  origeometry: "./assets/icons/Origeometry.png",
  arsenal: "./assets/icons/Arsenal_Ticket.png",
  basic: "./assets/icons/Basic_HH_Permit.png",
  chartered: "./assets/icons/Chartered_HH_Permit.png",
  timed: "./assets/icons/Timed_HH_Permit.png",
};

const WUWA_ICONS = {
  oroberyl: "./assets/WuWa/Astrite.webp",
  chartered: "./assets/WuWa/Radiant_Tide.webp",
  timed: "./assets/WuWa/Forging_Tide.webp",
  basic: "./assets/WuWa/Lustrous_Tide.webp",
  arsenal: "./assets/WuWa/Forging_Tide.webp",
};

const ZZZ_ICONS = {
  oroberyl: "./assets/icons/Oroberyl.png",
  chartered: "./assets/icons/Chartered_HH_Permit.png",
  basic: "./assets/icons/Basic_HH_Permit.png",
  arsenal: "./assets/icons/Arsenal_Ticket.png",
};

const GAME_ICON_SETS = {
  "arknights-endfield": END_FIELD_ICONS,
  "wuthering-waves": WUWA_ICONS,
  "zenless-zone-zero": ZZZ_ICONS,
};

const getIconByKey = (gameId, key) => {
  const iconSet = GAME_ICON_SETS[gameId];
  return iconSet?.[key] ?? null;
};

const cardsConfig = (totals, game) => {
  const rates = game?.rates ?? {
    ORIGEOMETRY_TO_OROBERYL: 75,
    ORIGEOMETRY_TO_ARSENAL: 25,
  };
  const labels = game?.ui?.resourceLabels ?? {};
  const avgPulls = safeAvg(totals.totalCharacterPullsNoBasicExact, totals.patchCount);
  const origeometryAsOroberyl = totals.origeometry * rates.ORIGEOMETRY_TO_OROBERYL;
  const origeometryAsArsenal = totals.origeometry * rates.ORIGEOMETRY_TO_ARSENAL;
  const pullSummaryLabel =
    game?.ui?.pullSummaryLabel ?? "Total Character Pulls (No Basic)";

  return [
    { label: pullSummaryLabel, value: Math.round(totals.totalCharacterPullsNoBasicExact * 10) / 10 },
    { label: "Avg Pulls Per Patch", value: Math.round(avgPulls * 10) / 10 },
    { label: "Pulls From Currency", value: Math.round(totals.currencyPullsExact * 10) / 10 },
    {
      label: labels.chartered ?? "Chartered HH Permit",
      value: totals.chartered,
      icon: getIconByKey(game?.id, "chartered"),
    },
    {
      label: labels.timed ?? "Timed Event Permits",
      value: totals.timedPermits,
      icon: getIconByKey(game?.id, "timed"),
    },
    {
      label: labels.basic ?? "Basic HH Permit",
      value: totals.basic,
      icon: getIconByKey(game?.id, "basic"),
    },
    {
      label: labels.arsenal ?? "Arsenal Tickets",
      value: totals.arsenal,
      icon: getIconByKey(game?.id, "arsenal"),
      hidden: totals.arsenal <= 0,
    },
    {
      label: labels.oroberyl ?? "Oroberyl",
      value: totals.oroberyl,
      icon: getIconByKey(game?.id, "oroberyl"),
    },
    {
      label: labels.origeometry ?? "Origeometry",
      value: totals.origeometry,
      icon: getIconByKey(game?.id, "origeometry"),
      className: "origeometry-card",
      hint: `as ${labels.oroberyl ?? "Oroberyl"}: ${format(origeometryAsOroberyl)} | as ${labels.arsenal ?? "Arsenal"}: ${format(origeometryAsArsenal)}`,
      hidden: totals.origeometry <= 0,
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
