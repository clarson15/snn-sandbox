import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const simulationDirectory = path.dirname(fileURLToPath(import.meta.url));

const forbiddenRules = [
  {
    id: 'no-math-random',
    description: 'Use seeded PRNG utilities instead of Math.random in simulation runtime code.',
    pattern: /\bMath\.random\s*\(/
  },
  {
    id: 'no-date-now',
    description: 'Avoid Date.now in deterministic simulation runtime code.',
    pattern: /\bDate\.now\s*\(/
  }
];

const approvedBoundaries = {
  'replayRuntimeBudget.js': new Set(['no-date-now']),
  'config.js': new Set(['no-date-now']),
  'timestamp.js': new Set(['no-date-now'])
};

function collectJavaScriptFiles(directoryPath) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(path.join(directoryPath, entry.name)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) {
      continue;
    }

    files.push(path.join(directoryPath, entry.name));
  }

  return files;
}

function detectViolations(filePath) {
  const relativePath = path.relative(simulationDirectory, filePath).replaceAll(path.sep, '/');
  const allowedRules = approvedBoundaries[relativePath] ?? new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const rule of forbiddenRules) {
      if (allowedRules.has(rule.id)) {
        continue;
      }

      if (rule.pattern.test(line)) {
        violations.push({
          rule: rule.id,
          file: `frontend/src/simulation/${relativePath}`,
          line: lineNumber,
          source: line.trim(),
          description: rule.description
        });
      }
    }
  });

  return violations;
}

describe('determinism guardrails', () => {
  it('blocks ambient randomness/time APIs in simulation runtime code', () => {
    const candidateFiles = collectJavaScriptFiles(simulationDirectory);
    const violations = candidateFiles.flatMap(detectViolations);

    const failureOutput = violations
      .map((violation) => `${violation.rule} :: ${violation.file}:${violation.line}\n  ${violation.description}\n  ${violation.source}`)
      .join('\n\n');

    expect(violations, failureOutput || undefined).toHaveLength(0);
  });
});
