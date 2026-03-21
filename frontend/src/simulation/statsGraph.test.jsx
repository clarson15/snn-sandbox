import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatsGraph } from './statsGraph';

afterEach(() => {
  cleanup();
});

describe('StatsGraph', () => {
  it('renders empty state when history has less than 2 samples', () => {
    const { container } = render(<StatsGraph history={[]} />);
    expect(container.querySelector('.stats-graph-empty')).toHaveTextContent('Data forming...');
  });

  it('renders empty state for null/undefined history', () => {
    const { container } = render(<StatsGraph history={null} />);
    expect(container.querySelector('.stats-graph-empty')).toHaveTextContent('Data forming...');
  });

  it('renders SVG with polylines when history has enough data', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 },
      { tick: 20, population: 12, foodCount: 8, averageGeneration: 2.5, averageEnergy: 6 }
    ];

    const { container } = render(<StatsGraph history={history} />);
    
    const svg = container.querySelector('.stats-graph svg');
    expect(svg).toBeInTheDocument();
    
    const polylines = container.querySelectorAll('.stats-graph polyline');
    expect(polylines).toHaveLength(3); // population, foodCount, averageGeneration
  });

  it('renders legend with correct labels', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 }
    ];

    const { container } = render(<StatsGraph history={history} />);
    
    const legend = container.querySelector('.stats-graph-legend');
    expect(legend).toBeInTheDocument();
    
    expect(legend).toHaveTextContent('Pop');
    expect(legend).toHaveTextContent('Food');
    expect(legend).toHaveTextContent('Gen');
  });

  it('renders graph with legend visible (not clipped) when history has enough data', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 }
    ];

    const { container } = render(<StatsGraph history={history} width={280} />);
    
    const graph = container.querySelector('.stats-graph');
    // Container height should include both graph (80) + legend (~24) = 104
    const height = parseInt(graph.style.height, 10);
    expect(height).toBeGreaterThan(80); // Ensures legend is not clipped
    
    // Legend should be rendered and visible within the container
    const legend = container.querySelector('.stats-graph-legend');
    expect(legend).toBeInTheDocument();
    
    // Legend items should contain color swatches
    const swatches = container.querySelectorAll('.stats-graph-swatch');
    expect(swatches).toHaveLength(3); // population, foodCount, averageGeneration
  });

  it('respects custom metrics prop', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 }
    ];

    const { container } = render(<StatsGraph history={history} metrics={['population']} />);
    const polylines = container.querySelectorAll('.stats-graph polyline');
    expect(polylines).toHaveLength(1);
  });

  it('respects custom width prop', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 }
    ];

    const { container } = render(<StatsGraph history={history} width={400} />);
    const graph = container.querySelector('.stats-graph');
    expect(graph.style.width).toBe('400px');
  });

  it('renders Y-axis and X-axis labels when history has enough data', () => {
    const history = [
      { tick: 0, population: 5, foodCount: 10, averageGeneration: 1.5, averageEnergy: 8 },
      { tick: 10, population: 8, foodCount: 15, averageGeneration: 2.0, averageEnergy: 10 }
    ];

    const { container } = render(<StatsGraph history={history} width={280} />);
    
    const axisLabels = container.querySelectorAll('.stats-graph-axis-label');
    // Expect 4 axis labels: 2 Y-axis (min, max) and 2 X-axis (start, end tick)
    expect(axisLabels).toHaveLength(4);
  });

  it('empty state still shows legend so players see what metrics will be tracked', () => {
    const { container } = render(<StatsGraph history={[]} />);
    
    const legend = container.querySelector('.stats-graph-legend');
    expect(legend).toBeInTheDocument();
    
    // Legend items should be visible even in empty state
    const swatches = container.querySelectorAll('.stats-graph-swatch');
    expect(swatches).toHaveLength(3);
    
    // Legend should show the metric labels
    expect(legend).toHaveTextContent('Pop');
    expect(legend).toHaveTextContent('Food');
    expect(legend).toHaveTextContent('Gen');
  });
});
