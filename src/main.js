import {
  DEFAULT_GAME_ID,
  GAME_CATALOG,
  getGameById,
} from "./data/patches.js";
import {
  aggregateTotals,
  chartSeries,
} from "./domain/calculation.js";
import { drawPatchChart } from "./ui/chart.js";
import { renderTotals } from "./ui/render.js";

const LOCAL_KEYS = {
  selectedGameId: "bookkeeper:selectedGameId",
  spreadsheetId: "owner:spreadsheetId",
  syncToken: "owner:patchsyncToken",
};

const PATCHSYNC_ENDPOINT = "http://127.0.0.1:8787/sync";

const getInitialGame = () => {
  const persistedGameId = localStorage.getItem(LOCAL_KEYS.selectedGameId);
  return getGameById(persistedGameId || DEFAULT_GAME_ID);
};

const state = {
  game: getInitialGame(),
  optionsByGame: {},
};

const refs = {
  title: document.querySelector("#appTitle"),
  gameTabs: document.querySelector("#gameTabs"),
  chartTitle: document.querySelector("#chartTitle"),
  monthlySub: document.querySelector("#monthlySub"),
  monthlyLabel: document.querySelector("#monthlyLabel"),
  battlePassLabel: document.querySelector("#battlePassLabel"),
  battlePassTierGroup: document.querySelector("#battlePassTierGroup"),
  optionFlags: document.querySelector("#optionFlags"),
  uidCopyBtn: document.querySelector("#uidCopyBtn"),
  syncSheetsBtn: document.querySelector("#syncSheetsBtn"),
  uiToggleBtn: document.querySelector("#uiToggleBtn"),
  totals: document.querySelector("#totals"),
  chart: document.querySelector("#patchChart"),
};

const getRows = () => state.game.patches ?? [];

const ensureOptionsForGame = (game) => {
  if (!state.optionsByGame[game.id]) {
    state.optionsByGame[game.id] = { ...game.defaultOptions };
  }
  return state.optionsByGame[game.id];
};

const currentOptions = () => ensureOptionsForGame(state.game);

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

const renderGameTabs = () => {
  refs.gameTabs.innerHTML = "";
  for (const game of GAME_CATALOG.games) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-tab";
    btn.dataset.gameId = game.id;
    btn.textContent = game.title;
    if (game.id === state.game.id) {
      btn.classList.add("active");
      btn.setAttribute("aria-current", "true");
    }
    refs.gameTabs.appendChild(btn);
  }
};

const renderBattlePassControls = () => {
  const options = currentOptions();
  const tiers = state.game.ui?.battlePass?.tiers ?? [];
  refs.battlePassTierGroup.innerHTML = "";
  refs.battlePassLabel.textContent = state.game.ui?.battlePass?.label ?? "Battle Pass";
  for (const tier of tiers) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "battlePassTier";
    input.value = String(tier.value);
    input.checked = Number(options.battlePassTier) === Number(tier.value);
    const span = document.createElement("span");
    span.textContent = tier.label;
    label.appendChild(input);
    label.appendChild(span);
    refs.battlePassTierGroup.appendChild(label);
  }
};

const renderOptionFlags = () => {
  const options = currentOptions();
  const flags = state.game.ui?.optionalToggles ?? [];
  refs.optionFlags.innerHTML = "";
  if (!flags.length) {
    refs.optionFlags.classList.add("empty");
    return;
  }
  refs.optionFlags.classList.remove("empty");

  for (const flag of flags) {
    const label = document.createElement("label");
    label.className = "flag-toggle";
    label.htmlFor = `flag-${flag.key}`;

    const input = document.createElement("input");
    input.id = `flag-${flag.key}`;
    input.type = "checkbox";
    input.dataset.optionKey = flag.key;
    input.checked = Boolean(options[flag.key]);

    const span = document.createElement("span");
    span.textContent = flag.label;

    label.appendChild(input);
    label.appendChild(span);
    refs.optionFlags.appendChild(label);
  }
};

const renderControlsForGame = () => {
  const options = currentOptions();
  refs.monthlyLabel.textContent = state.game.ui?.monthlyPassLabel ?? "Monthly Pass";
  refs.monthlySub.checked = Boolean(options.monthlySub);
  renderBattlePassControls();
  renderOptionFlags();
};

const runPatchsyncImport = async () => {
  const spreadsheetStorageKey = `${LOCAL_KEYS.spreadsheetId}:${state.game.id}`;
  const previousSpreadsheetId = localStorage.getItem(spreadsheetStorageKey) || "";
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

  const previousToken = localStorage.getItem(LOCAL_KEYS.syncToken) || "";
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
    gameId: state.game.id,
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

    localStorage.setItem(spreadsheetStorageKey, spreadsheetId);
    localStorage.setItem(LOCAL_KEYS.syncToken, syncToken);

    const lines = [
      `Game: ${state.game.title}`,
      `Patches: ${(data.patches || []).join(", ") || "n/a"}`,
      `Skipped: ${(data.skipped || []).join(", ") || "none"}`,
      `Output: ${data.outputPath || "src/data/*.generated.js"}`,
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
  const options = currentOptions();
  options.monthlySub = refs.monthlySub.checked;

  const selectedBp = refs.battlePassTierGroup.querySelector(
    'input[name="battlePassTier"]:checked',
  );
  options.battlePassTier = Number(selectedBp?.value ?? 1);

  const flagInputs = refs.optionFlags.querySelectorAll("input[data-option-key]");
  flagInputs.forEach((input) => {
    const key = input.dataset.optionKey;
    if (key) {
      options[key] = input.checked;
    }
  });
};

const renderDashboard = () => {
  const rows = getRows();
  const options = currentOptions();
  const totals = aggregateTotals(rows, options, state.game);
  renderTotals(refs.totals, totals, state.game);
  drawPatchChart(refs.chart, chartSeries(rows, options, state.game));
};

const applyGame = (gameId) => {
  state.game = getGameById(gameId);
  localStorage.setItem(LOCAL_KEYS.selectedGameId, state.game.id);
  refs.title.textContent = `${state.game.title} Bookkeeper`;
  refs.chartTitle.textContent = state.game.ui?.chartTitle ?? "Pulls per version";
  renderGameTabs();
  renderControlsForGame();
  renderDashboard();
};

const bindEvents = () => {
  refs.monthlySub.addEventListener("change", () => {
    applyOptionState();
    renderDashboard();
  });

  refs.battlePassTierGroup.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "battlePassTier") {
      return;
    }
    applyOptionState();
    renderDashboard();
  });

  refs.optionFlags.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.dataset.optionKey) {
      return;
    }
    applyOptionState();
    renderDashboard();
  });

  refs.gameTabs.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const gameId = target.dataset.gameId;
    if (!gameId || gameId === state.game.id) {
      return;
    }
    applyGame(gameId);
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
    refs.syncSheetsBtn.dataset.defaultLabel =
      refs.syncSheetsBtn.textContent || "Sync Sheets";
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
  bindEvents();
  applyGame(state.game.id);
};

init();
