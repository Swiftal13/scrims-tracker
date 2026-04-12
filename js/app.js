/* ============================================================
   Minecraft Server Tracker — App Logic
   ============================================================ */

const API_URL     = 'https://api.mcsrvstat.us/3/na.scrims.network';
const AVATAR_BASE = 'https://crafatar.com/avatars/';
const INTERVAL    = 60; // seconds

let countdown = INTERVAL;
let timer     = null;

// DOM refs
const serverIcon   = document.getElementById('serverIcon');
const iconFallback = document.getElementById('iconFallback');
const statusPip    = document.getElementById('statusPip');
const statusText   = document.getElementById('statusText');
const infoGrid     = document.getElementById('infoGrid');
const playerCount  = document.getElementById('playerCount');
const motdCell     = document.getElementById('motdCell');
const motdText     = document.getElementById('motdText');
const playerSection = document.getElementById('playerSection');
const playerGrid   = document.getElementById('playerGrid');
const lastUpdated  = document.getElementById('lastUpdated');
const countdownNum = document.getElementById('countdownNum');
const progressFill = document.getElementById('progressFill');
const refreshBtn   = document.getElementById('refreshBtn');

// ── Fetch ────────────────────────────────────────────────────
async function fetchStatus() {
  setLoading();
  try {
    const res  = await fetch(API_URL);
    const data = await res.json();
    render(data);
  } catch {
    renderError();
  }
  markUpdated();
  resetCountdown();
}

// ── Render states ────────────────────────────────────────────
function setLoading() {
  statusPip.className  = 'status-pip';
  statusText.className = 'status-text';
  statusText.textContent = 'Checking...';
}

function renderError() {
  statusPip.className  = 'status-pip offline';
  statusText.className = 'status-text error';
  statusText.textContent = 'Error — retrying...';
  infoGrid.classList.add('hidden');
  playerSection.classList.add('hidden');
}

function render(data) {
  const online = data.online === true;

  // Server icon
  if (data.icon) {
    serverIcon.src = data.icon;
    serverIcon.classList.remove('hidden');
    iconFallback.classList.add('hidden');
  }

  // Status
  statusPip.className  = `status-pip ${online ? 'online' : 'offline'}`;
  statusText.className = `status-text ${online ? 'online' : 'offline'}`;
  statusText.textContent = online ? 'Online' : 'Offline';

  if (!online) {
    infoGrid.classList.add('hidden');
    playerSection.classList.add('hidden');
    return;
  }

  // Player count
  infoGrid.classList.remove('hidden');
  const cur = data.players?.online ?? 0;
  const max = data.players?.max    ?? '?';
  playerCount.innerHTML = `<span class="accent">${cur}</span> / ${max}`;

  // MOTD
  const motdRaw = data.motd?.clean?.[0]?.trim() ?? '';
  if (motdRaw) {
    motdText.textContent = motdRaw;
    motdCell.classList.remove('hidden');
  } else {
    motdCell.classList.add('hidden');
  }

  // Player list
  playerSection.classList.remove('hidden');
  playerGrid.innerHTML = '';

  const list = data.players?.list;

  if (!list || list.length === 0) {
    const msg = document.createElement('p');
    msg.className   = 'empty-msg';
    msg.textContent = cur === 0
      ? 'No players online.'
      : 'Player list is hidden by the server.';
    playerGrid.appendChild(msg);
    return;
  }

  list.forEach(player => {
    const uuid = player.uuid;
    const name = player.name ?? String(player);

    const chip = document.createElement('div');
    chip.className = 'player-chip';

    if (uuid) {
      const img    = document.createElement('img');
      img.src      = `${AVATAR_BASE}${uuid}?size=32&overlay`;
      img.alt      = name;
      img.loading  = 'lazy';
      // Fallback: show a plain 28×28 gray square if avatar fails
      img.onerror  = () => img.remove();
      chip.appendChild(img);
    }

    const nameEl       = document.createElement('span');
    nameEl.className   = 'player-name';
    nameEl.textContent = name;
    chip.appendChild(nameEl);

    playerGrid.appendChild(chip);
  });
}

// ── Countdown ────────────────────────────────────────────────
function resetCountdown() {
  countdown = INTERVAL;
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  updateCountdownUI();
}

function tick() {
  countdown = Math.max(0, countdown - 1);
  updateCountdownUI();
  if (countdown === 0) {
    clearInterval(timer);
    fetchStatus();
  }
}

function updateCountdownUI() {
  countdownNum.textContent = countdown;
  const pct = (countdown / INTERVAL) * 100;
  progressFill.style.width = `${pct}%`;
  progressFill.classList.toggle('warn', countdown <= 15);
}

// ── Last updated ─────────────────────────────────────────────
function markUpdated() {
  const t = new Date().toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  lastUpdated.textContent = `Last updated: ${t}`;
}

// ── Manual refresh ───────────────────────────────────────────
function triggerRefresh() {
  clearInterval(timer);
  fetchStatus();
}

refreshBtn.addEventListener('click', triggerRefresh);

// ── Boot ─────────────────────────────────────────────────────
fetchStatus();
