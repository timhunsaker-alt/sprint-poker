import { useState } from 'react';
import styles from './Lobby.module.css';

export function Lobby({ onCreateRoom, onJoinRoom, error, reconnectError, connected, initialCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode || '');
  const [tab, setTab] = useState(initialCode ? 'join' : 'create'); // create | join

  function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreateRoom(name.trim());
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onJoinRoom(name.trim(), code.trim().toUpperCase());
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo}>♠</span>
          <h1 className={styles.title}>Sprint Poker</h1>
          <p className={styles.sub}>Async-safe planning estimates for scrum teams</p>
        </div>

        <div className={styles.connStatus}>
          <span className={`${styles.dot} ${connected ? styles.dotOn : styles.dotOff}`} />
          <span>{connected ? 'Connected' : 'Connecting…'}</span>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'create' ? styles.tabActive : ''}`}
            onClick={() => setTab('create')}
          >New session</button>
          <button
            className={`${styles.tab} ${tab === 'join' ? styles.tabActive : ''}`}
            onClick={() => setTab('join')}
          >Join session</button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className={styles.form}>
            <label className={styles.label}>Your name</label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={24}
              autoFocus
            />
            <button className={styles.btn} type="submit" disabled={!connected || !name.trim()}>
              Create room
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className={styles.form}>
            <label className={styles.label}>Your name</label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={24}
              autoFocus
            />
            <label className={styles.label} style={{ marginTop: '12px' }}>Room code</label>
            <input
              className={`${styles.input} ${styles.codeInput}`}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
            <button className={styles.btn} type="submit" disabled={!connected || !name.trim() || code.trim().length < 6}>
              Join room
            </button>
          </form>
        )}

        {reconnectError && <p className={styles.reconnectError}>{reconnectError}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
