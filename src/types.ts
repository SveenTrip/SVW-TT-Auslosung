export type DrawMode = 'single' | 'double';

export interface Member {
  id: string;
  name: string;
  isPresent: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
}

export interface SingleMatch {
  type: 'single';
  players: [PlayerSnapshot, PlayerSnapshot];
  additional: boolean;
}

export interface DoubleMatch {
  type: 'double';
  teamA: [PlayerSnapshot, PlayerSnapshot];
  teamB: [PlayerSnapshot, PlayerSnapshot];
}

export type Match = SingleMatch | DoubleMatch;

export interface DrawResult {
  mode: DrawMode;
  matches: Match[];
  pauses: PlayerSnapshot[];
}

export interface Training {
  id: string;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'completed';
}

export interface Round extends DrawResult {
  id: string;
  trainingId: string;
  number: number;
  confirmedAt: number;
  attendeeIds: string[];
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface DatabaseBackup {
  format: 'tischtennis-auslosung-backup';
  version: 1;
  exportedAt: string;
  data: {
    members: Member[];
    trainings: Training[];
    rounds: Round[];
    meta: MetaRecord[];
  };
}
