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
  Events: "#a6e3a1",
  "Permanent Content": "#f9e2af",
  "Mailbox & Web Events": "#94e2d5",
  "Mailbox/Miscellaneous": "#94e2d5",
  "Daily Activity": "#cdd6f4",
  "Recurring Sources": "#89b4fa",
  "Endgame Modes": "#eba0ac",
  "Hollow Zero": "#74c7ec",
  "Coral Shop": "#cba6f7",
  "Weapon Pulls": "#89dceb",
  "Version Events": "#a6e3a1",
  "Paid Pioneer Podcast": "#fab387",
  "Lunite Subscription": "#b4befe",
  "Weekly Routine": "#bac2de",
  "Monumental Etching": "#f38ba8",
  "AIC Quota Exchange": "#f9e2af",
  "Urgent Recruit": "#89dceb",
  "HH Dossier": "#a6e3a1",
  "Monthly Pass": "#b4befe",
  "Originium Supply Pass": "#fab387",
  "Protocol Customized Pass": "#f5c2e7",
  "Exchange Crate-o-Surprise [M]": "#f2cdcd",
  "Exchange Crate-o-Surprise [L]": "#f5e0dc",
  Base: "#a6adc8",
};

const SOURCE_COLOR_ALIASES = {
  "Version Events": "Events",
  "Travel Log Events": "Events",
  "Other New Content": "Events",
  "Web, Mail, Apologems": "Mailbox & Web Events",
  "Mailbox/Miscellaneous": "Mailbox & Web Events",
  "Daily Resin/Commissions": "Daily Activity",
  "Daily Training": "Daily Activity",
  "Weekly Requests & Bounties": "Weekly Routine",
  "Weekly Modes": "Weekly Routine",
  "Abyss / Imaginarium / Stygian": "Endgame Modes",
  "Treasures Lightward": "Endgame Modes",
  Expeditions: "Recurring Sources",
  "Parametric Transformer": "Recurring Sources",
  Errands: "Recurring Sources",
  "Paimon's Bargains": "Coral Shop",
  "Embers Store": "Coral Shop",
  "Serenitea Realm Shop": "Coral Shop",
  "24-Hour Shop": "Coral Shop",
  "F2P Battle Pass": "Originium Supply Pass",
  "Battle Pass - F2P": "Originium Supply Pass",
  "Paid Battle Pass": "Protocol Customized Pass",
  "Battle Pass - Paid Bonus": "Protocol Customized Pass",
  "Inter-Knot Membership": "Monthly Pass",
  "Supply Pass": "Monthly Pass",
  Welkin: "Monthly Pass",
  "Lunite Subscription": "Monthly Pass",
};
const FALLBACK_COLORS = [
  "#89b4fa",
  "#fab387",
  "#a6e3a1",
  "#f5c2e7",
  "#b4befe",
  "#f38ba8",
];

const ANIMATION_DURATION_MS = 520;
const FONT_STACK = "'Segoe UI', 'Noto Sans', sans-serif";

const formatValue = (value) => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const PATCH_WIP_SUFFIX_PATTERN = /\(\s*(?:WIP|STC)\s*\)\s*$/i;

const splitPatchLabel = (label) => {
  const raw = String(label ?? "").trim();
  if (!raw) {
    return { base: "", isWip: false };
  }

  const isWip = PATCH_WIP_SUFFIX_PATTERN.test(raw);
  const base = isWip ? raw.replace(PATCH_WIP_SUFFIX_PATTERN, "").trim() : raw;
  return { base, isWip };
};

const drawRoundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
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

const yStepFor = (maxValue) => {
  if (maxValue <= 50) {
    return 5;
  }
  if (maxValue <= 200) {
    return 10;
  }
  return 20;
};

const scaleWithHeadroom = (maxValue) => {
  const baseMax = yMaxFor(maxValue);
  const fillRatio = maxValue / baseMax;
  if (fillRatio < 0.93) {
    return baseMax;
  }
  return baseMax + yStepFor(baseMax);
};

const hashLabel = (label) => {
  const input = String(label ?? "");
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const canonicalColorLabel = (label) => SOURCE_COLOR_ALIASES[label] ?? label;

const sourceColor = (label) => {
  const canonical = canonicalColorLabel(label);
  return (
    SOURCE_COLORS[canonical] ??
    FALLBACK_COLORS[hashLabel(canonical) % FALLBACK_COLORS.length]
  );
};

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
      hoverFrameId: null,
      pendingHoverPoint: null,
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
    state.pendingHoverPoint = { x, y };

    if (state.hoverFrameId !== null) {
      return;
    }

    state.hoverFrameId = requestAnimationFrame(() => {
      state.hoverFrameId = null;
      if (!state.pendingHoverPoint) {
        return;
      }
      const { x: pendingX, y: pendingY } = state.pendingHoverPoint;
      state.pendingHoverPoint = null;
      updateHover(canvas, pendingX, pendingY);
    });
  });

  canvas.addEventListener("mouseleave", () => {
    state.pendingHoverPoint = null;
    if (state.hoverFrameId !== null) {
      cancelAnimationFrame(state.hoverFrameId);
      state.hoverFrameId = null;
    }
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
  ctx.fillStyle = "rgba(17, 17, 27, 0.92)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "rgba(203, 166, 247, 0.8)";
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = "#cdd6f4";
  ctx.fillText(text, boxX + padX, boxY + 16);
};

const renderValueLabels = (ctx, labels, minY) => {
  if (!labels.length) {
    return;
  }

  const laneOffsets = [0, -14, -28];
  const laneRightEdge = laneOffsets.map(() => -Infinity);

  ctx.textAlign = "center";
  ctx.font = `11px ${FONT_STACK}`;
  ctx.fillStyle = "#cdd6f4";

  for (const label of labels.sort((a, b) => a.x - b.x)) {
    const textWidth = ctx.measureText(label.text).width;
    const halfWidth = textWidth / 2 + 4;

    let laneIndex = laneOffsets.length - 1;
    for (let i = 0; i < laneOffsets.length; i += 1) {
      if (label.x - halfWidth > laneRightEdge[i]) {
        laneIndex = i;
        break;
      }
    }

    const targetY = Math.max(minY, label.y + laneOffsets[laneIndex]);
    if (targetY < label.barTop - 2) {
      ctx.strokeStyle = "rgba(147, 153, 178, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(label.x, label.barTop - 2);
      ctx.lineTo(label.x, targetY + 3);
      ctx.stroke();
    }

    ctx.fillText(label.text, label.x, targetY);
    laneRightEdge[laneIndex] = label.x + halfWidth + 4;
  }
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
    ctx.fillStyle = "#cdd6f4";
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
    top: 48,
    right: 20 + legendWidth,
    bottom: 78 + legendHeight,
    left: 52,
  };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...series.map((s) => s.total), 1);
  const scaleMax = scaleWithHeadroom(maxValue);
  const slotWidth = chartW / series.length;
  const barWidth = Math.min(120, slotWidth * 0.58);
  const valueLabels = [];

  ctx.strokeStyle = "#45475a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#bac2de";
  ctx.font = `12px ${FONT_STACK}`;
  for (let step = 0; step <= 6; step += 1) {
    const v = (scaleMax / 6) * step;
    const y = pad.top + chartH - (chartH * step) / 6;
    ctx.fillText(formatValue(v), 8, y + 4);
    ctx.strokeStyle = "rgba(108, 112, 134, 0.35)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
  }

  const hasHover = Boolean(state.hoverSourceLabel);
  series.forEach((item, patchIdx) => {
    const barX = pad.left + slotWidth * patchIdx + (slotWidth - barWidth) / 2;
    let cursorY = pad.top + chartH;
    item.segments.forEach((segment) => {
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
      ctx.fillStyle = sourceColor(segment.label);
      ctx.fillRect(barX, cursorY, barWidth, segH);
      ctx.globalAlpha = 1;

      if (segmentHovered || (state.hoverSegmentKey === null && labelHovered)) {
        ctx.strokeStyle = "#f5e0dc";
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
    valueLabels.push({
      x: barX + barWidth / 2,
      y: cursorY - 8,
      barTop: cursorY,
      text: formatValue(item.total),
    });

    ctx.textAlign = "center";
    const xLabelY = pad.top + chartH + 20 + (patchIdx % 2) * 11;
    const patchLabel = splitPatchLabel(item.label);

    ctx.fillStyle = "#cdd6f4";
    ctx.font = `10px ${FONT_STACK}`;
    ctx.fillText(patchLabel.base || item.label, barX + barWidth / 2, xLabelY);

    if (patchLabel.isWip) {
      const badgeText = "WIP";
      ctx.font = `9px ${FONT_STACK}`;
      const badgeTextWidth = ctx.measureText(badgeText).width;
      const badgePadX = 5;
      const badgeW = Math.ceil(badgeTextWidth + badgePadX * 2);
      const badgeH = 12;
      const badgeX = Math.round(barX + barWidth / 2 - badgeW / 2);
      const badgeY = Math.round(xLabelY + 2);

      drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 5);
      ctx.fillStyle = "#f5c2e7";
      ctx.fill();
      ctx.strokeStyle = "#f38ba8";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#1e1e2e";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, barX + barWidth / 2, badgeY + badgeH / 2 + 0.5);
      ctx.textBaseline = "alphabetic";
    }
  });

  renderValueLabels(ctx, valueLabels, pad.top + 10);

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
    ctx.fillStyle = sourceColor(label);
    ctx.fillRect(legendX, y, 12, 12);
    ctx.fillStyle = isHovered ? "#f5e0dc" : "#bac2de";
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


