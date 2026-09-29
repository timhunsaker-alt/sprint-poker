import { useState } from 'react';
import styles from './PokerRoom.module.css';

const POINTS = [1, 2, 3, 5, 8, 13, 21];

export function PokerRoom({ roomState, clientId, connected, onVote, onReveal, onNewRound, onLeave }) {
  const { voters, revealed, code } = roomState;
  const me = voters.find(v => v.id === clientId);
  const myPick = me?.pick ?? null;

  const votedCount = voters.filter(v => v.hasVoted).length;
  const allVoted = votedCount === voters.length && voters.length > 0;

  // Copy room code to clipboard
  const [copied, setCopied] = useState(false);
  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Stats for revealed state
  let stats = null;
  if (revealed) {
    const picks = voters.filter(v => v.pick !== null && v.pick !== '__hidden__').map(v => v.pick);
    if (picks.length > 0) {
      const avg = picks.reduce((a, b) => a + b, 0) / picks.length;
      const min = Math.min(...picks);
      const max = Math.max(...picks);
      const isConsensus = min === max;
      const nearest = POINTS.reduce((prev, curr) =>
        Math.abs(curr - avg) < Math.abs(prev - avg) ? curr : prev
      );
      stats = { avg, min, max, isConsensus, nearest };
    }
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <span className={styles.brandMark}>♠</span>
          <span className={styles.brandName}>Sprint Poker</span>
        </div>
        <div className={styles.roomRow}>
          <span className={styles.roomLabel}>Room</span>
          <button className={styles.codeBtn} onClick={copyCode} title="Copy room code">
            <span className={styles.codeText}>{code}</span>
            <span className={styles.copyHint}>{copied ? '✓ copied' : 'copy'}</span>
          </button>
          <button className={styles.leaveBtn} onClick={onLeave}>Leave</button>
        </div>
      </header>

      <main className={styles.main}>
        {!connected && (
          <div className={styles.reconnectBanner}>
            ⟳ Reconnecting…
          </div>
        )}

        {/* Voter strip */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>Participants ({voters.length})</h2>
          <div className={styles.voterStrip}>
            {voters.map(v => (
              <div
                key={v.id}
                className={`${styles.voterChip}
                  ${v.hasVoted ? styles.voted : ''}
                  ${v.id === clientId ? styles.isMe : ''}
                  ${v.online === false ? styles.offline : ''}
                `}
              >
                <span className={styles.chipDot} />
                <span className={styles.chipName}>
                  {v.name}{v.id === clientId ? ' (you)' : ''}
                  {v.online === false ? ' 🔴' : ''}
                </span>
                {revealed && v.pick !== null && v.pick !== '__hidden__' && (
                  <span className={styles.chipScore}>{v.pick}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Card picker */}
        {!revealed && (
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>Your estimate</h2>
            <div className={styles.cardGrid}>
              {POINTS.map(p => (
                <button
                  key={p}
                  className={`${styles.card} ${myPick === p ? styles.cardSelected : ''}`}
                  onClick={() => onVote(myPick === p ? null : p)}
                >
                  {p}
                </button>
              ))}
            </div>
            {myPick !== null && (
              <p className={styles.pickedMsg}>
                Your pick: <strong>{myPick}</strong> — hidden from others until reveal
              </p>
            )}
          </section>
        )}

        {/* Results */}
        {revealed && stats && (
          <section className={`${styles.section} ${styles.resultsSection}`}>
            <h2 className={styles.sectionLabel}>
              Results
              {stats.isConsensus && <span className={styles.consensusBadge}>consensus ✓</span>}
            </h2>
            <div className={styles.resultCards}>
              {voters.filter(v => v.pick !== null && v.pick !== '__hidden__').map(v => (
                <div
                  key={v.id}
                  className={`${styles.resultCard} ${v.pick === stats.max && !stats.isConsensus ? styles.resultHigh : ''}`}
                >
                  <div className={styles.resultScore}>{v.pick}</div>
                  <div className={styles.resultName}>{v.name}</div>
                </div>
              ))}
            </div>
            <div className={styles.statsRow}>
              {stats.isConsensus ? (
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Final estimate</span>
                  <span className={`${styles.statVal} ${styles.statConsensus}`}>{stats.min} pts</span>
                </div>
              ) : (
                <>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Average</span>
                    <span className={styles.statVal}>{stats.avg % 1 === 0 ? stats.avg : stats.avg.toFixed(1)}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Suggested</span>
                    <span className={`${styles.statVal} ${styles.statAccent}`}>{stats.nearest}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Range</span>
                    <span className={styles.statVal}>{stats.min} – {stats.max}</span>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Actions */}
        <section className={styles.actions}>
          {!revealed ? (
            <button
              className={styles.btnReveal}
              onClick={onReveal}
              disabled={votedCount === 0}
            >
              Reveal scores
              <span className={styles.voteCount}>{votedCount}/{voters.length}</span>
            </button>
          ) : (
            <button className={styles.btnNewRound} onClick={onNewRound}>
              Start new round
            </button>
          )}
          {!revealed && allVoted && (
            <span className={styles.allVotedHint}>Everyone has voted!</span>
          )}
        </section>
      </main>
    </div>
  );
}
