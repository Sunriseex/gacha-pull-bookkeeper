const format = (n) => new Intl.NumberFormat("ru-RU").format(n);

const safeAvg = (sum, count) => (count > 0 ? sum / count : 0);

const ICONS = {
  Oroberyl: "assets/icons/Oroberyl.png",
  Origeometry: "assets/icons/Origeometry.png",
  "Arsenal Tickets": "assets/icons/Arsenal_Ticket.png",
  "Basic HH Permit": "assets/icons/Basic_HH_Permit.png",
  "Chartered HH Permit": "assets/icons/Chartered_HH_Permit.png",
  "Timed Event Permits": "assets/icons/Timed_HH_Permit.png",
};

const cardsConfig = (totals) => {
  const avgPulls = safeAvg(totals.totalCharacterPullsNoBasic, totals.patchCount);
  const origeometryAsOroberyl = totals.origeometry * 75;
  const origeometryAsArsenal = totals.origeometry * 25;

  return [
    ["Total Character Pulls (No Basic)", totals.totalCharacterPullsNoBasic],
    ["Avg Pulls Per Patch", Math.round(avgPulls * 10) / 10],
    ["Pulls From Currency", totals.currencyPulls],
    ["Chartered HH Permit", totals.chartered],
    ["Timed Event Permits", totals.timedPermits],
    ["Basic HH Permit", totals.basic],
    ["Arsenal Tickets", totals.arsenal],
    ["Oroberyl", totals.oroberyl],
    [
      "Origeometry",
      totals.origeometry,
      `as Oroberyl: ${format(origeometryAsOroberyl)} | as Arsenal: ${format(origeometryAsArsenal)}`,
    ],
    ["Origeometry Spent (BP)", totals.origeometrySpentOnBp],
    ["Patch Count", totals.patchCount],
  ];
};

const titleHtml = (label) => {
  const icon = ICONS[label];
  if (!icon) {
    return label;
  }
  return `<span class="card-title"><img src="${icon}" alt="" loading="lazy" onerror="this.style.display='none'"><span>${label}</span></span>`;
};

export const renderTotals = (target, totals) => {
  target.innerHTML = "";
  for (const [label, value, hint] of cardsConfig(totals)) {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `<strong>${titleHtml(label)}</strong><span>${format(value)}</span>${hint ? `<small>${hint}</small>` : ""}`;
    target.appendChild(card);
  }
};
