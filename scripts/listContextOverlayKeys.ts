import { POOL } from '../src/data/draftPool';
import { playerContextKeysFor } from '../src/utils/contextLabels';
import { normalizeName } from '../src/utils/playerNames';

const query = process.argv.slice(2).join(' ').trim();
const normalizedQuery = normalizeName(query);
const limit = 40;

const matches = POOL.players.filter(player => {
  if (!query) return true;
  return (
    normalizeName(player.name).includes(normalizedQuery) ||
    player.id.includes(normalizedQuery.replace(/\s+/g, '-')) ||
    player.team.toLowerCase() === query.toLowerCase() ||
    player.pos.toLowerCase() === query.toLowerCase()
  );
});

if (matches.length === 0) {
  console.error(`No players matched "${query}".`);
  process.exitCode = 1;
} else {
  console.log(`Showing ${Math.min(matches.length, limit)} of ${matches.length} matching players.`);
  for (const player of matches.slice(0, limit)) {
    console.log(`${player.overallRank}. ${player.name} ${player.pos}${player.posRank} ${player.team}`);
    console.log(`   keys: ${playerContextKeysFor(player).join(' | ')}`);
  }
}
