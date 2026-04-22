/**
 * MaxPreps stats XML builder.
 *
 * MaxPreps publishes a detailed stats-XML specification for partner imports
 * (the "StatCrew-compatible" feed). We emit a stable, conservative subset that
 * covers the batting columns already surfaced in the TXT export.
 *
 * The full spec includes pitching, fielding, school IDs, and team season
 * metadata that require account-specific configuration the coach has to
 * enter. Those are out of scope for Tier 5; this builder emits what we can
 * derive purely from game_events.
 */
import type { PlayerStats } from './stats.ts';

export interface AggregatedPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  stats: PlayerStats;
}

export interface AggregatedGame {
  gameId: string;
  gameDate: string;                  // ISO-8601
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  players: AggregatedPlayer[];
}

/** XML text-escape for element content and attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attr(name: string, value: string | number | null): string {
  if (value === null || value === '') return '';
  return ` ${name}="${escapeXml(String(value))}"`;
}

function buildPlayerElement(p: AggregatedPlayer): string {
  const s = p.stats;
  const avg = s.ab > 0 ? (s.h / s.ab).toFixed(3) : '.000';
  return (
    `    <Player` +
    attr('playerId', p.playerId) +
    attr('firstName', p.firstName) +
    attr('lastName', p.lastName) +
    attr('jersey', p.jerseyNumber) +
    `>\n` +
    `      <Batting` +
    attr('AB', s.ab) +
    attr('R', s.r) +
    attr('H', s.h) +
    attr('2B', s.doubles) +
    attr('3B', s.triples) +
    attr('HR', s.hr) +
    attr('RBI', s.rbi) +
    attr('BB', s.bb) +
    attr('SO', s.so) +
    attr('AVG', avg) +
    ` />\n` +
    `    </Player>`
  );
}

function buildGameElement(g: AggregatedGame): string {
  const iso = new Date(g.gameDate);
  const gameDateAttr = Number.isNaN(iso.getTime())
    ? g.gameDate
    : iso.toISOString().slice(0, 10);

  const playerLines = g.players.map(buildPlayerElement).join('\n');

  return (
    `  <Game` +
    attr('gameId', g.gameId) +
    attr('date', gameDateAttr) +
    attr('teamName', g.teamName) +
    attr('opponent', g.opponentName) +
    attr('homeScore', g.homeScore) +
    attr('awayScore', g.awayScore) +
    `>\n` +
    `${playerLines}\n` +
    `  </Game>`
  );
}

export function buildMaxPrepsXml(games: AggregatedGame[]): string {
  const body = games.map(buildGameElement).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<MaxPrepsExport generated="${new Date().toISOString()}" schemaVersion="1">\n` +
    `${body}\n` +
    `</MaxPrepsExport>\n`
  );
}
