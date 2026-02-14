import { loadLocalJson, loadSheetCsv } from "./data/loaders.js";
import {
  aggregateTotals,
  calculatePatchTotals,
  chartSeries,
} from "./domain/calculation.js";
import {
  origeometryToArsenalTickets,
  origeometryToOroberyl,
  oroberylToPulls,
  safeNumber,
} from "./domain/conversion.js";
import { drawPatchChart } from "./ui/chart.js";
import { renderTotals, setNumericText } from "./ui/render.js";

const state = {
  rows: [],
  options: {
    monthlySub: true,
    battlePassTier: 1,
  },
};

const refs = {
  dataSource: () =>
    document.querySelector('input[name="dataSource"]:checked')?.value ?? "json",
  sheetUrl: document.querySelector("#sheetUrl"),
  loadDataBtn: document.querySelector("#loadDataBtn"),
  monthlySub: document.querySelector("#monthlySub"),
  battlePassTier: document.querySelector("#battlePassTier"),
  origeometryInput: document.querySelector("#origeometryInput"),
  oroberylFromOri: document.querySelector("#oroberylFromOri"),
  arsenalFromOri: document.querySelector("#arsenalFromOri"),
  charteredPulls: document.querySelector("#charteredPulls"),
  basicPulls: document.querySelector("#basicPulls"),
  timedPulls: document.querySelector("#timedPulls"),
  totals: document.querySelector("#totals"),
  chart: document.querySelector("#patchChart"),
};

const applyOptionState = () => {
  state.options.monthlySub = refs.monthlySub.checked;
  state.options.battlePassTier = Number(refs.battlePassTier.value);
};

const renderConversion = () => {
  const ori = safeNumber(refs.origeometryInput.value);
  const oroberyl = origeometryToOroberyl(ori);
  const arsenal = origeometryToArsenalTickets(ori);
  const pulls = oroberylToPulls(oroberyl);

  setNumericText(refs.oroberylFromOri, oroberyl);
  setNumericText(refs.arsenalFromOri, arsenal);
  setNumericText(refs.charteredPulls, pulls);
  setNumericText(refs.basicPulls, pulls);

  const aggregate = aggregateTotals(state.rows, state.options);
  setNumericText(refs.timedPulls, aggregate.timedPermits);
};

const renderDashboard = () => {
  const totals = aggregateTotals(state.rows, state.options);
  renderTotals(refs.totals, totals);
  drawPatchChart(refs.chart, chartSeries(state.rows, state.options));
  renderConversion();
};

const setLoadButtonState = (label, disabled) => {
  refs.loadDataBtn.textContent = label;
  refs.loadDataBtn.disabled = disabled;
};

const loadData = async () => {
  setLoadButtonState("Загрузка...", true);
  const source = refs.dataSource();
  try {
    if (source === "sheet") {
      state.rows = await loadSheetCsv(refs.sheetUrl.value.trim());
    } else {
      state.rows = await loadLocalJson();
    }

    if (!state.rows.length) {
      throw new Error("Источник вернул пустой список патчей");
    }
    renderDashboard();
  } catch (error) {
    // eslint-disable-next-line no-alert
    alert(error.message ?? "Ошибка загрузки данных");
  } finally {
    setLoadButtonState("Загрузить данные", false);
  }
};

const bindEvents = () => {
  refs.loadDataBtn.addEventListener("click", loadData);
  refs.monthlySub.addEventListener("change", () => {
    applyOptionState();
    renderDashboard();
  });
  refs.battlePassTier.addEventListener("change", () => {
    applyOptionState();
    renderDashboard();
  });
  refs.origeometryInput.addEventListener("input", renderConversion);
  window.addEventListener("resize", renderDashboard);
};

const init = async () => {
  applyOptionState();
  bindEvents();
  await loadData();

  if (state.rows[0]) {
    const latest = calculatePatchTotals(
      state.rows[state.rows.length - 1],
      state.options,
    );
    refs.origeometryInput.value = String(latest.origeometry);
    renderConversion();
  }
};

init();
