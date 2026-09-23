import { describe, expect, it } from 'vitest';
import { assertUniqueAssignment, drawDoubles, drawSingles } from './draw';
import type { DrawResult, Member, Round } from './types';

function members(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `Spieler ${index + 1}`, isPresent: true, createdAt: index, updatedAt: index
  }));
}

function seeded(seed = 17) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

function asRound(result: DrawResult, index: number): Round {
  return { ...result, id: `r${index}`, trainingId: 't1', number: index, confirmedAt: index, attendeeIds: [] };
}

describe('Einzel-Auslosung', () => {
  it('teilt eine gerade Spielerzahl vollständig ein', () => {
    const result = drawSingles(members(6), [], seeded());
    expect(result.matches).toHaveLength(3);
    expect(result.pauses).toHaveLength(0);
    expect(assertUniqueAssignment(result)).toBe(true);
  });

  it('vergibt bei einer ungeraden Spielerzahl genau eine Pause', () => {
    const result = drawSingles(members(5), [], seeded());
    expect(result.matches).toHaveLength(2);
    expect(result.pauses).toHaveLength(1);
    expect(assertUniqueAssignment(result)).toBe(true);
  });

  it('lehnt weniger als zwei Spieler verständlich ab', () => {
    expect(() => drawSingles(members(1), [], seeded())).toThrow(/mindestens zwei/i);
  });
});

describe('Intelligente Doppel-Auslosung', () => {
  it.each(Array.from({ length: 21 }, (_, index) => index + 1))('verarbeitet %i Teilnehmer ohne Doppeleinsatz', (count) => {
    if (count < 4) {
      expect(() => drawDoubles(members(count), [], seeded(count))).toThrow(/mindestens vier/i);
      return;
    }
    const result = drawDoubles(members(count), [], seeded(count));
    const doubleCount = result.matches.filter((match) => match.type === 'double').length;
    const singleCount = result.matches.filter((match) => match.type === 'single').length;
    expect(doubleCount).toBe(Math.floor(count / 4));
    expect(singleCount).toBe(count % 4 >= 2 ? 1 : 0);
    expect(result.pauses).toHaveLength(count % 2);
    expect(assertUniqueAssignment(result)).toBe(true);
  });

  it.each([
    [6, 1, 1, 0],
    [7, 1, 1, 1],
    [10, 2, 1, 0],
    [14, 3, 1, 0]
  ])('%i Spieler ergeben %i Doppel, %i Einzel und %i Pausen', (count, doubles, singles, pauses) => {
    const result = drawDoubles(members(count), [], seeded(count));
    expect(result.matches.filter((m) => m.type === 'double')).toHaveLength(doubles);
    expect(result.matches.filter((m) => m.type === 'single')).toHaveLength(singles);
    expect(result.pauses).toHaveLength(pauses);
  });

  it('verteilt Pausen über mehrere Runden ausgewogen', () => {
    const players = members(9);
    const rounds: Round[] = [];
    const rng = seeded(23);
    for (let index = 1; index <= 18; index += 1) rounds.push(asRound(drawDoubles(players, rounds, rng), index));
    const counts = new Map(players.map((player) => [player.id, 0]));
    rounds.forEach((round) => round.pauses.forEach((player) => counts.set(player.id, counts.get(player.id)! + 1)));
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    for (let index = 1; index < rounds.length; index += 1) {
      expect(rounds[index].pauses[0].id).not.toBe(rounds[index - 1].pauses[0].id);
    }
  });

  it('rotiert zusätzliche Einzel gleichmäßig', () => {
    const players = members(10);
    const rounds: Round[] = [];
    const rng = seeded(42);
    for (let index = 1; index <= 20; index += 1) rounds.push(asRound(drawDoubles(players, rounds, rng), index));
    const counts = new Map(players.map((player) => [player.id, 0]));
    rounds.forEach((round) => round.matches.filter((m) => m.type === 'single').forEach((match) => match.players.forEach((p) => counts.set(p.id, counts.get(p.id)! + 1))));
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('setzt einen später hinzugekommenen Spieler nicht sofort auf die Bank', () => {
    const regulars = members(4);
    const rounds: Round[] = [];
    const rng = seeded(11);
    for (let index = 1; index <= 4; index += 1) rounds.push(asRound(drawDoubles(regulars, rounds, rng), index));
    const newcomer: Member = { id: 'late', name: 'Später Spieler', isPresent: true, createdAt: 99, updatedAt: 99 };
    const result = drawDoubles([...regulars, newcomer], rounds, rng);
    expect(result.pauses[0].id).not.toBe(newcomer.id);
  });
});
