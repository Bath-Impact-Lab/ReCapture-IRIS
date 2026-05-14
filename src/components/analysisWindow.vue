<template>
  <section class="analysis-window">
    <header class="analysis-header">
      <div class="analysis-title-block">
        <h2>Biomechanics Analysis</h2>
        <p>Session Snapshot</p>
        <div class="metric-categories">
          <button
            v-for="category in categoryOptions"
            :key="category.key"
            class="metric-category-btn"
            :class="{ active: activeCategory === category.key }"
            type="button"
            @click="selectCategory(category.key)"
          >
            {{ category.label }}
          </button>
        </div>
      </div>

      <div class="analysis-actions">
        <span class="analysis-chip">{{ activeCategoryLabel }}</span>
        <div ref="addChartDockRef" class="add-chart-dock">
          <Transition name="add-chart-modal">
            <div
              v-if="showAddChartModal"
              id="add-chart-modal"
              class="add-chart-modal"
              role="dialog"
              aria-label="Choose chart layout"
            >
              <button
                v-for="option in addChartOptions"
                :key="option.id"
                class="chart-option-btn"
                type="button"
                @click="selectAddChartOption(option)"
              >
                <span class="chart-option-graphic" :class="[`type-${option.chartType}`, `size-${option.size}`]" aria-hidden="true">
                  <svg
                    v-if="option.chartType === 'line'"
                    class="chart-preview chart-preview-line"
                    viewBox="0 0 120 48"
                  >
                    <path class="area" d="M8 37 L28 24 L48 28 L70 14 L90 20 L112 11 L112 42 L8 42 Z" />
                    <polyline class="trend" points="8,37 28,24 48,28 70,14 90,20 112,11" />
                    <circle class="point" cx="70" cy="14" r="2.2" />
                    <circle class="point" cx="90" cy="20" r="2.2" />
                  </svg>
                  <svg
                    v-else
                    class="chart-preview chart-preview-box"
                    viewBox="0 0 120 48"
                  >
                    <line class="whisker" x1="20" y1="10" x2="20" y2="38" />
                    <line class="whisker" x1="92" y1="12" x2="92" y2="40" />
                    <line class="cap" x1="14" y1="10" x2="26" y2="10" />
                    <line class="cap" x1="14" y1="38" x2="26" y2="38" />
                    <line class="cap" x1="86" y1="12" x2="98" y2="12" />
                    <line class="cap" x1="86" y1="40" x2="98" y2="40" />
                    <rect class="box" x="34" y="18" width="44" height="16" rx="3" />
                    <line class="median" x1="56" y1="18" x2="56" y2="34" />
                  </svg>
                </span>
                <span class="chart-option-text">
                  <span class="chart-option-title">{{ option.label }}</span>
                  <span class="chart-option-subtitle">{{ option.subtitle }}</span>
                </span>
              </button>
            </div>
          </Transition>
          <button
            ref="addChartButtonRef"
            class="add-chart-btn"
            type="button"
            aria-label="Add chart"
            aria-haspopup="dialog"
            aria-controls="add-chart-modal"
            :aria-expanded="showAddChartModal"
            @click="toggleAddChartModal"
          >
            <span class="add-chart-icon">+</span>
            <span>Add Chart</span>
          </button>
        </div>
      </div>
    </header>

    <div class="analysis-grid">
      <article
        v-for="card in chartCards"
        :key="card.id"
        class="analysis-card"
        :class="`size-${card.size}`"
        :data-template-data="serializeTemplateData(card.templateData)"
      >
        <div class="card-head">
          <h3>{{ card.title }}</h3>
          <div class="card-head-actions">
            <span>{{ card.unit }}</span>
            <button class="remove-chart-btn" type="button" :aria-label="`Remove ${card.title}`" @click="removeChart(card.id)">
              x
            </button>
          </div>
        </div>
        <div :ref="(el) => setChartHost(card.id, el)" class="chart-host"></div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { METRIC_CATEGORIES, buildMetricChartOption, getMetricTemplates } from '@/temp/analysisDefaults.js';
import type { MetricTemplate } from '@/temp/analysisDefaults.js';

const currentTheme = ref<'dark' | 'light'>(
  (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'dark'
);

interface ChartCard extends MetricTemplate {
  id: string;
  templateData: MetricTemplate;
}

interface AddChartOption {
  id: string;
  chartType: MetricTemplate['chartType'];
  size: MetricTemplate['size'];
  label: string;
  subtitle: string;
}

const addChartOptions: AddChartOption[] = [
  { id: 'wide-line', chartType: 'line', size: 'wide', label: 'Wide Line Chart', subtitle: 'Full-width trend' },
  { id: 'small-line', chartType: 'line', size: 'small', label: 'Small Line Chart', subtitle: 'Compact trend' },
  { id: 'wide-box', chartType: 'boxplot', size: 'wide', label: 'Wide Box Plot', subtitle: 'Full-width spread' },
  { id: 'small-box', chartType: 'boxplot', size: 'small', label: 'Small Box Plot', subtitle: 'Compact spread' },
];

const categoryOptions = METRIC_CATEGORIES;
const activeCategory = ref(categoryOptions[0]?.key ?? 'gait');
const categoryCursor = ref(0);
const categoryCursorByType = ref<Record<MetricTemplate['chartType'], number>>({ line: 0, boxplot: 0 });
const chartCards = ref<ChartCard[]>([]);
const showAddChartModal = ref(false);
const addChartDockRef = ref<HTMLDivElement | null>(null);
const addChartButtonRef = ref<HTMLButtonElement | null>(null);

const chartHosts = new Map<string, HTMLDivElement>();
const chartInstances = new Map<string, echarts.ECharts>();
let hostResizeObserver: ResizeObserver | null = null;

const activeCategoryLabel = computed(
  () => categoryOptions.find((option) => option.key === activeCategory.value)?.label ?? activeCategory.value,
);

function nextMetricTemplate(chartType?: MetricTemplate['chartType']): MetricTemplate | null {
  const templates = chartType
    ? getMetricTemplates(activeCategory.value).filter((template) => template.chartType === chartType)
    : getMetricTemplates(activeCategory.value);

  if (templates.length === 0) return null;

  if (!chartType) {
    const template = templates[categoryCursor.value % templates.length];
    categoryCursor.value += 1;
    return template;
  }

  const cursor = categoryCursorByType.value[chartType] ?? 0;
  const template = templates[cursor % templates.length];
  categoryCursorByType.value[chartType] = cursor + 1;
  return template;
}

function cloneMetricTemplate(template: MetricTemplate): MetricTemplate {
  return {
    ...template,
    xLabels: template.xLabels ? [...template.xLabels] : undefined,
    values: template.values ? [...template.values] : undefined,
    categories: template.categories ? [...template.categories] : undefined,
    stats: template.stats ? template.stats.map((stat) => [...stat]) : undefined,
  };
}

function buildCard(template: MetricTemplate): ChartCard {
  const templateData = cloneMetricTemplate(template);
  return {
    ...cloneMetricTemplate(template),
    id: `${activeCategory.value}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    templateData,
  };
}

function serializeTemplateData(templateData: MetricTemplate): string {
  return JSON.stringify(templateData);
}

function ensureHostResizeObserver() {
  if (hostResizeObserver || typeof ResizeObserver === 'undefined') return;

  hostResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) continue;
      const host = entry.target;
      if (!(host instanceof HTMLDivElement)) continue;
      const id = host.dataset.chartId;
      if (!id) continue;
      const card = chartCards.value.find((item) => item.id === id);
      if (card) renderChart(card);
    }
  });
}

function setChartHost(id: string, element: Element | null) {
  if (element instanceof HTMLDivElement) {
    ensureHostResizeObserver();
    element.dataset.chartId = id;
    hostResizeObserver?.observe(element);
    chartHosts.set(id, element);
    const card = chartCards.value.find((item) => item.id === id);
    if (card) renderChart(card);
    return;
  }
  const host = chartHosts.get(id);
  if (host) {
    hostResizeObserver?.unobserve(host);
    delete host.dataset.chartId;
  }
  chartHosts.delete(id);
  disposeChart(id);
}

function renderChart(card: ChartCard) {
  const host = chartHosts.get(card.id);
  if (!host) return;
  if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
  let chart = chartInstances.get(card.id);
  if (!chart) {
    chart = echarts.init(host);
    chartInstances.set(card.id, chart);
  } else {
    chart.resize();
  }
  chart.setOption(buildMetricChartOption(card, echarts, currentTheme.value), { notMerge: true });
}

function renderAllCharts() {
  chartCards.value.forEach((card) => renderChart(card));
}

function disposeChart(id: string) {
  const chart = chartInstances.get(id);
  if (!chart) return;
  chart.dispose();
  chartInstances.delete(id);
}

function disposeAllCharts() {
  for (const id of Array.from(chartInstances.keys())) {
    disposeChart(id);
  }
}

function addChart(chartType?: MetricTemplate['chartType'], size?: MetricTemplate['size']) {
  const template = nextMetricTemplate(chartType);
  if (!template) return;
  const chartTemplate = size ? { ...template, size } : template;
  chartCards.value.push(buildCard(chartTemplate));
  nextTick(() => renderAllCharts());
}

function removeChart(id: string) {
  const host = chartHosts.get(id);
  if (host) {
    hostResizeObserver?.unobserve(host);
    delete host.dataset.chartId;
  }
  chartCards.value = chartCards.value.filter((card) => card.id !== id);
  chartHosts.delete(id);
  disposeChart(id);
}

function closeAddChartModal() {
  showAddChartModal.value = false;
}

function toggleAddChartModal() {
  showAddChartModal.value = !showAddChartModal.value;
}

function selectAddChartOption(option: AddChartOption) {
  addChart(option.chartType, option.size);
  closeAddChartModal();
}

function seedCategory() {
  chartCards.value = [];
  chartHosts.clear();
  disposeAllCharts();
  categoryCursor.value = 0;
  categoryCursorByType.value = { line: 0, boxplot: 0 };
  addChart('line', 'wide');
  addChart('boxplot', 'small');
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!showAddChartModal.value) return;
  const dock = addChartDockRef.value;
  if (!dock) return;
  if (event.target instanceof Node && !dock.contains(event.target)) {
    closeAddChartModal();
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !showAddChartModal.value) return;
  closeAddChartModal();
  addChartButtonRef.value?.focus();
}

function selectCategory(key: string) {
  if (key === activeCategory.value) return;
  activeCategory.value = key;
  closeAddChartModal();
  seedCategory();
}

function handleResize() {
  chartInstances.forEach((chart) => chart.resize());
}

let themeObserver: MutationObserver | null = null;

onMounted(() => {
  ensureHostResizeObserver();
  seedCategory();
  window.addEventListener('resize', handleResize);
  window.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleDocumentKeydown);

  // Watch for data-theme changes on <html> and re-render charts
  themeObserver = new MutationObserver(() => {
    const newTheme = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'dark';
    if (newTheme !== currentTheme.value) {
      currentTheme.value = newTheme;
      // Dispose all instances so they reinit with the new background colour
      disposeAllCharts();
      nextTick(() => renderAllCharts());
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleDocumentKeydown);
  hostResizeObserver?.disconnect();
  hostResizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  disposeAllCharts();
  chartHosts.clear();
});
</script>

<style>
/* ── Analysis Window — theme-aware ── */
.analysis-window {
  position: absolute;
  width: 100%;
  height: 100%;
  padding: 20px;
  overflow: auto;
  background: radial-gradient(120% 120% at 15% 0%, rgba(45, 87, 138, 0.15) 0%, rgba(8, 13, 20, 0.95) 62%);
} 

[data-theme="light"] .analysis-window {
  background: #ffffff;
}

.analysis-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

[data-theme="light"] .analysis-header {
  border-bottom-color: rgba(31, 78, 121, 0.12);
}

.analysis-title-block h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #f2f6fa;
}

[data-theme="light"] .analysis-title-block h2 {
  color: #1F4E79;
}

.analysis-title-block p {
  margin: 2px 0 10px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.55);
}

[data-theme="light"] .analysis-title-block p {
  color: #2E86C1;
}

.metric-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metric-category-btn {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(12, 20, 30, 0.6);
  color: rgba(230, 237, 243, 0.82);
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.metric-category-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.metric-category-btn.active {
  color: #0d1722;
  border-color: rgba(128, 215, 255, 0.8);
  background: rgba(128, 215, 255, 0.9);
}

[data-theme="light"] .metric-category-btn {
  border-color: rgba(31, 78, 121, 0.2);
  background: #ffffff;
  color: #2E86C1;
}

[data-theme="light"] .metric-category-btn:hover {
  background: #cce4f6;
  border-color: #2E86C1;
}

[data-theme="light"] .metric-category-btn.active {
  color: #ffffff;
  background: #1D4ED8;
  border-color: #1D4ED8;
}

.analysis-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.analysis-chip {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a2ffd8;
  border: 1px solid rgba(97, 232, 170, 0.4);
  background: rgba(69, 212, 163, 0.12);
  font-weight: 700;
}

[data-theme="light"] .analysis-chip {
  color: #1F4E79;
  border-color: rgba(31, 78, 121, 0.25);
  background: rgba(204, 228, 246, 0.6);
}

.add-chart-dock {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  z-index: 8;
}

.add-chart-modal {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  transform: none;
  width: min(560px, calc(100vw - 120px));
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(140, 235, 175, 0.34);
  background: linear-gradient(160deg, rgba(13, 26, 36, 0.96), rgba(11, 18, 27, 0.94));
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(180, 255, 210, 0.12);
  backdrop-filter: blur(12px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

[data-theme="light"] .add-chart-modal {
  border-color: rgba(31, 78, 121, 0.15);
  background: #ffffff;
  box-shadow: 0 16px 34px rgba(31, 78, 121, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: none;
}

.chart-option-btn {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  border: 1px solid rgba(145, 230, 176, 0.25);
  background: rgba(20, 33, 46, 0.75);
  color: #e7fff0;
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.chart-option-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(151, 243, 187, 0.52);
  background: rgba(26, 43, 59, 0.88);
}

.chart-option-btn:focus-visible {
  outline: 2px solid rgba(151, 243, 187, 0.9);
  outline-offset: 2px;
}

[data-theme="light"] .chart-option-btn {
  border-color: rgba(31, 78, 121, 0.15);
  background: #f0f6fc;
  color: #1F4E79;
}

[data-theme="light"] .chart-option-btn:hover {
  border-color: #2E86C1;
  background: #cce4f6;
}

[data-theme="light"] .chart-option-btn:focus-visible {
  outline-color: #2E86C1;
}

.chart-option-graphic {
  height: 56px;
  border-radius: 8px;
  border: 1px solid rgba(143, 212, 255, 0.2);
  background: linear-gradient(180deg, rgba(26, 45, 64, 0.7), rgba(16, 30, 44, 0.55));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

[data-theme="light"] .chart-option-graphic {
  border-color: rgba(46, 134, 193, 0.2);
  background: linear-gradient(180deg, #e8f4fc, #daeaf6);
}

.chart-preview {
  width: 88px;
  height: 34px;
}

.chart-option-graphic.size-wide .chart-preview {
  width: 114px;
}

.chart-option-graphic.size-small .chart-preview {
  width: 82px;
}

.chart-preview-line .area {
  fill: rgba(104, 194, 255, 0.2);
}

.chart-option-graphic.type-line .chart-preview-line .trend {
  fill: none;
  stroke: #7bc8ff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-option-graphic.type-line .chart-preview-line .point {
  fill: #d8f5ff;
  stroke: #7bc8ff;
  stroke-width: 1.2;
}

.chart-option-graphic.type-boxplot .chart-preview-box .whisker,
.chart-option-graphic.type-boxplot .chart-preview-box .cap,
.chart-option-graphic.type-boxplot .chart-preview-box .median {
  stroke: #f8ce84;
  stroke-width: 2.4;
  stroke-linecap: round;
}

.chart-option-graphic.type-boxplot .chart-preview-box .box {
  fill: rgba(247, 196, 105, 0.22);
  stroke: #f8ce84;
  stroke-width: 2.2;
}

[data-theme="light"] .chart-preview-line .area {
  fill: rgba(46, 134, 193, 0.15);
}

[data-theme="light"] .chart-option-graphic.type-line .chart-preview-line .trend {
  stroke: #2E86C1;
}

[data-theme="light"] .chart-option-graphic.type-line .chart-preview-line .point {
  fill: #ffffff;
  stroke: #2E86C1;
  stroke-width: 1.5;
}

[data-theme="light"] .chart-option-graphic.type-boxplot .chart-preview-box .whisker,
[data-theme="light"] .chart-option-graphic.type-boxplot .chart-preview-box .cap,
[data-theme="light"] .chart-option-graphic.type-boxplot .chart-preview-box .median {
  stroke: #1D4ED8;
}

[data-theme="light"] .chart-option-graphic.type-boxplot .chart-preview-box .box {
  fill: rgba(29, 78, 216, 0.12);
  stroke: #1D4ED8;
}

.chart-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chart-option-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.chart-option-subtitle {
  font-size: 0.67rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(204, 228, 214, 0.73);
}

[data-theme="light"] .chart-option-title {
  color: #1F4E79;
}

[data-theme="light"] .chart-option-subtitle {
  color: #2E86C1;
}

.add-chart-modal-enter-active,
.add-chart-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.add-chart-modal-enter-from,
.add-chart-modal-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.add-chart-modal-enter-to,
.add-chart-modal-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.add-chart-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(29, 78, 216, 0.4);
  background: linear-gradient(135deg, #1D4ED8, #1F4E79);
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(29, 78, 216, 0.25);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.add-chart-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.92rem;
  line-height: 1;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.add-chart-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 8px 20px rgba(29, 78, 216, 0.35);
}

.add-chart-btn:active {
  transform: translateY(0);
  filter: brightness(0.97);
}

.add-chart-btn:focus-visible {
  outline: 2px solid #38BDF8;
  outline-offset: 2px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.analysis-card {
  grid-column: span 6;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(14, 24, 36, 0.7);
  backdrop-filter: blur(6px);
  padding: 14px;
}

[data-theme="light"] .analysis-card {
  border-color: rgba(31, 78, 121, 0.12);
  background: #ffffff;
  backdrop-filter: none;
  box-shadow: 0 2px 10px rgba(31, 78, 121, 0.07);
}

.analysis-card.size-wide {
  grid-column: span 12;
}

.analysis-card.size-small {
  grid-column: span 6;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

[data-theme="light"] .card-head {
  border-bottom-color: rgba(31, 78, 121, 0.08);
}

.card-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.card-head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #e6edf3;
}

[data-theme="light"] .card-head h3 {
  color: #1F4E79;
}

.card-head span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
}

[data-theme="light"] .card-head span {
  color: #2E86C1;
}

.remove-chart-btn {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(13, 22, 33, 0.65);
  color: rgba(236, 246, 255, 0.86);
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

[data-theme="light"] .remove-chart-btn {
  border-color: rgba(31, 78, 121, 0.2);
  background: #f0f6fc;
  color: #2E86C1;
}

.remove-chart-btn:hover {
  border-color: rgba(255, 128, 128, 0.55);
  background: rgba(65, 24, 24, 0.7);
  transform: translateY(-1px);
}

[data-theme="light"] .remove-chart-btn:hover {
  border-color: rgba(220, 50, 50, 0.5);
  background: rgba(220, 50, 50, 0.07);
  color: #dc3232;
}

.remove-chart-btn:active {
  transform: translateY(0);
}

.remove-chart-btn:focus-visible {
  outline: 2px solid rgba(220, 50, 50, 0.6);
  outline-offset: 2px;
}

.chart-host {
  width: 100%;
  height: 235px;
}

.analysis-card.size-wide .chart-host {
  height: 300px;
}

@media (max-width: 1200px) {
  .analysis-card,
  .analysis-card.size-small,
  .analysis-card.size-wide {
    grid-column: span 12;
  }
}

@media (max-width: 768px) {
  .analysis-window {
    inset: var(--app-topbar-height, 63px) 0 0 0;
    padding: 12px 12px 78px;
  }

  .analysis-header {
    flex-direction: column;
    align-items: stretch;
  }

  .analysis-actions {
    justify-content: space-between;
  }

  .add-chart-dock {
    bottom: 12px;
  }

  .add-chart-modal {
    width: min(540px, calc(100vw - 28px));
    bottom: calc(100% + 8px);
    padding: 10px;
    gap: 8px;
  }

  .chart-option-btn {
    padding: 8px;
    gap: 6px;
  }

  .chart-option-graphic {
    height: 48px;
  }

  .chart-option-graphic.size-wide .chart-preview {
    width: 98px;
  }

  .chart-option-graphic.size-small .chart-preview {
    width: 74px;
  }
}
</style>
