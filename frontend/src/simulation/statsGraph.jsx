/**
 * Lightweight SVG-based real-time telemetry graph for simulation stats.
 * Displays population, food count, and average generation trends over time.
 */

const GRAPH_HEIGHT = 80;
const GRAPH_PADDING = 4;
const GRAPH_POINT_RADIUS = 2;
const GRAPH_STROKE_WIDTH = 1.5;

const METRIC_CONFIG = {
  population: { color: '#4ade80', label: 'Pop' },
  foodCount: { color: '#60a5fa', label: 'Food' },
  averageGeneration: { color: '#f472b6', label: 'Gen' }
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

export function StatsGraph({ history, metrics = ['population', 'foodCount', 'averageGeneration'], width = 280 }) {
  const safeHistory = Array.isArray(history) ? history : [];
  
  if (safeHistory.length < 2) {
    return (
      <div className="stats-graph" style={{ width, height: GRAPH_HEIGHT }} aria-hidden="true">
        <div className="stats-graph-empty">Collecting data...</div>
      </div>
    );
  }

  const tickValues = safeHistory.map((s) => s.tick);
  const minTick = Math.min(...tickValues);
  const maxTick = Math.max(...tickValues);
  const graphWidth = width - GRAPH_PADDING * 2;
  const graphHeight = GRAPH_HEIGHT - GRAPH_PADDING * 2;

  const paths = metrics.map((metric) => {
    const config = METRIC_CONFIG[metric];
    if (!config) return null;
    
    const bounds = getMetricBounds(safeHistory, metric);
    const points = safeHistory
      .map((sample) => {
        const x = GRAPH_PADDING + scaleX(sample.tick, minTick, maxTick, graphWidth);
        const y = GRAPH_PADDING + scaleY(sample[metric], bounds.min, bounds.max, graphHeight);
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

  const legend = metrics.map((metric) => {
    const config = METRIC_CONFIG[metric];
    if (!config) return null;
    return (
      <span key={metric} className="stats-graph-legend-item">
        <span className="stats-graph-swatch" style={{ backgroundColor: config.color }} />
        {config.label}
      </span>
    );
  });

  return (
    <div className="stats-graph" style={{ width, height: GRAPH_HEIGHT }} aria-hidden="true">
      <svg width={width} height={GRAPH_HEIGHT} viewBox={`0 0 ${width} ${GRAPH_HEIGHT}`}>
        {paths}
      </svg>
      <div className="stats-graph-legend">{legend}</div>
    </div>
  );
}
