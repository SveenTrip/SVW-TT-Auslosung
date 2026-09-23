import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive, Check, ChevronRight, Download, History, Home, Info,
  CircleDot, Pencil, Plus, Settings, Shuffle, Trash2, Upload,
  UserCheck, Users, UserX, X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  db, exportDatabase, getActiveTraining, importDatabase, initializeDatabase, makeId,
  startNewTraining, validateBackup
} from './db';
import { assertUniqueAssignment, drawDoubles, drawSingles } from './draw';
import type { DatabaseBackup, DrawMode, DrawResult, Match, Member, Round, Training } from './types';

type Tab = 'home' | 'members' | 'history';

function formatDate(timestamp: number, withTime = true) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(timestamp);
}

function useToast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);
  return { message, show: setMessage };
}

interface ModalProps { title: string; children: ReactNode; onClose: () => void; wide?: boolean; }
function Modal({ title, children, onClose, wide }: ModalProps) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Schließen"><X /></button></div>
        {children}
      </section>
    </div>
  );
}

interface ConfirmProps { title: string; text: string; action: string; danger?: boolean; onConfirm: () => void; onClose: () => void; }
function ConfirmModal({ title, text, action, danger, onConfirm, onClose }: ConfirmProps) {
  return <Modal title={title} onClose={onClose}>
    <p className="modal-copy">{text}</p>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Abbrechen</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{action}</button></div>
  </Modal>;
}

function MatchCard({ match, index }: { match: Match; index: number }) {
  if (match.type === 'single') return (
    <article className="match-card">
      <div className="match-label">{match.additional ? 'Zusätzliches Einzel' : `Einzel ${index + 1}`}</div>
      <div className="versus-line"><strong>{match.players[0].name}</strong><span>gegen</span><strong>{match.players[1].name}</strong></div>
    </article>
  );
  return (
    <article className="match-card double-card">
      <div className="match-label">Doppel {index + 1}</div>
      <div className="teams">
        <div className="team"><strong>{match.teamA[0].name}</strong><strong>{match.teamA[1].name}</strong></div>
        <span className="versus">gegen</span>
        <div className="team"><strong>{match.teamB[0].name}</strong><strong>{match.teamB[1].name}</strong></div>
      </div>
    </article>
  );
}

function ResultCards({ result }: { result: DrawResult }) {
  let singleIndex = 0;
  let doubleIndex = 0;
  return <div className="results-list">
    {result.matches.map((match, index) => {
      const displayIndex = match.type === 'double' ? doubleIndex++ : singleIndex++;
      return <MatchCard key={`${match.type}-${index}`} match={match} index={displayIndex} />;
    })}
    {result.pauses.length > 0 && <article className="pause-card"><span>Pause</span><strong>{result.pauses.map((p) => p.name).join(', ')}</strong></article>}
  </div>;
}

interface HomeViewProps { members: Member[]; training: Training; rounds: Round[]; goMembers: () => void; show: (message: string) => void; }
function HomeView({ members, training, rounds, goMembers, show }: HomeViewProps) {
  const present = members.filter((member) => member.isPresent);
  const [draft, setDraft] = useState<DrawResult | null>(null);
  const [mode, setMode] = useState<DrawMode | null>(null);
  const lastRound = rounds.at(-1);

  useEffect(() => { setDraft(null); setMode(null); }, [training.id]);

  const makeDraw = (requestedMode: DrawMode) => {
    try {
      const result = requestedMode === 'single' ? drawSingles(present, rounds) : drawDoubles(present, rounds);
      if (!assertUniqueAssignment(result)) throw new Error('Die Auslosung konnte nicht erstellt werden.');
      setDraft(result); setMode(requestedMode);
      window.setTimeout(() => document.getElementById('draw-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) { show((error as Error).message); }
  };

  const confirmDraft = async () => {
    if (!draft) return;
    const round: Round = {
      ...draft, id: makeId('round'), trainingId: training.id, number: rounds.length + 1,
      confirmedAt: Date.now(), attendeeIds: present.map((member) => member.id)
    };
    await db.rounds.add(round);
    setDraft(null); setMode(null); show(`Runde ${round.number} gespeichert.`);
  };

  return <div className="view-stack">
    <section className="welcome-card">
      <div>
        <span className="eyebrow">Aktuelles Training</span>
        <h1>Bereit für die nächste Runde?</h1>
        <p>{formatDate(training.startedAt)} · {rounds.length} {rounds.length === 1 ? 'Runde' : 'Runden'} gespielt</p>
      </div>
      <div className="attendance-orb"><strong>{present.length}</strong><span>anwesend</span></div>
    </section>

    <button className="attendance-link" onClick={goMembers}><UserCheck /><span><strong>Anwesenheit bearbeiten</strong><small>{members.length} Mitglieder insgesamt</small></span><ChevronRight /></button>

    <section className="draw-actions" aria-label="Auslosung starten">
      <button className="draw-button primary-draw" onClick={() => makeDraw('single')}><span className="draw-icon"><Shuffle /></span><strong>Einzel auslosen</strong></button>
      <button className="draw-button secondary-draw" onClick={() => makeDraw('double')}><span className="draw-icon"><CircleDot /></span><strong>Doppel auslosen</strong></button>
    </section>

    {draft && <section className="result-section" id="draw-result">
      <div className="section-heading"><div><span className="status-chip draft-chip">Vorschlag</span><h2>Runde {rounds.length + 1}</h2></div><span>{draft.mode === 'double' ? 'Doppel' : 'Einzel'}</span></div>
      <ResultCards result={draft} />
      <div className="result-actions">
        <button className="button primary grow" onClick={confirmDraft}><Check />Runde bestätigen</button>
        <button className="button secondary" onClick={() => mode && makeDraw(mode)}><Shuffle />Neu auslosen</button>
      </div>
    </section>}

    {!draft && lastRound && <section className="result-section muted-result">
      <div className="section-heading"><div><span className="status-chip saved-chip"><Check />Gespeichert</span><h2>Runde {lastRound.number}</h2></div><span>{lastRound.mode === 'double' ? 'Doppel' : 'Einzel'}</span></div>
      <ResultCards result={lastRound} />
      <div className="result-actions"><button className="button primary grow" onClick={() => makeDraw(lastRound.mode)}>Nächste Runde</button></div>
    </section>}
  </div>;
}

function MemberEditor({ member, onClose, show }: { member?: Member; onClose: () => void; show: (message: string) => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const duplicate = await db.members.filter((item) => item.name.toLocaleLowerCase('de-DE') === clean.toLocaleLowerCase('de-DE') && item.id !== member?.id).first();
    if (duplicate) { show('Ein Mitglied mit diesem Namen ist bereits vorhanden.'); return; }
    const now = Date.now();
    if (member) await db.members.update(member.id, { name: clean, updatedAt: now });
    else await db.members.add({ id: makeId('member'), name: clean, isPresent: false, createdAt: now, updatedAt: now });
    show(member ? 'Mitglied gespeichert.' : 'Mitglied hinzugefügt.'); onClose();
  };
  return <Modal title={member ? 'Mitglied bearbeiten' : 'Mitglied hinzufügen'} onClose={onClose}>
    <form onSubmit={submit}>
      <label className="field-label" htmlFor="member-name">Name</label>
      <input id="member-name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} placeholder="Vor- und Nachname" />
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!name.trim()}>{member ? 'Speichern' : 'Hinzufügen'}</button></div>
    </form>
  </Modal>;
}

function MembersView({ members, show }: { members: Member[]; show: (message: string) => void }) {
  const [newMemberName, setNewMemberName] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const sorted = useMemo(() => [...members].sort((a, b) => a.name.localeCompare(b.name, 'de-DE')), [members]);
  const presentCount = members.filter((m) => m.isPresent).length;

  const setAll = async (isPresent: boolean) => {
    await db.members.toCollection().modify({ isPresent, updatedAt: Date.now() });
    show(isPresent ? 'Alle Mitglieder sind anwesend.' : 'Anwesenheit zurückgesetzt.');
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = newMemberName.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const duplicate = await db.members.filter((member) => member.name.toLocaleLowerCase('de-DE') === clean.toLocaleLowerCase('de-DE')).first();
    if (duplicate) { show('Ein Mitglied mit diesem Namen ist bereits vorhanden.'); return; }
    const now = Date.now();
    await db.members.add({ id: makeId('member'), name: clean, isPresent: false, createdAt: now, updatedAt: now });
    setNewMemberName('');
    show('Mitglied hinzugefügt.');
  };

  return <div className="view-stack">
    <div className="page-heading"><div><span className="eyebrow">Mannschaft</span><h1>Mitglieder</h1><p>{presentCount} anwesend · {members.length} insgesamt</p></div></div>
    <div className="member-tools">
      <form className="add-player-form" onSubmit={addMember}>
        <label className="sr-only" htmlFor="new-member-name">Spieler hinzufügen</label>
        <input id="new-member-name" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Spieler hinzufügen" maxLength={80} />
        <button type="submit" aria-label="Spieler hinzufügen" disabled={!newMemberName.trim()}><Plus /><span>Hinzufügen</span></button>
      </form>
      <div className="bulk-actions"><button onClick={() => setAll(false)}><UserX />Alle abwesend</button><button onClick={() => setAll(true)}><UserCheck />Alle anwesend</button></div>
    </div>
    <div className="members-list">
      {sorted.map((member) => <article className={`member-row ${member.isPresent ? 'is-present' : ''}`} key={member.id}>
        <button className="presence-toggle" role="switch" aria-checked={member.isPresent} aria-label={`${member.name} ${member.isPresent ? 'als abwesend' : 'als anwesend'} markieren`} onClick={() => db.members.update(member.id, { isPresent: !member.isPresent, updatedAt: Date.now() })}>
          <span className="toggle-track"><span /></span><span className="presence-text">{member.isPresent ? 'Anwesend' : 'Abwesend'}</span>
        </button>
        <strong className="member-name">{member.name}</strong>
        <div className="row-actions"><button className="icon-button" aria-label={`${member.name} bearbeiten`} onClick={() => setEditing(member)}><Pencil /></button><button className="icon-button danger-icon" aria-label={`${member.name} löschen`} onClick={() => setDeleting(member)}><Trash2 /></button></div>
      </article>)}
      {sorted.length === 0 && <div className="empty-state"><Users /><h3>Noch keine Mitglieder</h3><p>Füge den ersten Spieler über das Feld oben hinzu.</p></div>}
    </div>
    {editing && <MemberEditor member={editing} onClose={() => setEditing(null)} show={show} />}
    {deleting && <ConfirmModal title="Mitglied löschen?" text={`${deleting.name} wird dauerhaft aus der Mitgliederliste entfernt. Bereits gespeicherte Runden bleiben im Verlauf lesbar.`} action="Löschen" danger onClose={() => setDeleting(null)} onConfirm={async () => { await db.members.delete(deleting.id); show('Mitglied gelöscht.'); setDeleting(null); }} />}
  </div>;
}

function HistoryView({ trainings, rounds, onNewTraining }: { trainings: Training[]; rounds: Round[]; onNewTraining: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(trainings.find((t) => t.status === 'active')?.id ?? null);
  const sortedTrainings = [...trainings].sort((a, b) => b.startedAt - a.startedAt);
  return <div className="view-stack">
    <div className="page-heading"><div><span className="eyebrow">Archiv</span><h1>Verlauf</h1><p>{rounds.length} bestätigte {rounds.length === 1 ? 'Runde' : 'Runden'}</p></div><button className="button primary compact" onClick={onNewTraining}><Plus />Neues Training</button></div>
    <div className="history-list">
      {sortedTrainings.map((training) => {
        const trainingRounds = rounds.filter((round) => round.trainingId === training.id).sort((a, b) => b.number - a.number);
        const isOpen = expanded === training.id;
        return <section className="training-card" key={training.id}>
          <button className="training-head" onClick={() => setExpanded(isOpen ? null : training.id)} aria-expanded={isOpen}>
            <span className="calendar-tile"><strong>{new Date(training.startedAt).getDate()}</strong><small>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(training.startedAt)}</small></span>
            <span><strong>{training.status === 'active' ? 'Aktuelles Training' : `Training vom ${formatDate(training.startedAt, false)}`}</strong><small>{trainingRounds.length} {trainingRounds.length === 1 ? 'Runde' : 'Runden'} · {formatDate(training.startedAt)}</small></span>
            <ChevronRight className={isOpen ? 'rotated' : ''} />
          </button>
          {isOpen && <div className="training-rounds">
            {trainingRounds.length === 0 && <p className="empty-inline">Noch keine bestätigte Runde.</p>}
            {trainingRounds.map((round) => <details className="round-detail" key={round.id}>
              <summary><span><strong>Runde {round.number}</strong><small>{round.mode === 'double' ? 'Doppel' : 'Einzel'} · {new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(round.confirmedAt)} Uhr</small></span><ChevronRight /></summary>
              <ResultCards result={round} />
            </details>)}
          </div>}
        </section>;
      })}
    </div>
  </div>;
}

function SettingsModal({ onClose, show }: { onClose: () => void; show: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<DatabaseBackup | null>(null);
  const [storageStatus, setStorageStatus] = useState<'unknown' | 'persistent' | 'standard'>('unknown');
  const appUrl = window.location.href.split('#')[0];

  useEffect(() => {
    navigator.storage?.persisted?.().then((persistent) => setStorageStatus(persistent ? 'persistent' : 'standard')).catch(() => setStorageStatus('standard'));
  }, []);

  const requestStorage = async () => {
    if (!navigator.storage?.persist) { setStorageStatus('standard'); show('Dieser Browser unterstützt die Speicheranfrage nicht.'); return; }
    const granted = await navigator.storage.persist();
    setStorageStatus(granted ? 'persistent' : 'standard');
    show(granted ? 'Dauerhafte Speicherung wurde erlaubt.' : 'Der Browser verwaltet den Speicher weiterhin automatisch.');
  };
  const download = async () => {
    const backup = await exportDatabase();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `tischtennis-sicherung-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(link.href); show('Sicherung erstellt.');
  };
  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateBackup(parsed)) throw new Error();
      setPendingBackup(parsed);
    } catch { show('Die ausgewählte Datei ist keine gültige Sicherung.'); }
    event.target.value = '';
  };

  return <>
    <Modal title="Einstellungen" onClose={onClose} wide>
      <div className="settings-grid">
        <section className="settings-section"><div className="settings-title"><Archive /><div><h3>Daten sichern</h3><p>Alle Mitglieder, Anwesenheiten und Trainings bleiben lokal auf diesem Gerät.</p></div></div>
          <div className="settings-actions"><button className="button secondary" onClick={download}><Download />JSON exportieren</button><button className="button secondary" onClick={() => fileRef.current?.click()}><Upload />JSON importieren</button></div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={selectFile} />
          <div className="notice"><Info /><span>Beim Löschen der Browser- oder App-Daten kann auch diese lokale Datenbank verloren gehen. Erstelle deshalb regelmäßig eine Sicherung.</span></div>
          <button className="text-button" onClick={requestStorage}>{storageStatus === 'persistent' ? 'Dauerhafte Speicherung ist aktiv' : 'Dauerhafte Speicherung anfragen'}</button>
        </section>
        <section className="settings-section install-section"><div className="settings-title"><Download /><div><h3>App installieren</h3><p>Öffne diese Seite auf dem Smartphone und füge sie zum Home-Bildschirm hinzu.</p></div></div>
          <ol><li><strong>iPhone:</strong> In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.</li><li><strong>Android:</strong> Im Browser-Menü „App installieren“ oder „Zum Startbildschirm“ wählen.</li></ol>
          <div className="qr-wrap"><QRCodeSVG value={appUrl} size={144} fgColor="#64222D" bgColor="#FFFCF8" level="M" marginSize={2} /><span>QR-Code für diese Adresse</span></div>
        </section>
        <section className="settings-section privacy-section"><div className="settings-title"><Info /><div><h3>Datenschutz</h3><p>Keine Konten, kein Tracking, keine Werbung. Es werden keine Mitgliederdaten an einen Server gesendet.</p></div></div></section>
      </div>
    </Modal>
    {pendingBackup && <ConfirmModal title="Sicherung wiederherstellen?" text="Alle derzeit auf diesem Gerät gespeicherten Mitglieder, Anwesenheiten und Trainings werden durch die Sicherung ersetzt." action="Importieren" danger onClose={() => setPendingBackup(null)} onConfirm={async () => { try { await importDatabase(pendingBackup); setPendingBackup(null); onClose(); show('Sicherung erfolgreich wiederhergestellt.'); } catch { show('Die Sicherung konnte nicht importiert werden.'); } }} />}
  </>;
}

function NewTrainingModal({ onClose, onDone }: { onClose: () => void; onDone: (keep: boolean) => Promise<void> }) {
  return <Modal title="Neues Training starten" onClose={onClose}>
    <p className="modal-copy">Das aktuelle Training wird archiviert. Was soll mit der Anwesenheit passieren?</p>
    <div className="choice-stack"><button className="choice-button" onClick={() => onDone(true)}><UserCheck /><span><strong>Anwesenheit übernehmen</strong><small>Die aktuellen Häkchen bleiben erhalten.</small></span><ChevronRight /></button><button className="choice-button" onClick={() => onDone(false)}><UserX /><span><strong>Alle auf abwesend setzen</strong><small>Die Mitgliederliste bleibt unverändert.</small></span><ChevronRight /></button></div>
  </Modal>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTrainingOpen, setNewTrainingOpen] = useState(false);
  const toast = useToast();

  useEffect(() => { initializeDatabase().then(() => setReady(true)).catch(() => toast.show('Die lokale Datenbank konnte nicht geöffnet werden.')); }, []);
  const members = useLiveQuery(() => ready ? db.members.toArray() : [], [ready], []);
  const trainings = useLiveQuery(() => ready ? db.trainings.toArray() : [], [ready], []);
  const activeTraining = trainings.find((training) => training.status === 'active');
  const rounds = useLiveQuery(() => ready ? db.rounds.toArray() : [], [ready], []);
  const activeRounds = useMemo(() => activeTraining ? rounds.filter((round) => round.trainingId === activeTraining.id).sort((a, b) => a.number - b.number) : [], [rounds, activeTraining]);

  const startTraining = async (keep: boolean) => {
    await startNewTraining(keep); setNewTrainingOpen(false); setTab('home'); toast.show('Neues Training gestartet.');
  };

  if (!ready || !activeTraining) return <div className="splash"><div className="brand-mark"><CircleDot /></div><strong>Auslosung wird vorbereitet …</strong></div>;

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setTab('home')}><img className="club-logo" src={`${import.meta.env.BASE_URL}sv-westerbeck-wappen.png`} alt="Wappen des SV Westerbeck" /><span><strong>SVW Schüttel App</strong><small>SVW - Olé olé!</small></span></button><button className="icon-button settings-button" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen öffnen"><Settings /></button></header>
    <main>
      {tab === 'home' && <HomeView members={members} training={activeTraining} rounds={activeRounds} goMembers={() => setTab('members')} show={toast.show} />}
      {tab === 'members' && <MembersView members={members} show={toast.show} />}
      {tab === 'history' && <HistoryView trainings={trainings} rounds={rounds} onNewTraining={() => setNewTrainingOpen(true)} />}
    </main>
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><Home /><span>Start</span></button>
      <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}><Users /><span>Mitglieder</span></button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History /><span>Verlauf</span></button>
    </nav>
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} show={toast.show} />}
    {newTrainingOpen && <NewTrainingModal onClose={() => setNewTrainingOpen(false)} onDone={startTraining} />}
    {toast.message && <div className="toast" role="status">{toast.message}</div>}
  </div>;
}
