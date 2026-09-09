import { sourceColor } from "./chart.js";

const format = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

// Native disclosures work with touch, keyboards and screen readers.
export const renderMobileChart = (container, series) => {
  const expanded = new Set([...container.querySelectorAll("details[open]")].map(el => el.dataset.patch));
  const fragment = document.createDocumentFragment();
  const hint = document.createElement("p");
  hint.className = "mobile-chart-hint";
  hint.textContent = "Tap a version to see its sources";
  fragment.append(hint);
  const maximum = Math.max(1, ...series.map(item => item.total));
  for (const item of series) {
    const details = document.createElement("details");
    details.className = "patch-detail";
    details.dataset.patch = item.label;
    details.open = expanded.has(item.label);
    const summary = document.createElement("summary");
    const heading = document.createElement("span");
    heading.className = "patch-heading";
    const label = document.createElement("strong");
    label.textContent = item.label;
    const total = document.createElement("span");
    total.textContent = `${format.format(item.total)} pulls`;
    heading.append(label, total);
    const bar = document.createElement("span");
    bar.className = "patch-bar";
    bar.setAttribute("aria-hidden", "true");
    const sources = document.createElement("dl");
    for (const segment of item.segments) {
      if (segment.value <= 0) continue;
      const color = sourceColor(segment.label);
      const part = document.createElement("span");
      part.style.width = `${segment.value / maximum * 100}%`;
      part.style.backgroundColor = color;
      bar.append(part);
      const row = document.createElement("div");
      const name = document.createElement("dt");
      name.textContent = segment.label;
      name.style.setProperty("--source-color", color);
      const value = document.createElement("dd");
      value.textContent = format.format(segment.value);
      row.append(name, value);
      sources.append(row);
    }
    summary.append(heading, bar);
    details.append(summary, sources);
    fragment.append(details);
  }
  container.replaceChildren(fragment);
};
