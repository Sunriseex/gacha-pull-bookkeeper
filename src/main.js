import { ACTIVE_GAME } from "./data/patches.js";
import {
  aggregateTotals,
  chartSeries,
} from "./domain/calculation.js";
import { drawPatchChart } from "./ui/chart.js";
import { renderTotals } from "./ui/render.js";

const state = {
  game: ACTIVE_GAME,
  rows: ACTIVE_GAME.patches,
  options: { ...ACTIVE_GAME.defaultOptions },
};

const refs = {
  monthlySub: document.querySelector("#monthlySub"),
  battlePassTierInputs: document.querySelectorAll(
    'input[name="battlePassTier"]',
  ),
  optBpCrates: document.querySelector("#optBpCrates"),
  optAicQuota: document.querySelector("#optAicQuota"),
  optUrgentRecruit: document.querySelector("#optUrgentRecruit"),
  optHhDossier: document.querySelector("#optHhDossier"),
  uidCopyBtn: document.querySelector("#uidCopyBtn"),
  syncSheetsBtn: document.querySelector("#syncSheetsBtn"),
  uiToggleBtn: document.querySelector("#uiToggleBtn"),
  totals: document.querySelector("#totals"),
  chart: document.querySelector("#patchChart"),
};

const IMPORT_STATE_KEYS = {
  spreadsheetId: "owner:spreadsheetId",
  syncToken: "owner:patchsyncToken",
};
const PATCHSYNC_ENDPOINT = "http://127.0.0.1:8787/sync";

const setUidButtonFeedback = (button, text, cssClass) => {
  button.classList.remove("copied", "copy-failed");
  if (cssClass) {
    button.classList.add(cssClass);
  }
  button.textContent = text;
};

const copyTextToClipboard = async (value) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("copy-fallback-failed");
  }
};

const runPatchsyncImport = async () => {
  const previousSpreadsheetId = localStorage.getItem(IMPORT_STATE_KEYS.spreadsheetId) || "";
  const spreadsheetIdInput = window.prompt(
    "Google Spreadsheet ID or full URL:",
    previousSpreadsheetId,
  );
  if (spreadsheetIdInput === null) {
    return;
  }
  const spreadsheetId = spreadsheetIdInput.trim();
  if (!spreadsheetId) {
    window.alert("Spreadsheet ID is required.");
    return;
  }

  const previousToken = localStorage.getItem(IMPORT_STATE_KEYS.syncToken) || "";
  const tokenInput = window.prompt(
    "Patchsync token (optional):",
    previousToken,
  );
  if (tokenInput === null) {
    return;
  }
  const syncToken = tokenInput.trim();

  const createBranch = window.confirm(
    "Create a new git branch before writing generated patches?",
  );

  const payload = {
    spreadsheetId,
    createBranch,
  };

  const button = refs.syncSheetsBtn;
  const defaultLabel = button?.dataset.defaultLabel || "Sync Sheets";
  if (button) {
    button.disabled = true;
    button.textContent = "Syncing...";
  }
  try {
    const response = await fetch(PATCHSYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(syncToken ? { "X-Patchsync-Token": syncToken } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const message = data.message || `Sync failed with status ${response.status}`;
      throw new Error(message);
    }

    localStorage.setItem(IMPORT_STATE_KEYS.spreadsheetId, spreadsheetId);
    localStorage.setItem(IMPORT_STATE_KEYS.syncToken, syncToken);

    const lines = [
      `Patches: ${(data.patches || []).join(", ") || "n/a"}`,
      `Skipped: ${(data.skipped || []).join(", ") || "none"}`,
      `Output: ${data.outputPath || "src/data/patches.generated.js"}`,
    ];
    if (data.branch) {
      lines.push(`Branch: ${data.branch}`);
    }
    lines.push("Reload this page to apply imported patches.");
    window.alert(lines.join("\n"));
  } catch (error) {
    window.alert(
      [
        "Google Sheets sync failed.",
        "",
        String(error?.message || error),
        "",
        "Make sure patchsync service is running:",
        "cd tools/patchsync",
        "go run . --serve",
      ].join("\n"),
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = defaultLabel;
    }
  }
};

const applyOptionState = () => {
  state.options.monthlySub = refs.monthlySub.checked;
  const selectedBp = [...refs.battlePassTierInputs].find((input) => input.checked);
  state.options.battlePassTier = Number(selectedBp?.value ?? 1);
  state.options.includeBpCrates = refs.optBpCrates.checked;
  state.options.includeAicQuotaExchange = refs.optAicQuota.checked;
  state.options.includeUrgentRecruit = refs.optUrgentRecruit.checked;
  state.options.includeHhDossier = refs.optHhDossier.checked;
};

const syncControlsFromState = () => {
  refs.monthlySub.checked = state.options.monthlySub;
  refs.battlePassTierInputs.forEach((input) => {
    input.checked = Number(input.value) === Number(state.options.battlePassTier);
  });
  refs.optBpCrates.checked = state.options.includeBpCrates;
  refs.optAicQuota.checked = state.options.includeAicQuotaExchange;
  refs.optUrgentRecruit.checked = state.options.includeUrgentRecruit;
  refs.optHhDossier.checked = state.options.includeHhDossier;
};

const renderDashboard = () => {
  const totals = aggregateTotals(state.rows, state.options, state.game.rates);
  renderTotals(refs.totals, totals, state.game.rates);
  drawPatchChart(refs.chart, chartSeries(state.rows, state.options, state.game.rates));
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
  [refs.optBpCrates, refs.optAicQuota, refs.optUrgentRecruit, refs.optHhDossier]
    .forEach((input) => {
      input.addEventListener("change", () => {
        applyOptionState();
        renderDashboard();
      });
    });
  refs.uidCopyBtn.addEventListener("click", async () => {
    const uid = refs.uidCopyBtn.dataset.uid;
    if (!uid) {
      return;
    }
    try {
      await copyTextToClipboard(uid);
      setUidButtonFeedback(refs.uidCopyBtn, "UID copied", "copied");
    } catch {
      setUidButtonFeedback(refs.uidCopyBtn, "Copy failed", "copy-failed");
    }
    window.setTimeout(() => {
      setUidButtonFeedback(
        refs.uidCopyBtn,
        refs.uidCopyBtn.dataset.defaultLabel || `UID: ${uid}`,
        null,
      );
    }, 1600);
  });
  if (refs.syncSheetsBtn) {
    refs.syncSheetsBtn.dataset.defaultLabel = refs.syncSheetsBtn.textContent || "Sync Sheets";
    refs.syncSheetsBtn.addEventListener("click", () => {
      runPatchsyncImport();
    });
  }
  refs.uiToggleBtn.addEventListener("click", () => {
    const hidden = document.body.classList.toggle("ui-hidden");
    refs.uiToggleBtn.textContent = hidden ? "Show UI" : "Hide UI";
    refs.uiToggleBtn.setAttribute("aria-pressed", String(hidden));
  });
  window.addEventListener("resize", renderDashboard);
};

const init = () => {
  syncControlsFromState();
  applyOptionState();
  bindEvents();
  renderDashboard();
};

init();
