/**
 * Lightweight SVG-based real-time telemetry graph for simulation stats.
 * Displays population, food count, and average generation trends over time.
 */

const GRAPH_HEIGHT = 80;
const LEGEND_HEIGHT = 24;
const GRAPH_PADDING = 4;
const Y_AXIS_LABEL_WIDTH = 24;
const X_AXIS_LABEL_HEIGHT = 12;
const GRAPH_POINT_RADIUS = 2;
const GRAPH_STROKE_WIDTH = 1.5;

// Expanded, more distinguishable colors on dark background
const METRIC_CONFIG = {
  population: { color: '#34d399', label: 'Pop', description: 'Population' },
  foodCount: { color: '#818cf8', label: 'Food', description: 'Food count' },
  averageGeneration: { color: '#fb923c', label: 'Gen', description: 'Avg generation' }
};

function getMetricBounds(history, metric) {
  const values = history.map((s) => s[metric]).filter((v) => v !== undefined);
  if (values.length === 0) {
    return { min: 0, max: 10 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // Add 10% padding
  return {
    min: Math.max(0, min - range * 0.1),
    max: max + range * 0.1
  };
}

function scaleX(tick, minTick, maxTick, width) {
  if (maxTick === minTick) return width / 2;
  return ((tick - minTick) / (maxTick - minTick)) * width;
}

function scaleY(value, minVal, maxVal, height) {
  if (maxVal === minVal) return height / 2;
  return height - ((value - minVal) / (maxVal - minVal)) * height;
}

/**
 * Format a metric value for axis labels.
 * Rounds to 1 decimal place, removes trailing zeros.
 */
function formatAxisValue(value) {
  if (value >= 100) {
    return String(Math.round(value));
  }
  const formatted = value.toFixed(1);
  return formatted.replace(/\.0$/, '');
}

/**
 * Format tick count for X-axis display.
 * Shows elapsed time in ticks as a compact label.
 */
function formatTickLabel(tick) {
  return `${tick}`;
}

export function StatsGraph({ history, metrics = ['population', 'foodCount', 'averageGeneration'], width = 280 }) {
  const safeHistory = Array.isArray(history) ? history : [];
  
  const graphContentWidth = width - Y_AXIS_LABEL_WIDTH - GRAPH_PADDING;
  const graphContentHeight = GRAPH_HEIGHT - GRAPH_PADDING * 2 - X_AXIS_LABEL_HEIGHT;
  const totalHeight = GRAPH_HEIGHT + LEGEND_HEIGHT;
  
  // Compute legend items upfront so they're available for both empty and populated states
  const legendItems = metrics.map((metric) => {
    const config = METRIC_CONFIG[metric];
    if (!config) return null;
    return (
      <span key={metric} className="stats-graph-legend-item">
        <span className="stats-graph-swatch" style={{ backgroundColor: config.color }} />
        {config.label}
      </span>
    );
  });

  if (safeHistory.length < 2) {
    return (
      <div className="stats-graph" style={{ width, height: totalHeight }} aria-hidden="true">
        <div className="stats-graph-empty">Data forming...</div>
        <div className="stats-graph-legend">{legendItems}</div>
      </div>
    );
  }

  const tickValues = safeHistory.map((s) => s.tick);
  const minTick = Math.min(...tickValues);
  const maxTick = Math.max(...tickValues);

  // Use the first metric's range for Y-axis labels
  const primaryMetric = metrics[0];
  const bounds = primaryMetric ? getMetricBounds(safeHistory, primaryMetric) : { min: 0, max: 10 };

  const paths = metrics.map((metric) => {
    const config = METRIC_CONFIG[metric];
    if (!config) return null;
    
    const metricBounds = getMetricBounds(safeHistory, metric);
    const points = safeHistory
      .map((sample) => {
        const x = Y_AXIS_LABEL_WIDTH + GRAPH_PADDING + scaleX(sample.tick, minTick, maxTick, graphContentWidth);
        const y = GRAPH_PADDING + scaleY(sample[metric], metricBounds.min, metricBounds.max, graphContentHeight);
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <polyline
        key={metric}
        points={points}
        fill="none"
        stroke={config.color}
        strokeWidth={GRAPH_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });

  // Y-axis labels: show min and max values
  const yAxisLabels = [
    { value: bounds.max, y: GRAPH_PADDING },
    { value: bounds.min, y: GRAPH_PADDING + graphContentHeight }
  ];

  // X-axis labels: show start and end ticks
  const xAxisLabels = [
    { value: minTick, x: Y_AXIS_LABEL_WIDTH + GRAPH_PADDING },
    { value: maxTick, x: Y_AXIS_LABEL_WIDTH + GRAPH_PADDING + graphContentWidth }
  ];

  return (
    <div className="stats-graph" style={{ width, height: totalHeight }} aria-hidden="true">
      <svg width={width} height={GRAPH_HEIGHT} viewBox={`0 0 ${width} ${GRAPH_HEIGHT}`}>
        {/* Y-axis labels */}
        {yAxisLabels.map((label, i) => (
          <text
            key={`y-${i}`}
            x={Y_AXIS_LABEL_WIDTH - 2}
            y={label.y + 4}
            textAnchor="end"
            className="stats-graph-axis-label"
          >
            {formatAxisValue(label.value)}
          </text>
        ))}
        {/* X-axis labels */}
        {xAxisLabels.map((label, i) => (
          <text
            key={`x-${i}`}
            x={label.x}
            y={GRAPH_HEIGHT - 2}
            textAnchor={i === 0 ? 'start' : 'end'}
            className="stats-graph-axis-label"
          >
            {formatTickLabel(label.value)}
          </text>
        ))}
        {paths}
      </svg>
      <div className="stats-graph-legend">{legendItems}</div>
    </div>
  );
}
