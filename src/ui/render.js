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

const ICONS = {
  Oroberyl: "./assets/icons/Oroberyl.png",
  Origeometry: "./assets/icons/Origeometry.png",
  "Arsenal Tickets": "./assets/icons/Arsenal_Ticket.png",
  "Basic HH Permit": "./assets/icons/Basic_HH_Permit.png",
  "Chartered HH Permit": "./assets/icons/Chartered_HH_Permit.png",
  "Timed Event Permits": "./assets/icons/Timed_HH_Permit.png",
};

const cardsConfig = (totals, rates) => {
  const avgPulls = safeAvg(totals.totalCharacterPullsNoBasicExact, totals.patchCount);
  const origeometryAsOroberyl = totals.origeometry * rates.ORIGEOMETRY_TO_OROBERYL;
  const origeometryAsArsenal = totals.origeometry * rates.ORIGEOMETRY_TO_ARSENAL;

  return [
    { label: "Total Character Pulls (No Basic)", value: Math.round(totals.totalCharacterPullsNoBasicExact * 10) / 10 },
    { label: "Avg Pulls Per Patch", value: Math.round(avgPulls * 10) / 10 },
    { label: "Pulls From Currency", value: Math.round(totals.currencyPullsExact * 10) / 10 },
    {
      label: "Chartered HH Permit",
      value: totals.chartered,
      icon: ICONS["Chartered HH Permit"],
    },
    {
      label: "Timed Event Permits",
      value: totals.timedPermits,
      icon: ICONS["Timed Event Permits"],
    },
    {
      label: "Basic HH Permit",
      value: totals.basic,
      icon: ICONS["Basic HH Permit"],
    },
    {
      label: "Arsenal Tickets",
      value: totals.arsenal,
      icon: ICONS["Arsenal Tickets"],
    },
    {
      label: "Oroberyl",
      value: totals.oroberyl,
      icon: ICONS.Oroberyl,
    },
    {
      label: "Origeometry",
      value: totals.origeometry,
      icon: ICONS.Origeometry,
      className: "origeometry-card",
      hint: `as Oroberyl: ${format(origeometryAsOroberyl)} | as Arsenal: ${format(origeometryAsArsenal)}`,
    },
    { label: "Patch Count", value: totals.patchCount },
  ];
};

export const renderTotals = (
  target,
  totals,
  rates = {
    ORIGEOMETRY_TO_OROBERYL: 75,
    ORIGEOMETRY_TO_ARSENAL: 25,
  },
) => {
  target.innerHTML = "";
  for (const cardConfig of cardsConfig(totals, rates)) {
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
