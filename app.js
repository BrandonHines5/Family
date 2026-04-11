// Basketball Stats Tracker
const STORAGE_KEY = 'bball-stats-v1';
const LIVE_KEY = 'bball-live-v1';

const emptyStats = () => ({
  ftm: 0, fta: 0,
  fg2m: 0, fg2a: 0,
  fg3m: 0, fg3a: 0,
  reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
});

const simpleStats = ['reb', 'ast', 'stl', 'blk', 'tov', 'pf'];

let state = {
  playerName: '',
  games: [],
};

let liveGame = null;

// ---------- Persistence ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { console.warn('Failed to load state', e); }

  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (raw) liveGame = JSON.parse(raw);
  } catch (e) { console.warn('Failed to load live game', e); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveLive() {
  if (liveGame) localStorage.setItem(LIVE_KEY, JSON.stringify(liveGame));
  else localStorage.removeItem(LIVE_KEY);
}

// ---------- Stats math ----------
function pointsOf(s) {
  return s.ftm + (s.fg2m * 2) + (s.fg3m * 3);
}

function fgPct(made, att) {
  if (!att) return '—';
  return ((made / att) * 100).toFixed(0) + '%';
}

// ---------- Rendering ----------
function render() {
  document.getElementById('playerName').value = state.playerName || '';
  renderLiveGame();
  renderAverages();
  renderHistory();
}

function renderLiveGame() {
  const newForm = document.getElementById('newGameForm');
  const live = document.getElementById('liveGame');
  const status = document.getElementById('gameStatus');
  const finishBtn = document.getElementById('finishGame');
  const cancelBtn = document.getElementById('cancelGame');
  const banner = document.getElementById('editBanner');

  if (!liveGame) {
    newForm.classList.remove('hidden');
    live.classList.add('hidden');
    status.textContent = 'No game in progress';
    // default today's date
    if (!document.getElementById('gameDate').value) {
      document.getElementById('gameDate').value = new Date().toISOString().slice(0, 10);
    }
    return;
  }

  newForm.classList.add('hidden');
  live.classList.remove('hidden');

  const editing = !!liveGame.editingId;
  status.textContent = editing ? 'Editing saved game' : 'Game in progress';
  finishBtn.textContent = editing ? 'Save Changes' : 'Finish Game';
  cancelBtn.textContent = editing ? 'Discard Changes' : 'Cancel';
  banner.classList.toggle('hidden', !editing);

  document.getElementById('liveOpponent').value = liveGame.opponent || '';
  document.getElementById('liveDate').value = liveGame.date || '';

  const s = liveGame.stats;
  document.getElementById('livePoints').textContent = pointsOf(s);
  document.getElementById('ftm').textContent = s.ftm;
  document.getElementById('fta').textContent = s.fta;
  document.getElementById('fg2m').textContent = s.fg2m;
  document.getElementById('fg2a').textContent = s.fg2a;
  document.getElementById('fg3m').textContent = s.fg3m;
  document.getElementById('fg3a').textContent = s.fg3a;
  simpleStats.forEach(k => {
    document.getElementById(k).textContent = s[k];
  });
}

function renderAverages() {
  const container = document.getElementById('averages');
  const games = state.games;
  const n = games.length;
  document.getElementById('gamesPlayed').textContent = `${n} game${n === 1 ? '' : 's'}`;

  if (n === 0) {
    container.innerHTML = '<div class="empty" style="grid-column: 1/-1;">No games yet. Start one above!</div>';
    return;
  }

  const totals = emptyStats();
  let totalPts = 0;
  games.forEach(g => {
    Object.keys(totals).forEach(k => { totals[k] += g.stats[k] || 0; });
    totalPts += pointsOf(g.stats);
  });

  const avgs = [
    { label: 'PPG', value: (totalPts / n).toFixed(1) },
    { label: 'RPG', value: (totals.reb / n).toFixed(1) },
    { label: 'APG', value: (totals.ast / n).toFixed(1) },
    { label: 'SPG', value: (totals.stl / n).toFixed(1) },
    { label: 'BPG', value: (totals.blk / n).toFixed(1) },
    { label: 'TOPG', value: (totals.tov / n).toFixed(1) },
    { label: 'FG%', value: fgPct(totals.fg2m + totals.fg3m, totals.fg2a + totals.fg3a) },
    { label: '3P%', value: fgPct(totals.fg3m, totals.fg3a) },
    { label: 'FT%', value: fgPct(totals.ftm, totals.fta) },
  ];

  container.innerHTML = avgs.map(a =>
    `<div class="avg-item"><div class="label">${a.label}</div><div class="value">${a.value}</div></div>`
  ).join('');
}

function renderHistory() {
  const container = document.getElementById('history');
  if (state.games.length === 0) {
    container.innerHTML = '<div class="empty">No games recorded yet.</div>';
    return;
  }

  const sorted = [...state.games].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  container.innerHTML = sorted.map(g => {
    const s = g.stats;
    const pts = pointsOf(s);
    const line = `<strong>${pts}</strong> pts · ${s.reb} reb · ${s.ast} ast · ${s.stl} stl · ${s.blk} blk`;
    return `
      <div class="history-item">
        <div>
          <span class="opp">${escapeHtml(g.opponent || 'Game')}</span>
          <span class="date">${formatDate(g.date)}</span>
        </div>
        <div class="stats">${line}</div>
        <div class="history-actions">
          <button class="edit-btn" data-id="${g.id}">Edit</button>
          <button class="delete-btn" data-id="${g.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editGame(btn.dataset.id));
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteGame(btn.dataset.id));
  });
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Actions ----------
function startGame() {
  const opponent = document.getElementById('opponent').value.trim();
  const date = document.getElementById('gameDate').value || new Date().toISOString().slice(0, 10);

  liveGame = {
    id: String(Date.now()),
    opponent: opponent || 'Game',
    date,
    stats: emptyStats(),
  };
  saveLive();
  document.getElementById('opponent').value = '';
  renderLiveGame();
}

function syncMetaFromInputs() {
  if (!liveGame) return;
  const opp = document.getElementById('liveOpponent').value.trim();
  const date = document.getElementById('liveDate').value;
  liveGame.opponent = opp || 'Game';
  if (date) liveGame.date = date;
}

function finishGame() {
  if (!liveGame) return;
  syncMetaFromInputs();

  if (liveGame.editingId) {
    const idx = state.games.findIndex(g => g.id === liveGame.editingId);
    if (idx !== -1) {
      state.games[idx] = {
        id: liveGame.editingId,
        opponent: liveGame.opponent,
        date: liveGame.date,
        stats: liveGame.stats,
      };
    }
  } else {
    state.games.push(liveGame);
  }

  liveGame = null;
  saveState();
  saveLive();
  render();
}

function cancelGame() {
  if (!liveGame) return;
  const editing = !!liveGame.editingId;
  const msg = editing
    ? 'Discard changes to this game?'
    : 'Cancel this game? All stats will be lost.';
  if (!confirm(msg)) return;
  liveGame = null;
  saveLive();
  render();
}

function editGame(id) {
  if (liveGame && !liveGame.editingId) {
    alert('Finish or cancel your current game before editing another.');
    return;
  }
  const game = state.games.find(g => g.id === id);
  if (!game) return;

  liveGame = {
    id: game.id,
    editingId: game.id,
    opponent: game.opponent,
    date: game.date,
    stats: { ...emptyStats(), ...game.stats },
  };
  saveLive();
  render();
  document.getElementById('liveGameCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteGame(id) {
  if (!confirm('Delete this game?')) return;
  state.games = state.games.filter(g => g.id !== id);
  // If currently editing this game, drop the edit session too
  if (liveGame && liveGame.editingId === id) {
    liveGame = null;
    saveLive();
  }
  saveState();
  render();
}

function handleShotAction(action, type) {
  if (!liveGame) return;
  const s = liveGame.stats;
  const attKey = type + 'a';
  const madeKey = type + 'm';
  s[attKey]++;
  if (action === 'make') s[madeKey]++;
  saveLive();
  renderLiveGame();
}

function handleSimpleAction(action, stat) {
  if (!liveGame) return;
  const s = liveGame.stats;
  if (action === 'inc') s[stat]++;
  else if (action === 'dec' && s[stat] > 0) s[stat]--;
  saveLive();
  renderLiveGame();
}

function exportJson() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `basketball-stats-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  render();

  document.getElementById('savePlayer').addEventListener('click', () => {
    state.playerName = document.getElementById('playerName').value.trim();
    saveState();
  });

  document.getElementById('startGame').addEventListener('click', startGame);
  document.getElementById('finishGame').addEventListener('click', finishGame);
  document.getElementById('cancelGame').addEventListener('click', cancelGame);
  document.getElementById('exportBtn').addEventListener('click', exportJson);

  // Persist opponent/date edits while editing or playing live
  document.getElementById('liveOpponent').addEventListener('input', () => {
    if (!liveGame) return;
    liveGame.opponent = document.getElementById('liveOpponent').value;
    saveLive();
  });
  document.getElementById('liveDate').addEventListener('change', () => {
    if (!liveGame) return;
    const v = document.getElementById('liveDate').value;
    if (v) {
      liveGame.date = v;
      saveLive();
    }
  });

  // Delegate stat button clicks
  document.getElementById('liveGame').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (!action) return;
    if (action === 'make' || action === 'miss') {
      handleShotAction(action, btn.dataset.type);
    } else if (action === 'inc' || action === 'dec') {
      handleSimpleAction(action, btn.dataset.stat);
    }
  });
});
