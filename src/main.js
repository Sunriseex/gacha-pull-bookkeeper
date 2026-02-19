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
  patchsyncBaseUrl: "bookkeeper:patchsyncBaseUrl",
  patchsyncToken: "bookkeeper:patchsyncToken",
};

const PATCHSYNC_DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const SYNC_BUTTON_RESET_MS = 2600;
const TOAST_DEFAULT_MS = 4200;

const getInitialGame = () => {
  const persistedGameId = localStorage.getItem(LOCAL_KEYS.selectedGameId);
  return getGameById(persistedGameId || DEFAULT_GAME_ID);
};

const getPatchsyncBaseUrl = () => {
  const configured = localStorage.getItem(LOCAL_KEYS.patchsyncBaseUrl);
  const value = String(configured ?? "").trim();
  return value || PATCHSYNC_DEFAULT_BASE_URL;
};

const getPatchsyncToken = () => {
  const configured = localStorage.getItem(LOCAL_KEYS.patchsyncToken);
  return String(configured ?? "").trim();
};

const formatGeneratedAt = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "Updated: n/a";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "Updated: n/a";
  }
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  return "Updated: " + formatted;
};

const collectSyncLogs = (payload = {}) => {
  const lines = [];
  if (Array.isArray(payload.logs)) {
    lines.push(...payload.logs);
  }
  if (Array.isArray(payload.results)) {
    for (const result of payload.results) {
      const prefix = result?.gameId ? "[" + result.gameId + "]" : "[sync]";
      for (const line of result?.logs ?? []) {
        lines.push(prefix + " " + line);
      }
      if (result?.error) {
        lines.push(prefix + " ERROR: " + result.error);
      }
    }
  }
  return lines;
};

const emitSyncLogs = (payload = {}) => {
  const lines = collectSyncLogs(payload);
  if (!lines.length) {
    return;
  }
  console.groupCollapsed("[patchsync] " + new Date().toLocaleTimeString());
  lines.forEach((line) => console.log(line));
  console.groupEnd();
};

const state = {
  game: getInitialGame(),
  optionsByGame: {},
  currentBackgroundUrl: "",
  bgTransitionTimer: null,
  syncFeedbackTimer: null,
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
  bgOverlayBase: document.querySelector(".bg-overlay-base"),
  bgOverlayFade: document.querySelector(".bg-overlay-fade"),
  toastRoot: document.querySelector("#toastRoot"),
};

const getRows = () => state.game.patches ?? [];

const ensureOptionsForGame = (game) => {
  if (!state.optionsByGame[game.id]) {
    state.optionsByGame[game.id] = { ...game.defaultOptions };
  }
  return state.optionsByGame[game.id];
};

const currentOptions = () => ensureOptionsForGame(state.game);

const ensureToastRoot = () => {
  if (refs.toastRoot) {
    return refs.toastRoot;
  }
  const root = document.createElement("div");
  root.id = "toastRoot";
  root.className = "toast-root";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  document.body.appendChild(root);
  refs.toastRoot = root;
  return root;
};

const showToast = (message, { type = "info", duration = TOAST_DEFAULT_MS } = {}) => {
  const text = String(message ?? "").trim();
  if (!text) {
    return;
  }

  const root = ensureToastRoot();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  root.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, duration);
};

const applyAnimatedTitle = (titleText, animate) => {
  if (!refs.title) {
    return;
  }

  refs.title.textContent = titleText;
  refs.title.classList.remove("title-switch-animate");
  if (!animate) {
    return;
  }

  void refs.title.offsetWidth;
  refs.title.classList.add("title-switch-animate");
};

const setUidButtonFeedback = (button, text, cssClass) => {
  button.classList.remove("copied", "copy-failed");
  if (cssClass) {
    button.classList.add(cssClass);
  }
  button.textContent = text;
};

const setSyncButton = (text, { disabled = false } = {}) => {
  if (!refs.syncSheetsBtn) {
    return;
  }
  refs.syncSheetsBtn.textContent = text;
  refs.syncSheetsBtn.disabled = disabled;
};

const resetSyncButton = () => {
  if (!refs.syncSheetsBtn) {
    return;
  }
  const label = refs.syncSheetsBtn.dataset.defaultLabel || "Sync Sheets";
  setSyncButton(label, { disabled: false });
};

const setSyncButtonFeedback = (text, { isRunning = false } = {}) => {
  if (!refs.syncSheetsBtn) {
    return;
  }

  if (state.syncFeedbackTimer) {
    window.clearTimeout(state.syncFeedbackTimer);
    state.syncFeedbackTimer = null;
  }

  setSyncButton(text, { disabled: isRunning });

  if (isRunning) {
    return;
  }

  state.syncFeedbackTimer = window.setTimeout(() => {
    resetSyncButton();
    state.syncFeedbackTimer = null;
  }, SYNC_BUTTON_RESET_MS);
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

const parseSyncPayload = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getFailedSyncResults = (results) =>
  Array.isArray(results) ? results.filter((entry) => Boolean(entry?.error)) : [];

const summarizeSyncResults = (results) => {
  if (!Array.isArray(results) || !results.length) {
    return "Sync complete";
  }
  const failedCount = getFailedSyncResults(results).length;
  if (failedCount > 0) {
    return "Sync errors: " + failedCount + "/" + results.length;
  }

  let updatedPatches = 0;
  let changedPatches = 0;
  for (const entry of results) {
    updatedPatches += Array.isArray(entry?.patches) ? entry.patches.length : 0;
    changedPatches += Number(entry?.changeCount || 0);
  }
  return "Synced " + results.length + " games (" + updatedPatches + " updates, " + changedPatches + " table changes)";
};

const buildFailedSyncDetails = (results) => {
  const failed = getFailedSyncResults(results);
  if (!failed.length) {
    return "";
  }

  const preview = failed
    .slice(0, 2)
    .map((entry) => `${entry.gameId}: ${entry.error}`)
    .join(" | ");
  if (failed.length <= 2) {
    return preview;
  }
  return `${preview} (+${failed.length - 2} more)`;
};

const buildSyncHeaders = (authToken) => {
  const headers = {
    "Content-Type": "application/json",
  };
  const token = String(authToken ?? "").trim();
  if (token) {
    headers["X-Patchsync-Token"] = token;
  }
  return headers;
};

const requestSyncAll = async (authToken) => {
  const response = await fetch(`${getPatchsyncBaseUrl()}/sync-all`, {
    method: "POST",
    headers: buildSyncHeaders(authToken),
    body: JSON.stringify({}),
  });
  const payload = await parseSyncPayload(response);
  return { response, payload };
};

const tryPromptPatchsyncToken = () => {
  const entered = window.prompt("Patchsync token required. Enter token:");
  const token = String(entered ?? "").trim();
  if (!token) {
    return "";
  }
  localStorage.setItem(LOCAL_KEYS.patchsyncToken, token);
  return token;
};

const syncAllGames = async () => {
  if (!refs.syncSheetsBtn || refs.syncSheetsBtn.disabled) {
    return;
  }

  setSyncButtonFeedback("Syncing...", { isRunning: true });

  let authToken = getPatchsyncToken();
  try {
    let { response, payload } = await requestSyncAll(authToken);

    if (response.status === 401) {
      const promptedToken = tryPromptPatchsyncToken();
      if (promptedToken) {
        authToken = promptedToken;
        ({ response, payload } = await requestSyncAll(authToken));
      }
    }

    if (!response.ok || !payload || payload.ok !== true) {
      const message = payload?.message || ("HTTP " + response.status);
      throw new Error(message);
    }

    emitSyncLogs(payload);

    const summary = summarizeSyncResults(payload.results);
    setSyncButtonFeedback(summary);

    const failedDetails = buildFailedSyncDetails(payload.results);
    if (failedDetails) {
      showToast(summary, { type: "warn" });
      showToast(failedDetails, { type: "error", duration: 6400 });
      return;
    }

    const logPath = (payload.results || []).find((entry) => entry?.changeLogPath)?.changeLogPath;
    if (logPath) {
      showToast("Change log: " + logPath, { type: "info", duration: 6200 });
    }

    showToast(summary, { type: "success" });
  } catch (error) {
    console.error("Sync all games failed", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    setSyncButtonFeedback("Sync failed");
    showToast(message || "Sync failed", { type: "error", duration: 6400 });
  }
};

const renderGameTabs = () => {
  refs.gameTabs.innerHTML = "";
  for (const game of GAME_CATALOG.games) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-tab";
    btn.dataset.gameId = game.id;

    const title = document.createElement("span");
    title.className = "game-tab-title";
    title.textContent = game.title;

    const updated = document.createElement("small");
    updated.className = "game-tab-meta";
    updated.textContent = formatGeneratedAt(game.generatedAt);

    btn.appendChild(title);
    btn.appendChild(updated);

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

const renderUidButtonForGame = (game) => {
  if (!refs.uidCopyBtn) {
    return;
  }

  const uid = String(game?.ui?.ownerUid ?? "").trim();
  if (!uid) {
    refs.uidCopyBtn.hidden = true;
    refs.uidCopyBtn.dataset.uid = "";
    refs.uidCopyBtn.dataset.defaultLabel = "";
    refs.uidCopyBtn.textContent = "";
    refs.uidCopyBtn.classList.remove("copied", "copy-failed");
    return;
  }

  const label = `UID: ${uid}`;
  refs.uidCopyBtn.hidden = false;
  refs.uidCopyBtn.dataset.uid = uid;
  refs.uidCopyBtn.dataset.defaultLabel = label;
  refs.uidCopyBtn.classList.remove("copied", "copy-failed");
  refs.uidCopyBtn.textContent = label;
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

const resolveBackgroundImage = (game) =>
  game?.ui?.backgroundImage || "./assets/backgrounds/endfield_background.png";

const applyGameBackground = (game) => {
  if (!refs.bgOverlayBase || !refs.bgOverlayFade) {
    return;
  }

  const backgroundPath = resolveBackgroundImage(game);
  const nextUrl = new URL(backgroundPath, window.location.href).href;

  if (!state.currentBackgroundUrl) {
    refs.bgOverlayBase.style.setProperty("--game-bg-image", `url("${nextUrl}")`);
    refs.bgOverlayFade.style.setProperty("--game-bg-image", `url("${nextUrl}")`);
    state.currentBackgroundUrl = nextUrl;
    return;
  }

  if (state.currentBackgroundUrl === nextUrl) {
    return;
  }

  refs.bgOverlayFade.style.setProperty("--game-bg-image", `url("${nextUrl}")`);
  refs.bgOverlayFade.classList.remove("is-visible");
  void refs.bgOverlayFade.offsetWidth;
  refs.bgOverlayFade.classList.add("is-visible");

  if (state.bgTransitionTimer) {
    window.clearTimeout(state.bgTransitionTimer);
  }

  state.bgTransitionTimer = window.setTimeout(() => {
    refs.bgOverlayBase.style.setProperty("--game-bg-image", `url("${nextUrl}")`);
    refs.bgOverlayFade.classList.remove("is-visible");
    state.currentBackgroundUrl = nextUrl;
    state.bgTransitionTimer = null;
  }, 600);
};

const applyGame = (gameId, { animateTitle = true } = {}) => {
  const previousGameId = state.game?.id;
  state.game = getGameById(gameId);
  localStorage.setItem(LOCAL_KEYS.selectedGameId, state.game.id);

  const shouldAnimateTitle = animateTitle && previousGameId && previousGameId !== state.game.id;
  applyAnimatedTitle(`${state.game.title} Bookkeeper`, shouldAnimateTitle);

  refs.chartTitle.textContent = state.game.ui?.chartTitle ?? "Pulls per version";
  renderGameTabs();
  renderControlsForGame();
  renderUidButtonForGame(state.game);
  applyGameBackground(state.game);
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
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) {
      return;
    }
    const target = rawTarget.closest(".game-tab");
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const gameId = target.dataset.gameId;
    if (!gameId || gameId === state.game.id) {
      return;
    }
    applyGame(gameId, { animateTitle: true });
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

  refs.uiToggleBtn.addEventListener("click", () => {
    const hidden = document.body.classList.toggle("ui-hidden");
    refs.uiToggleBtn.textContent = hidden ? "Show UI" : "Hide UI";
    refs.uiToggleBtn.setAttribute("aria-pressed", String(hidden));
  });

  refs.syncSheetsBtn?.addEventListener("click", () => {
    void syncAllGames();
  });

  window.addEventListener("resize", renderDashboard);
};

const init = () => {
  if (refs.syncSheetsBtn) {
    refs.syncSheetsBtn.dataset.defaultLabel = refs.syncSheetsBtn.textContent || "Sync Sheets";
  }
  bindEvents();
  applyGame(state.game.id, { animateTitle: false });
};

init();
