/**
 * Spec Writer
 *
 * Handles writing spec changes to actual files during amendments.
 * Supports adding, modifying, and removing requirements from spec.md files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { SpecChange } from './types.js';

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Write spec changes to actual spec.md files.
 *
 * @param changeDir - The change directory path
 * @param specChanges - List of spec changes to apply
 * @param currentSpecs - Current spec contents (read before amendment)
 */
export async function writeSpecChanges(
  changeDir: string,
  specChanges: SpecChange[],
  currentSpecs: Map<string, string>
): Promise<void> {
  const specsDir = path.join(changeDir, 'specs');

  for (const change of specChanges) {
    const specPath = path.join(specsDir, change.specName, 'spec.md');

    switch (change.operation) {
      case 'ADDED':
        await addRequirementToSpec(specPath, change);
        console.log(chalk.dim(`  Added requirement: ${change.requirement}`));
        break;

      case 'MODIFIED':
        await modifyRequirementInSpec(specPath, change, currentSpecs);
        console.log(chalk.dim(`  Modified requirement: ${change.requirement}`));
        break;

      case 'REMOVED':
        await removeRequirementFromSpec(specPath, change);
        console.log(chalk.dim(`  Removed requirement: ${change.requirement}`));
        break;
    }
  }
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Add a new requirement to spec.md.
 */
async function addRequirementToSpec(
  specPath: string,
  change: SpecChange
): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(path.dirname(specPath), { recursive: true });

  // Read existing content or create new spec
  let content: string;
  try {
    content = await fs.readFile(specPath, 'utf-8');
  } catch {
    content = '# Specification\n\n';
  }

  // Add new requirement section
  const newRequirement = formatRequirementSection(change);

  // Append to end of spec
  content += '\n' + newRequirement;

  // Write to file
  await fs.writeFile(specPath, content);
}

/**
 * Modify an existing requirement in spec.md.
 */
async function modifyRequirementInSpec(
  specPath: string,
  change: SpecChange,
  currentSpecs: Map<string, string>
): Promise<void> {
  // Read current spec content
  let content = currentSpecs.get(change.specName) || '';

  if (!content) {
    try {
      content = await fs.readFile(specPath, 'utf-8');
    } catch {
      // Spec doesn't exist, treat as ADD instead
      await addRequirementToSpec(specPath, change);
      return;
    }
  }

  // Find and replace the requirement section
  const lines = content.split('\n');
  const modifiedLines: string[] = [];
  let inTargetRequirement = false;
  let requirementFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is the requirement header we're looking for
    if (line.match(/^## Requirement: /) && line.includes(change.requirement)) {
      inTargetRequirement = true;
      requirementFound = true;

      // Replace the requirement section
      const newSection = formatRequirementSection(change);
      modifiedLines.push(newSection.split('\n')[0]); // Header

      // Skip old content and add new details
      // Continue until next requirement or end of section
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.match(/^## /) || nextLine.trim() === '') {
          // End of current requirement
          modifiedLines.push(change.details || 'Details not provided');
          modifiedLines.push('');
          modifiedLines.push(nextLine);
          inTargetRequirement = false;
          break;
        }
        i++;
      }

      if (i >= lines.length) {
        // Reached end of file
        modifiedLines.push(change.details || 'Details not provided');
        modifiedLines.push('');
        inTargetRequirement = false;
      }

      continue;
    }

    if (!inTargetRequirement) {
      modifiedLines.push(line);
    }
  }

  if (!requirementFound) {
    // Requirement not found, add it
    modifiedLines.push(formatRequirementSection(change));
  }

  // Write modified content
  await fs.writeFile(specPath, modifiedLines.join('\n'));
}

/**
 * Remove a requirement from spec.md (commented out for rollback).
 */
async function removeRequirementFromSpec(
  specPath: string,
  change: SpecChange
): Promise<void> {
  // Read spec content
  let content: string;
  try {
    content = await fs.readFile(specPath, 'utf-8');
  } catch {
    // Spec doesn't exist, nothing to remove
    return;
  }

  // Find and comment out the requirement
  const lines = content.split('\n');
  const modifiedLines: string[] = [];
  let inTargetRequirement = false;

  for (const line of lines) {
    // Check if this is the requirement header we're removing
    if (line.match(/^## Requirement: /) && line.includes(change.requirement)) {
      inTargetRequirement = true;

      // Comment out the header
      modifiedLines.push(`<!-- REMOVED: ${line} -->`);
      modifiedLines.push(`<!-- Reason: ${change.details} -->`);
      continue;
    }

    // Check if we're leaving the requirement section
    if (inTargetRequirement && line.match(/^## /)) {
      inTargetRequirement = false;
    }

    if (inTargetRequirement) {
      // Comment out requirement content
      modifiedLines.push(`<!-- ${line} -->`);
    } else {
      modifiedLines.push(line);
    }
  }

  // Write modified content
  await fs.writeFile(specPath, modifiedLines.join('\n'));
}

/**
 * Format a requirement section.
 */
function formatRequirementSection(change: SpecChange): string {
  return `## Requirement: ${change.requirement}

${change.details}
`;
}