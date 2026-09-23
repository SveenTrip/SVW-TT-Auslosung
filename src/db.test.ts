import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ClubDatabase, DEFAULT_MEMBER_NAMES, exportDatabase, importDatabase, initializeDatabase, validateBackup
} from './db';

const names: string[] = [];
function freshDb() {
  const name = `test-${crypto.randomUUID()}`;
  names.push(name);
  return new ClubDatabase(name);
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('lokale Datenbank', () => {
  it('legt die Stammmitglieder exakt einmal und zunächst abwesend an', async () => {
    const database = freshDb();
    await initializeDatabase(database);
    await initializeDatabase(database);
    const members = (await database.members.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(members).toHaveLength(21);
    expect(members.map((member) => member.name)).toEqual(DEFAULT_MEMBER_NAMES);
    expect(members.every((member) => !member.isPresent)).toBe(true);
  });

  it('stellt gelöschte oder umbenannte Stammmitglieder nicht wieder her', async () => {
    const database = freshDb();
    await initializeDatabase(database);
    await database.members.delete('member_seed_1');
    await database.members.update('member_seed_2', { name: 'Neuer Name', updatedAt: Date.now() });
    database.close();
    const reopened = new ClubDatabase(database.name);
    await initializeDatabase(reopened);
    expect(await reopened.members.count()).toBe(20);
    expect((await reopened.members.get('member_seed_2'))?.name).toBe('Neuer Name');
    reopened.close();
  });

  it('speichert Anwesenheit dauerhaft über einen Neustart', async () => {
    const database = freshDb();
    await initializeDatabase(database);
    await database.members.update('member_seed_3', { isPresent: true, updatedAt: Date.now() });
    database.close();
    const reopened = new ClubDatabase(database.name);
    expect((await reopened.members.get('member_seed_3'))?.isPresent).toBe(true);
    reopened.close();
  });

  it('speichert hinzugefügte, bearbeitete und gelöschte Mitglieder', async () => {
    const database = freshDb();
    await initializeDatabase(database);
    const member = { id: 'member_custom', name: 'Testperson', isPresent: false, createdAt: 100, updatedAt: 100 };
    await database.members.add(member);
    await database.members.update(member.id, { name: 'Umbenannt', isPresent: true, updatedAt: 101 });
    expect(await database.members.get(member.id)).toMatchObject({ name: 'Umbenannt', isPresent: true });
    await database.members.delete(member.id);
    expect(await database.members.get(member.id)).toBeUndefined();
  });

  it('exportiert, validiert und importiert alle Tabellen', async () => {
    const source = freshDb();
    await initializeDatabase(source);
    await source.members.update('member_seed_1', { isPresent: true, name: 'Achim Test', updatedAt: Date.now() });
    const backup = await exportDatabase(source);
    expect(validateBackup(backup)).toBe(true);

    const target = freshDb();
    await importDatabase(backup, target);
    expect(await target.members.count()).toBe(21);
    expect(await target.trainings.count()).toBe(1);
    expect((await target.members.get('member_seed_1'))).toMatchObject({ name: 'Achim Test', isPresent: true });
    expect(validateBackup({ ...backup, format: 'falsch' })).toBe(false);
  });
});
