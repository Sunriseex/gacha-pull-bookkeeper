const format = (n) => new Intl.NumberFormat("ru-RU").format(n);

const cardsConfig = (totals) => [
  ["Патчей загружено", totals.patchCount],
  ["Все персонажные крутки", totals.totalCharacterPulls],
  ["Крутки из валюты", totals.currencyPulls],
  ["Chartered HH Permit", totals.chartered],
  ["Basic HH Permit", totals.basic],
  ["Timed HH Permit", totals.timedPermits],
  ["Arsenal Tickets", totals.arsenal],
  ["Oroberyl", totals.oroberyl],
  ["Origeometry", totals.origeometry],
];

export const renderTotals = (target, totals) => {
  target.innerHTML = "";
  for (const [label, value] of cardsConfig(totals)) {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `<strong>${label}</strong><span>${format(value)}</span>`;
    target.appendChild(card);
  }
};

export const renderStatus = (target, text, isError = false) => {
  target.textContent = text;
  target.className = isError ? "status error" : "status";
};

export const setNumericText = (target, value) => {
  target.textContent = format(value);
};
