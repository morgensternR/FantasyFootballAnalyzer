import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatContextValidationIssues,
  validateContextOverlayFiles,
} from '../src/utils/contextOverlayValidation';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const root = process.cwd();
const teamPath = join(root, 'src/data/teamContext.2026.json');
const playerPath = join(root, 'src/data/playerContext.2026.json');

const issues = validateContextOverlayFiles(readJson(teamPath), readJson(playerPath));

if (issues.length > 0) {
  console.error('Context overlay validation failed:');
  console.error(formatContextValidationIssues(issues));
  process.exitCode = 1;
} else {
  console.log('Context overlay validation passed.');
}
