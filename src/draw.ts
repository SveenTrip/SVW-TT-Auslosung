import type { DoubleMatch, DrawResult, Match, Member, PlayerSnapshot, Round, SingleMatch } from './types';

type Rng = () => number;

interface PlayerStats {
  played: number;
  pauses: number;
  additionalSingles: number;
}

function key(a: string, b: string): string { return [a, b].sort().join('|'); }
function snapshot(member: Member): PlayerSnapshot { return { id: member.id, name: member.name }; }

function shuffled<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildHistory(rounds: Round[]) {
  const stats = new Map<string, PlayerStats>();
  const singleOpponents = new Map<string, number>();
  const partners = new Map<string, number>();
  const doubleOpponents = new Map<string, number>();
  const ensure = (id: string) => {
    if (!stats.has(id)) stats.set(id, { played: 0, pauses: 0, additionalSingles: 0 });
    return stats.get(id)!;
  };
  for (const round of rounds) {
    round.pauses.forEach((player) => { ensure(player.id).pauses += 1; });
    for (const match of round.matches) {
      if (match.type === 'single') {
        match.players.forEach((player) => { ensure(player.id).played += 1; });
        if (match.additional) match.players.forEach((player) => { ensure(player.id).additionalSingles += 1; });
        const pair = key(match.players[0].id, match.players[1].id);
        singleOpponents.set(pair, (singleOpponents.get(pair) ?? 0) + 1);
      } else {
        const all = [...match.teamA, ...match.teamB];
        all.forEach((player) => { ensure(player.id).played += 1; });
        for (const team of [match.teamA, match.teamB]) {
          const pair = key(team[0].id, team[1].id);
          partners.set(pair, (partners.get(pair) ?? 0) + 1);
        }
        for (const a of match.teamA) for (const b of match.teamB) {
          const pair = key(a.id, b.id);
          doubleOpponents.set(pair, (doubleOpponents.get(pair) ?? 0) + 1);
        }
      }
    }
  }
  return { stats, singleOpponents, partners, doubleOpponents, last: rounds.at(-1) };
}

function chooseBest<T>(candidates: T[], score: (candidate: T) => number, rng: Rng): T {
  const randomized = shuffled(candidates, rng);
  return randomized.reduce((best, current) => score(current) < score(best) ? current : best);
}

function selectPause(players: Member[], rounds: Round[], rng: Rng): Member {
  const history = buildHistory(rounds);
  const lastPauses = new Set(history.last?.pauses.map((player) => player.id) ?? []);
  return chooseBest(players, (player) => {
    const stat = history.stats.get(player.id) ?? { played: 0, pauses: 0, additionalSingles: 0 };
    return stat.pauses * 100 + (lastPauses.has(player.id) ? 70 : 0) - stat.played * 0.2;
  }, rng);
}

function pairSingles(players: Member[], rounds: Round[], additional: boolean, rng: Rng): SingleMatch[] {
  if (!players.length) return [];
  const history = buildHistory(rounds);
  const lastSinglePairs = new Set(
    history.last?.matches.filter((m): m is SingleMatch => m.type === 'single').map((m) => key(m.players[0].id, m.players[1].id)) ?? []
  );
  let best: Member[] = players;
  let bestScore = Number.POSITIVE_INFINITY;
  const attempts = Math.max(100, players.length * 40);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = shuffled(players, rng);
    let score = 0;
    for (let i = 0; i < candidate.length; i += 2) {
      const pair = key(candidate[i].id, candidate[i + 1].id);
      score += (history.singleOpponents.get(pair) ?? 0) * 20;
      if (lastSinglePairs.has(pair)) score += 100;
    }
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  const matches: SingleMatch[] = [];
  for (let i = 0; i < best.length; i += 2) {
    matches.push({ type: 'single', players: [snapshot(best[i]), snapshot(best[i + 1])], additional });
  }
  return matches;
}

export function drawSingles(presentMembers: Member[], rounds: Round[] = [], rng: Rng = Math.random): DrawResult {
  if (presentMembers.length < 2) throw new Error('Für ein Einzel müssen mindestens zwei Spieler anwesend sein.');
  const players = [...presentMembers];
  const pauses: Member[] = [];
  if (players.length % 2 === 1) {
    const pause = selectPause(players, rounds, rng);
    pauses.push(pause);
    players.splice(players.findIndex((player) => player.id === pause.id), 1);
  }
  return { mode: 'single', matches: pairSingles(players, rounds, false, rng), pauses: pauses.map(snapshot) };
}

function chooseDoubleRoles(players: Member[], remainder: number, rounds: Round[], rng: Rng) {
  const history = buildHistory(rounds);
  const lastPauses = new Set(history.last?.pauses.map((player) => player.id) ?? []);
  const rank = shuffled(players, rng).sort((a, b) => {
    const sa = history.stats.get(a.id) ?? { played: 0, pauses: 0, additionalSingles: 0 };
    const sb = history.stats.get(b.id) ?? { played: 0, pauses: 0, additionalSingles: 0 };
    return sa.additionalSingles - sb.additionalSingles || sa.played - sb.played;
  });

  let pause: Member | undefined;
  let singles: Member[] = [];
  if (remainder === 1 || remainder === 3) {
    pause = chooseBest(players, (player) => {
      const stat = history.stats.get(player.id) ?? { played: 0, pauses: 0, additionalSingles: 0 };
      return stat.pauses * 100 + (lastPauses.has(player.id) ? 70 : 0) - stat.additionalSingles * 2 - stat.played * 0.2;
    }, rng);
  }
  const available = rank.filter((player) => player.id !== pause?.id);
  if (remainder === 2 || remainder === 3) singles = available.slice(0, 2);
  const excluded = new Set([pause?.id, ...singles.map((player) => player.id)]);
  return { doubles: players.filter((player) => !excluded.has(player.id)), singles, pause };
}

function arrangeDoubles(players: Member[], rounds: Round[], rng: Rng): DoubleMatch[] {
  const history = buildHistory(rounds);
  const lastPartnerPairs = new Set<string>();
  history.last?.matches.forEach((match) => {
    if (match.type === 'double') {
      lastPartnerPairs.add(key(match.teamA[0].id, match.teamA[1].id));
      lastPartnerPairs.add(key(match.teamB[0].id, match.teamB[1].id));
    }
  });
  let best = players;
  let bestScore = Number.POSITIVE_INFINITY;
  const attempts = Math.max(300, players.length * 100);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = shuffled(players, rng);
    let score = 0;
    for (let i = 0; i < candidate.length; i += 4) {
      const a = candidate[i], b = candidate[i + 1], c = candidate[i + 2], d = candidate[i + 3];
      for (const pair of [key(a.id, b.id), key(c.id, d.id)]) {
        score += (history.partners.get(pair) ?? 0) * 24;
        if (lastPartnerPairs.has(pair)) score += 130;
      }
      for (const left of [a, b]) for (const right of [c, d]) {
        score += (history.doubleOpponents.get(key(left.id, right.id)) ?? 0) * 3;
      }
    }
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  const matches: DoubleMatch[] = [];
  for (let i = 0; i < best.length; i += 4) {
    matches.push({
      type: 'double',
      teamA: [snapshot(best[i]), snapshot(best[i + 1])],
      teamB: [snapshot(best[i + 2]), snapshot(best[i + 3])]
    });
  }
  return matches;
}

export function drawDoubles(presentMembers: Member[], rounds: Round[] = [], rng: Rng = Math.random): DrawResult {
  if (presentMembers.length < 4) throw new Error('Für ein vollständiges Doppel müssen mindestens vier Spieler anwesend sein.');
  const remainder = presentMembers.length % 4;
  const roles = chooseDoubleRoles(presentMembers, remainder, rounds, rng);
  const matches: Match[] = arrangeDoubles(roles.doubles, rounds, rng);
  if (roles.singles.length === 2) matches.push(...pairSingles(roles.singles, rounds, true, rng));
  return { mode: 'double', matches, pauses: roles.pause ? [snapshot(roles.pause)] : [] };
}

export function assertUniqueAssignment(result: DrawResult): boolean {
  const ids: string[] = result.pauses.map((player) => player.id);
  result.matches.forEach((match) => {
    if (match.type === 'single') ids.push(...match.players.map((player) => player.id));
    else ids.push(...[...match.teamA, ...match.teamB].map((player) => player.id));
  });
  return new Set(ids).size === ids.length;
}
