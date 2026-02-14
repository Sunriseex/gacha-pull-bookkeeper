import { PATCHES } from "./data/patches.js";
import {
  aggregateTotals,
  chartSeries,
} from "./domain/calculation.js";
import { drawPatchChart } from "./ui/chart.js";
import { renderTotals } from "./ui/render.js";

const state = {
  rows: PATCHES,
  options: {
    monthlySub: false,
    battlePassTier: 1,
  },
};

const refs = {
  monthlySub: document.querySelector("#monthlySub"),
  battlePassTierInputs: document.querySelectorAll(
    'input[name="battlePassTier"]',
  ),
  uiToggleBtn: document.querySelector("#uiToggleBtn"),
  totals: document.querySelector("#totals"),
  chart: document.querySelector("#patchChart"),
};

const applyOptionState = () => {
  state.options.monthlySub = refs.monthlySub.checked;
  const selectedBp = [...refs.battlePassTierInputs].find((input) => input.checked);
  state.options.battlePassTier = Number(selectedBp?.value ?? 1);
};

const renderDashboard = () => {
  const totals = aggregateTotals(state.rows, state.options);
  renderTotals(refs.totals, totals);
  drawPatchChart(refs.chart, chartSeries(state.rows, state.options));
};

const bindEvents = () => {
  refs.monthlySub.addEventListener("change", () => {
    applyOptionState();
    renderDashboard();
  });
  refs.battlePassTierInputs.forEach((input) => {
    input.addEventListener("change", () => {
      applyOptionState();
      renderDashboard();
    });
  });
  refs.uiToggleBtn.addEventListener("click", () => {
    const hidden = document.body.classList.toggle("ui-hidden");
    refs.uiToggleBtn.textContent = hidden ? "Show UI" : "Hide UI";
    refs.uiToggleBtn.setAttribute("aria-pressed", String(hidden));
  });
  window.addEventListener("resize", renderDashboard);
};

const init = () => {
  applyOptionState();
  bindEvents();
  renderDashboard();
};

init();
