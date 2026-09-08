import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POOL } from '../src/data/draftPool';
import {
  formatContextOverlayPoolIssues,
  validateContextOverlayAgainstPool,
} from '../src/utils/contextOverlayCoverage';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const root = process.cwd();
const teamPath = join(root, 'src/data/teamContext.2026.json');
const playerPath = join(root, 'src/data/playerContext.2026.json');

const issues = validateContextOverlayAgainstPool(readJson(teamPath), readJson(playerPath), POOL.players);

if (issues.length > 0) {
  console.error('Context overlay validation failed:');
  console.error(formatContextOverlayPoolIssues(issues));
  process.exitCode = 1;
} else {
  console.log('Context overlay validation passed.');
  console.log(`Checked ${POOL.players.length} draft-pool players for supported context keys.`);
}
