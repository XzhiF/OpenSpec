/**
 * Impact Analysis
 *
 * Analyzes the impact of amendments on code and dependencies.
 */

import type { AmendmentRecord, CodeImpact, DependencyImpact } from './types.js';

/**
 * Analyze the impact of artifact changes.
 */
export async function analyzeImpact(
  changeDir: string,
  changes: AmendmentRecord['changes']
): Promise<{
  codeImpact: CodeImpact;
  dependencyImpact: DependencyImpact;
}> {
  const codeImpact: CodeImpact = {
    affectedFiles: [],
    estimatedEffort: 'Unknown',
    backwardCompatible: true
  };

  const dependencyImpact: DependencyImpact = {
    remove: [],
    add: []
  };

  // Analyze design changes
  if (changes.design) {
    const designImpact = analyzeDesignImpact(changes.design.before, changes.design.after);
    codeImpact.affectedFiles.push(...designImpact.affectedFiles);
    dependencyImpact.remove.push(...designImpact.dependenciesRemoved);
    dependencyImpact.add.push(...designImpact.dependenciesAdded);
  }

  // Analyze spec changes
  if (changes.specs?.length) {
    for (const specChange of changes.specs) {
      if (specChange.operation === 'REMOVED') {
        codeImpact.backwardCompatible = false;
      }
    }
  }

  // Estimate effort based on changes
  codeImpact.estimatedEffort = estimateEffort(changes);

  return { codeImpact, dependencyImpact };
}

/**
 * Analyze impact of design changes.
 */
function analyzeDesignImpact(
  before: string,
  after: string
): {
  affectedFiles: string[];
  dependenciesRemoved: string[];
  dependenciesAdded: string[];
} {
  const result = {
    affectedFiles: [] as string[],
    dependenciesRemoved: [] as string[],
    dependenciesAdded: [] as string[]
  };

  // Extract mentioned files
  const filePattern = /[`']([^`']+\.(ts|tsx|js|jsx|py|go|java))['`]/g;

  const beforeFiles = new Set<string>();
  const afterFiles = new Set<string>();

  let match;
  while ((match = filePattern.exec(before)) !== null) {
    beforeFiles.add(match[1]);
  }
  while ((match = filePattern.exec(after)) !== null) {
    afterFiles.add(match[1]);
  }

  // Files only in after are new
  for (const file of afterFiles) {
    if (!beforeFiles.has(file)) {
      result.affectedFiles.push(file);
    }
  }

  // Extract dependencies (common package names)
  const depPattern = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;

  const beforeDeps = new Set<string>();
  const afterDeps = new Set<string>();

  while ((match = depPattern.exec(before)) !== null) {
    beforeDeps.add(match[1]);
  }
  while ((match = depPattern.exec(after)) !== null) {
    afterDeps.add(match[1]);
  }

  for (const dep of beforeDeps) {
    if (!afterDeps.has(dep) && !dep.startsWith('.')) {
      result.dependenciesRemoved.push(dep);
    }
  }
  for (const dep of afterDeps) {
    if (!beforeDeps.has(dep) && !dep.startsWith('.')) {
      result.dependenciesAdded.push(dep);
    }
  }

  return result;
}

/**
 * Estimate effort based on changes.
 */
export function estimateEffort(changes: AmendmentRecord['changes']): string {
  let score = 0;

  // Proposal changes = scope impact
  if (changes.proposal) {
    score += 1;
  }

  // Spec changes = requirements impact
  if (changes.specs) {
    score += changes.specs.length * 2;
    // REMOVED requirements are more impactful
    score += changes.specs.filter(s => s.operation === 'REMOVED').length * 2;
  }

  // Design changes = architecture impact
  if (changes.design) {
    score += 3;
  }

  // Tasks changes = implementation impact
  if (changes.tasks) {
    score += changes.tasks.added.length;
    score += changes.tasks.modified.length * 0.5;
  }

  // Map score to effort estimate
  if (score <= 2) return '30 minutes';
  if (score <= 5) return '1-2 hours';
  if (score <= 10) return 'Half day';
  if (score <= 20) return '1-2 days';
  return '3+ days';
}