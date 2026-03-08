import { describe, expect, it } from 'vitest';

import { resolveRenderFrameInterval, shouldRenderFrame } from './renderCadence';

describe('renderCadence', () => {
  it('keeps 1x render cadence unchanged', () => {
    expect(resolveRenderFrameInterval(1)).toBe(1);
  });

  it('skips intermediate frames at >=2x speeds', () => {
    expect(resolveRenderFrameInterval(2)).toBe(2);
    expect(resolveRenderFrameInterval(5)).toBe(3);
    expect(resolveRenderFrameInterval(10)).toBe(4);
  });

  it('renders only cadence-aligned frames when interval is >1', () => {
    const renderedFrames = [];
    for (let frame = 0; frame < 8; frame += 1) {
      if (shouldRenderFrame(frame, 2)) {
        renderedFrames.push(frame);
      }
    }

    expect(renderedFrames).toEqual([0, 2, 4, 6]);
  });
});
