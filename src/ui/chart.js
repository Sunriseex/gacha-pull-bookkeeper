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

export const drawPatchChart = (canvas, series) => {
  const { ctx, width, height } = fitCanvasForDpr(canvas);
  ctx.clearRect(0, 0, width, height);

  if (!series.length) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText("Нет данных для графика", 20, 30);
    return;
  }

  const pad = { top: 20, right: 20, bottom: 60, left: 50 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...series.map((s) => s.value), 1);
  const barWidth = chartW / series.length;

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Segoe UI', sans-serif";
  for (let step = 0; step <= 4; step += 1) {
    const v = Math.round((maxValue / 4) * step);
    const y = pad.top + chartH - (chartH * step) / 4;
    ctx.fillText(String(v), 8, y + 4);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
  }

  series.forEach((item, idx) => {
    const barX = pad.left + idx * barWidth + barWidth * 0.15;
    const heightRatio = item.value / maxValue;
    const barH = Math.max(2, chartH * heightRatio);
    const barY = pad.top + chartH - barH;

    const gradient = ctx.createLinearGradient(0, barY, 0, barY + barH);
    gradient.addColorStop(0, "#22d3ee");
    gradient.addColorStop(1, "#2563eb");
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, barWidth * 0.7, barH);

    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.fillText(String(item.value), barX + barWidth * 0.35, barY - 6);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(item.label, barX + barWidth * 0.35, pad.top + chartH + 18);
  });

  ctx.textAlign = "left";
};
