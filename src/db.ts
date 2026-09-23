import Dexie, { type EntityTable } from 'dexie';
import type { DatabaseBackup, Member, MetaRecord, Round, Training } from './types';

export const DEFAULT_MEMBER_NAMES = [
  'Achim', 'Andreas', 'Frank Bartkowski', 'Bernd', 'Leo Geisler', 'Henning',
  'Sven Jr.', 'Jan', 'Jens', 'Joyce', 'Kai', 'Frank Krämer', 'Leo Leupold',
  'Lothar', 'Patrick', 'Rainer', 'Sven Sen.', 'Thomas', 'Tors', 'Uwe', 'Frank Wenk'
];

export class ClubDatabase extends Dexie {
  members!: EntityTable<Member, 'id'>;
  trainings!: EntityTable<Training, 'id'>;
  rounds!: EntityTable<Round, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'tischtennis-auslosung') {
    super(name);
    this.version(1).stores({
      members: 'id, name, isPresent, updatedAt',
      trainings: 'id, status, startedAt, endedAt',
      rounds: 'id, trainingId, number, confirmedAt',
      meta: 'key'
    });
  }
}

export const db = new ClubDatabase();

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function initializeDatabase(database: ClubDatabase = db): Promise<void> {
  await database.transaction('rw', database.members, database.trainings, database.meta, async () => {
    const seedMarker = await database.meta.get('members-initialized');
    if (!seedMarker) {
      const existingCount = await database.members.count();
      if (existingCount === 0) {
        const now = Date.now();
        await database.members.bulkAdd(DEFAULT_MEMBER_NAMES.map((name, index) => ({
          id: `member_seed_${index + 1}`,
          name,
          isPresent: false,
          createdAt: now + index,
          updatedAt: now + index
        })));
      }
      await database.meta.put({ key: 'members-initialized', value: true });
    }

    const active = await database.trainings.where('status').equals('active').first();
    if (!active) {
      await database.trainings.add({ id: makeId('training'), startedAt: Date.now(), status: 'active' });
    }
  });
}

export async function getActiveTraining(database: ClubDatabase = db): Promise<Training> {
  const active = await database.trainings.where('status').equals('active').first();
  if (active) return active;
  const training: Training = { id: makeId('training'), startedAt: Date.now(), status: 'active' };
  await database.trainings.add(training);
  return training;
}

export async function startNewTraining(keepAttendance: boolean, database: ClubDatabase = db): Promise<Training> {
  const now = Date.now();
  const next: Training = { id: makeId('training'), startedAt: now, status: 'active' };
  await database.transaction('rw', database.trainings, database.members, async () => {
    const active = await database.trainings.where('status').equals('active').toArray();
    await Promise.all(active.map((training) => database.trainings.update(training.id, { status: 'completed', endedAt: now })));
    if (!keepAttendance) {
      await database.members.toCollection().modify({ isPresent: false, updatedAt: now });
    }
    await database.trainings.add(next);
  });
  return next;
}

export async function exportDatabase(database: ClubDatabase = db): Promise<DatabaseBackup> {
  const [members, trainings, rounds, meta] = await Promise.all([
    database.members.toArray(), database.trainings.toArray(), database.rounds.toArray(), database.meta.toArray()
  ]);
  return {
    format: 'tischtennis-auslosung-backup', version: 1, exportedAt: new Date().toISOString(),
    data: { members, trainings, rounds, meta }
  };
}

function isString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function isNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isPlayer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const player = value as Record<string, unknown>;
  return isString(player.id) && isString(player.name);
}
function isMatch(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const match = value as Record<string, unknown>;
  if (match.type === 'single') {
    return Array.isArray(match.players) && match.players.length === 2
      && match.players.every(isPlayer) && typeof match.additional === 'boolean';
  }
  if (match.type === 'double') {
    return Array.isArray(match.teamA) && match.teamA.length === 2 && match.teamA.every(isPlayer)
      && Array.isArray(match.teamB) && match.teamB.length === 2 && match.teamB.every(isPlayer);
  }
  return false;
}

export function validateBackup(value: unknown): value is DatabaseBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Partial<DatabaseBackup>;
  if (backup.format !== 'tischtennis-auslosung-backup' || backup.version !== 1 || !backup.data) return false;
  const { members, trainings, rounds, meta } = backup.data;
  if (![members, trainings, rounds, meta].every(Array.isArray)) return false;
  return members.every((m) => m && isString(m.id) && isString(m.name) && typeof m.isPresent === 'boolean' && isNumber(m.createdAt) && isNumber(m.updatedAt))
    && trainings.every((t) => t && isString(t.id) && isNumber(t.startedAt) && (t.status === 'active' || t.status === 'completed') && (t.endedAt === undefined || isNumber(t.endedAt)))
    && rounds.every((r) => r && isString(r.id) && isString(r.trainingId) && isNumber(r.number) && isNumber(r.confirmedAt)
      && (r.mode === 'single' || r.mode === 'double') && Array.isArray(r.matches) && r.matches.every(isMatch)
      && Array.isArray(r.pauses) && r.pauses.every(isPlayer) && Array.isArray(r.attendeeIds) && r.attendeeIds.every(isString))
    && meta.every((m) => m && isString(m.key));
}

export async function importDatabase(backup: DatabaseBackup, database: ClubDatabase = db): Promise<void> {
  if (!validateBackup(backup)) throw new Error('Die Sicherungsdatei ist ungültig.');
  await database.transaction('rw', database.members, database.trainings, database.rounds, database.meta, async () => {
    await Promise.all([database.members.clear(), database.trainings.clear(), database.rounds.clear(), database.meta.clear()]);
    if (backup.data.members.length) await database.members.bulkAdd(backup.data.members);
    if (backup.data.trainings.length) await database.trainings.bulkAdd(backup.data.trainings);
    if (backup.data.rounds.length) await database.rounds.bulkAdd(backup.data.rounds);
    if (backup.data.meta.length) await database.meta.bulkAdd(backup.data.meta);
    await database.meta.put({ key: 'members-initialized', value: true });
  });
  await getActiveTraining(database);
}
