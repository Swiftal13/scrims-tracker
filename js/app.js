const API_URL = 'https://api.mcsrvstat.us/3/na.scrims.network';
const AVATAR_BASE = 'https://crafatar.com/avatars/';
const INTERVAL = 60;
const MAX_HISTORY = 30;

let countdown = INTERVAL;
let timer = null;
let offlineSince = null;

let prevPlayerNames = new Set();
let chipMap = new Map();

const serverIcon = document.getElementById('serverIcon');
const iconFallback = document.getElementById('iconFallback');
const statusPip = document.getElementById('statusPip');
const statusText = document.getElementById('statusText');
const versionBadge = document.getElementById('versionBadge');
const infoGrid = document.getElementById('infoGrid');
const playerCount = document.getElementById('playerCount');
const motdCell = document.getElementById('motdCell');
const motdText = document.getElementById('motdText');
const playerSection = document.getElementById('playerSection');
const playerGrid = document.getElementById('playerGrid');
const lastUpdated = document.getElementById('lastUpdated');
const countdownNum = document.getElementById('countdownNum');
const progressFill = document.getElementById('progressFill');
const refreshBtn = document.getElementById('refreshBtn');
const graphCanvas = document.getElementById('graphCanvas');
const graphTooltip = document.getElementById('graphTooltip');

let history = [];

function loadHistory() {
  try {
    history = JSON.parse(localStorage.getItem('scrims-history') || '[]');
  } catch {
    history = [];
  }
}

function pushHistory(online, players, max) {
  history.push({ t: Date.now(), o: online, p: players, m: max });
  if (history.length > MAX_HISTORY) history.shift();
  try {
    localStorage.setItem('scrims-history', JSON.stringify(history));
  } catch {}
  drawGraph();
}

async function fetchStatus() {
  setLoading();
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    render(data);
  } catch {
    renderError();
  }
  markUpdated();
  resetCountdown();
}

function setLoading() {
  statusPip.className = 'status-pip';
  statusText.className = 'status-text';
  statusText.textContent = 'Checking...';
}

function renderError() {
  statusPip.className = 'status-pip offline';
  statusText.className = 'status-text error';
  statusText.textContent = 'Error — retrying...';
  infoGrid.classList.add('hidden');
  playerSection.classList.add('hidden');
  pushHistory(false, 0, history[history.length - 1]?.m ?? 0);
}

function render(data) {
  const online = data.online === true;
  const cur = data.players?.online ?? 0;
  const max = data.players?.max ?? 0;

  if (data.icon) {
    serverIcon.src = data.icon;
    serverIcon.classList.remove('hidden');
    iconFallback.classList.add('hidden');
  }

  if (data.version) {
    versionBadge.textContent = data.version;
    versionBadge.classList.remove('hidden');
  } else {
    versionBadge.classList.add('hidden');
  }

  statusPip.className = `status-pip ${online ? 'online' : 'offline'}`;
  statusText.className = `status-text ${online ? 'online' : 'offline'}`;

  if (!online) {
    if (!offlineSince) offlineSince = Date.now();
    const mins = Math.floor((Date.now() - offlineSince) / 60000);
    statusText.textContent = mins > 0 ? `Offline for ${mins}m` : 'Offline';
    infoGrid.classList.add('hidden');
    playerSection.classList.add('hidden');
    clearChips();
    pushHistory(false, 0, max || (history[history.length - 1]?.m ?? 0));
    return;
  }

  offlineSince = null;
  statusText.textContent = 'Online';

  infoGrid.classList.remove('hidden');
  playerCount.innerHTML = `<span class="accent">${cur}</span> / ${max}`;

  const motdRaw = data.motd?.clean?.[0]?.trim() ?? '';
  if (motdRaw) {
    motdText.textContent = motdRaw;
    motdCell.classList.remove('hidden');
  } else {
    motdCell.classList.add('hidden');
  }

  playerSection.classList.remove('hidden');
  renderPlayers(data.players?.list ?? null, cur);

  pushHistory(true, cur, max);
}

function createChip(uuid, name) {
  const chip = document.createElement('div');
  chip.className = 'player-chip';
  chip.dataset.name = name;

  if (uuid) {
    const img = document.createElement('img');
    img.src = `${AVATAR_BASE}${uuid}?size=32&overlay`;
    img.alt = name;
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    chip.appendChild(img);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'player-name';
  nameEl.textContent = name;
  chip.appendChild(nameEl);
  return chip;
}

function renderPlayers(list, cur) {
  const emptyMsg = playerGrid.querySelector('.empty-msg');
  if (emptyMsg) emptyMsg.remove();

  const newNames = new Set((list || []).map(p => p.name ?? String(p)));
  const isFirstLoad = prevPlayerNames.size === 0 && chipMap.size === 0;

  for (const [name, chip] of [...chipMap.entries()]) {
    if (!newNames.has(name)) {
      chip.classList.add('player-chip--left');
      chipMap.delete(name);
      setTimeout(() => chip.remove(), 1100);
    }
  }

  if (list && list.length > 0) {
    list.forEach(player => {
      const uuid = player.uuid;
      const name = player.name ?? String(player);

      if (chipMap.has(name)) return;

      const chip = createChip(uuid, name);
      if (!isFirstLoad) {
        chip.classList.add('player-chip--joined');
        chip.addEventListener('animationend', () => {
          chip.classList.remove('player-chip--joined');
        }, { once: true });
      }
      playerGrid.appendChild(chip);
      chipMap.set(name, chip);
    });
  } else if (chipMap.size === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.textContent = cur === 0
      ? 'No players online.'
      : 'Player list is hidden by the server.';
    playerGrid.appendChild(msg);
  }

  prevPlayerNames = newNames;
}

function clearChips() {
  chipMap.forEach(chip => chip.remove());
  chipMap.clear();
  prevPlayerNames.clear();
  const emptyMsg = playerGrid.querySelector('.empty-msg');
  if (emptyMsg) emptyMsg.remove();
}

function drawGraph() {
  if (!graphCanvas) return;
  const ctx = graphCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = graphCanvas.clientWidth;
  const H = graphCanvas.clientHeight;
  if (!W || !H) return;

  graphCanvas.width = W * dpr;
  graphCanvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  if (history.length < 2) {
    ctx.fillStyle = '#3a3a3a';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Collecting data — refreshes every 60s', W / 2, H / 2);
    return;
  }

  const globalMax = Math.max(...history.map(h => h.m ?? 0), 1);
  const pad = { top: 18, right: 10, bottom: 22, left: 30 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH / 4) * i;
    const val = Math.round(globalMax * (1 - i / 4));

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cW, y);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(val, pad.left - 4, y);
  }

  const n = history.length;
  const step = cW / n;
  const barW = Math.max(2, step * 0.72);

  history.forEach((pt, i) => {
    const x = pad.left + i * step + (step - barW) / 2;
    const ratio = pt.o && globalMax > 0 ? pt.p / globalMax : 0;
    const barH = Math.max(ratio > 0 ? 2 : 0, ratio * cH);
    const y = pad.top + cH - barH;

    if (!pt.o || pt.p === 0) {
      ctx.fillStyle = '#2a1010';
      ctx.fillRect(Math.round(x), pad.top + cH - 2, Math.round(barW), 2);
    } else {
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#88ff44');
      grad.addColorStop(0.5, '#55cc22');
      grad.addColorStop(1, '#3aaa10');
      ctx.fillStyle = grad;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(barW), Math.ceil(barH));
    }
  });

  ctx.strokeStyle = 'rgba(255,255,85,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left + cW, pad.top);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,85,0.4)';
  ctx.font = '7px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`MAX ${globalMax}`, pad.left + 2, pad.top - 2);

  ctx.fillStyle = '#444';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const tickEvery = Math.max(1, Math.floor(n / 6));
  history.forEach((pt, i) => {
    if (i % tickEvery !== 0) return;
    const x = pad.left + i * step + step / 2;
    const lbl = new Date(pt.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(lbl, x, pad.top + cH + 4);
  });
}

graphCanvas.addEventListener('mousemove', e => {
  if (history.length < 2) return;

  const rect = graphCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const padLeft = 30, padRight = 10;
  const cW = rect.width - padLeft - padRight;
  const n = history.length;
  const step = cW / n;
  const idx = Math.min(n - 1, Math.max(0, Math.floor((mx - padLeft) / step)));
  const pt = history[idx];
  if (!pt) return;

  const time = new Date(pt.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const status = pt.o
    ? `<span class="tip-status-online">Online</span>`
    : `<span class="tip-status-offline">Offline</span>`;

  graphTooltip.innerHTML = `${time}<br>${status}${pt.o ? ` · ${pt.p} / ${pt.m}` : ''}`;
  graphTooltip.classList.remove('hidden');

  const barCenterX = padLeft + idx * step + step / 2;
  const tooltipW = graphTooltip.offsetWidth;
  const canvasW = rect.width;
  let left = barCenterX;
  if (left - tooltipW / 2 < 4) left = tooltipW / 2 + 4;
  if (left + tooltipW / 2 > canvasW - 4) left = canvasW - tooltipW / 2 - 4;
  graphTooltip.style.left = `${left}px`;
});

graphCanvas.addEventListener('mouseleave', () => {
  graphTooltip.classList.add('hidden');
});

window.addEventListener('resize', drawGraph);

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

function markUpdated() {
  const t = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  lastUpdated.textContent = `Last updated: ${t}`;
}

refreshBtn.addEventListener('click', () => {
  clearInterval(timer);
  fetchStatus();
});

loadHistory();
drawGraph();
fetchStatus();
