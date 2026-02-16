const chartStateMap = new WeakMap();

const applyCanvasWidthForSeries = (canvas) => {
  const containerWidth =
    canvas.parentElement?.clientWidth || canvas.clientWidth || canvas.width || 1200;
  canvas.style.width = `${Math.round(containerWidth)}px`;
};

const fitCanvasForDpr = (canvas) => {
  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvas.clientWidth || canvas.width;
  const logicalHeight = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(logicalWidth * dpr);
  canvas.height = Math.floor(logicalHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: logicalWidth, height: logicalHeight };
};

const SOURCE_COLORS = {
  Events: "#9ece2e",
  "Permanent Content": "#d7d35a",
  "Mailbox & Web Events": "#79b7ab",
  "Mailbox/Miscellaneous": "#79b7ab",
  "Daily Activity": "#cfd4dc",
  "Recurring Sources": "#6f84cd",
  "Endgame Modes": "#ffc0cb",
  "Coral Shop": "#a21caf",
  "Weapon Pulls": "#62b242",
  "Version Events": "#9ece2e",
  "Paid Pioneer Podcast": "#ecb34c",
  "Lunite Subscription": "#a06ed4",
  "Weekly Routine": "#8f959f",
  "Monumental Etching": "#ef6363",
  "AIC Quota Exchange": "#f8b44c",
  "Urgent Recruit": "#5ec0ff",
  "HH Dossier": "#7dd98e",
  "Monthly Pass": "#a06ed4",
  "Originium Supply Pass": "#ecb34c",
  "Protocol Customized Pass": "#cf6f93",
  "Exchange Crate-o-Surprise [M]": "#f39c6b",
  "Exchange Crate-o-Surprise [L]": "#e879b8",
  Base: "#a8b0bc",
};

const FALLBACK_COLORS = [
  "#60a5fa",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#f87171",
];

const ANIMATION_DURATION_MS = 520;
const FONT_STACK = "'Segoe UI', 'Noto Sans', sans-serif";

const formatValue = (value) => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const yMaxFor = (maxValue) => {
  if (maxValue <= 50) {
    return Math.ceil(maxValue / 5) * 5;
  }
  if (maxValue <= 200) {
    return Math.ceil(maxValue / 10) * 10;
  }
  return Math.ceil(maxValue / 20) * 20;
};

const sourceColor = (label, idx) =>
  SOURCE_COLORS[label] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

const getState = (canvas) => {
  if (!chartStateMap.has(canvas)) {
    chartStateMap.set(canvas, {
      hoverSegmentKey: null,
      hoverSourceLabel: null,
      hoverInfo: null,
      segmentRegions: [],
      legendRegions: [],
      series: [],
      listenersBound: false,
      lastSignature: "",
      animationFrameId: null,
    });
  }
  return chartStateMap.get(canvas);
};

const clearHover = (canvas) => {
  const state = getState(canvas);
  if (!state.hoverSegmentKey && !state.hoverSourceLabel) {
    return;
  }
  state.hoverSegmentKey = null;
  state.hoverSourceLabel = null;
  state.hoverInfo = null;
  renderPatchChart(canvas, state.series, state, 1);
};

const matchRegion = (x, y, regions) =>
  regions.find(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  );

const updateHover = (canvas, pointX, pointY) => {
  const state = getState(canvas);
  const segment = matchRegion(pointX, pointY, state.segmentRegions);
  if (segment) {
    const changed =
      state.hoverSegmentKey !== segment.key ||
      state.hoverSourceLabel !== segment.label;
    if (!changed) {
      return;
    }
    state.hoverSegmentKey = segment.key;
    state.hoverSourceLabel = segment.label;
    state.hoverInfo = {
      patchLabel: segment.patchLabel,
      label: segment.label,
      value: segment.value,
    };
    renderPatchChart(canvas, state.series, state, 1);
    return;
  }

  const legend = matchRegion(pointX, pointY, state.legendRegions);
  if (legend) {
    const changed = state.hoverSourceLabel !== legend.label || state.hoverSegmentKey !== null;
    if (!changed) {
      return;
    }
    state.hoverSegmentKey = null;
    state.hoverSourceLabel = legend.label;
    state.hoverInfo = {
      patchLabel: "All patches",
      label: legend.label,
      value: legend.totalValue,
    };
    renderPatchChart(canvas, state.series, state, 1);
    return;
  }

  clearHover(canvas);
};

const bindHoverListeners = (canvas) => {
  const state = getState(canvas);
  if (state.listenersBound) {
    return;
  }
  state.listenersBound = true;

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * canvas.clientWidth;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.clientHeight;
    updateHover(canvas, x, y);
  });

  canvas.addEventListener("mouseleave", () => {
    clearHover(canvas);
  });
};

const renderHoverLabel = (ctx, width, hoverInfo) => {
  if (!hoverInfo) {
    return;
  }
  const text = `${hoverInfo.patchLabel} - ${hoverInfo.label}: ${formatValue(hoverInfo.value)}`;
  const padX = 9;
  const boxH = 24;
  ctx.font = `13px ${FONT_STACK}`;
  const textW = ctx.measureText(text).width;
  const boxW = Math.min(width - 16, textW + padX * 2);
  const boxX = 8;
  const boxY = 8;
  ctx.fillStyle = "rgba(2, 6, 23, 0.9)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "rgba(34, 211, 238, 0.75)";
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(text, boxX + padX, boxY + 16);
};

const buildSignature = (series) =>
  JSON.stringify(
    series.map((item) => ({
      label: item.label,
      total: Math.round(item.total * 1000) / 1000,
      segments: item.segments.map((seg) => ({
        id: seg.id,
        value: Math.round(seg.value * 1000) / 1000,
      })),
    })),
  );

const renderPatchChart = (canvas, series, state, progress = 1) => {
  const { ctx, width, height } = fitCanvasForDpr(canvas);
  ctx.clearRect(0, 0, width, height);
  state.segmentRegions = [];
  state.legendRegions = [];
  state.series = series;

  if (!series.length) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `16px ${FONT_STACK}`;
    ctx.fillText("Нет данных для графика", 20, 30);
    return;
  }

  const eased = easeOutCubic(progress);

  const allLabels = [];
  for (const patch of series) {
    for (const segment of patch.segments) {
      if (!allLabels.includes(segment.label)) {
        allLabels.push(segment.label);
      }
    }
  }

  const desktopLegend = width >= 860;
  const legendWidth = desktopLegend ? 260 : 0;
  const legendHeight = desktopLegend ? 0 : Math.max(100, allLabels.length * 20 + 16);
  const pad = {
    top: 36,
    right: 20 + legendWidth,
    bottom: 66 + legendHeight,
    left: 52,
  };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...series.map((s) => s.total), 1);
  const scaleMax = yMaxFor(maxValue);
  const slotWidth = chartW / series.length;
  const barWidth = Math.min(120, slotWidth * 0.58);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#a7b2c2";
  ctx.font = `12px ${FONT_STACK}`;
  for (let step = 0; step <= 6; step += 1) {
    const v = (scaleMax / 6) * step;
    const y = pad.top + chartH - (chartH * step) / 6;
    ctx.fillText(formatValue(v), 8, y + 4);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
  }

  const hasHover = Boolean(state.hoverSourceLabel);
  series.forEach((item, patchIdx) => {
    const barX = pad.left + slotWidth * patchIdx + (slotWidth - barWidth) / 2;
    let cursorY = pad.top + chartH;
    item.segments.forEach((segment, segmentIdx) => {
      if (segment.value <= 0) {
        return;
      }

      const key = `${patchIdx}:${segment.id}`;
      const segH = Math.max(1, (segment.value / scaleMax) * chartH * eased);
      cursorY -= segH;

      const labelHovered = state.hoverSourceLabel === segment.label;
      const segmentHovered = state.hoverSegmentKey === key;
      let alpha = 1;
      if (hasHover && !labelHovered) {
        alpha = 0.3;
      }
      if (hasHover && labelHovered && !segmentHovered) {
        alpha = 0.9;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = sourceColor(segment.label, segmentIdx);
      ctx.fillRect(barX, cursorY, barWidth, segH);
      ctx.globalAlpha = 1;

      if (segmentHovered || (state.hoverSegmentKey === null && labelHovered)) {
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX, cursorY, barWidth, segH);
      }

      state.segmentRegions.push({
        key,
        patchLabel: item.label,
        label: segment.label,
        value: segment.value,
        x: barX,
        y: cursorY,
        w: barWidth,
        h: segH,
      });
    });
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.font = `11px ${FONT_STACK}`;
    ctx.fillText(formatValue(item.total), barX + barWidth / 2, cursorY - 8);
    ctx.font = `10px ${FONT_STACK}`;
    ctx.fillText(item.label, barX + barWidth / 2, pad.top + chartH + 20);
  });

  const totalsByLabel = allLabels.reduce((acc, label) => {
    acc[label] = series.reduce((sum, item) => {
      const seg = item.segments.find((s) => s.label === label);
      return sum + (seg?.value ?? 0);
    }, 0);
    return acc;
  }, {});

  const legendX = desktopLegend ? width - legendWidth + 12 : pad.left;
  const legendY = desktopLegend ? pad.top + 2 : height - legendHeight + 10;
  ctx.textAlign = "left";
  ctx.font = `14px ${FONT_STACK}`;
  allLabels.forEach((label, idx) => {
    const y = legendY + idx * 20;
    const isHovered = state.hoverSourceLabel === label;
    ctx.fillStyle = sourceColor(label, idx);
    ctx.fillRect(legendX, y, 12, 12);
    ctx.fillStyle = isHovered ? "#f8fafc" : "#d1dae6";
    ctx.fillText(label, legendX + 20, y + 11);
    state.legendRegions.push({
      label,
      totalValue: totalsByLabel[label],
      x: legendX,
      y,
      w: desktopLegend ? legendWidth - 20 : Math.max(140, ctx.measureText(label).width + 24),
      h: 14,
    });
  });

  renderHoverLabel(ctx, width, state.hoverInfo);
  ctx.textAlign = "left";
};

const animateTo = (canvas, series, state) => {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  const startAt = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - startAt) / ANIMATION_DURATION_MS);
    renderPatchChart(canvas, series, state, progress);
    if (progress < 1) {
      state.animationFrameId = requestAnimationFrame(frame);
    } else {
      state.animationFrameId = null;
    }
  };
  state.animationFrameId = requestAnimationFrame(frame);
};

export const drawPatchChart = (canvas, series) => {
  applyCanvasWidthForSeries(canvas);
  bindHoverListeners(canvas);
  const state = getState(canvas);
  const signature = buildSignature(series);
  if (signature !== state.lastSignature) {
    state.lastSignature = signature;
    animateTo(canvas, series, state);
    return;
  }
  renderPatchChart(canvas, series, state, 1);
};
