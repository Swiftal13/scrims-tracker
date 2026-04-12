const API_URL = 'https://api.mcsrvstat.us/3/na.scrims.network';
const AVATAR_BASE = 'https://crafatar.com/avatars/';
const INTERVAL = 60;
const MAX_HISTORY = 168; // 7 days of hourly buckets

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

async function loadHistory() {
  let shared = [];
  let local = [];

  try {
    const res = await fetch('data/history.json');
    if (res.ok) shared = (await res.json()).filter(h => h.key !== undefined);
  } catch {}

  try {
    local = JSON.parse(localStorage.getItem('scrims-history') || '[]').filter(h => h.key !== undefined);
  } catch {}

  if (shared.length > 0) {
    history = shared;
    if (local.length > 0) {
      const lastLocal = local[local.length - 1];
      const lastShared = shared[shared.length - 1];
      if (lastLocal.t > lastShared.t) {
        history.push(lastLocal);
      } else if (lastLocal.key === lastShared.key && lastLocal.samples > lastShared.samples) {
        history[history.length - 1] = lastLocal;
      }
    }
  } else {
    history = local;
  }
}

function hourKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
}

function hourStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
}

function pushHistory(online, players, max) {
  const now = new Date();
  const key = hourKey(now);
  const last = history[history.length - 1];

  if (last && last.key === key) {
    if (online) {
      last.sum += players;
      last.samples++;
    }
    last.total++;
    last.p = last.samples > 0 ? Math.round(last.sum / last.samples) : 0;
    last.m = Math.max(last.m, max);
    last.o = last.samples > 0;
  } else {
    history.push({
      key,
      t: hourStart(now),
      sum: online ? players : 0,
      samples: online ? 1 : 0,
      total: 1,
      p: online ? players : 0,
      m: max,
      o: online,
    });
    if (history.length > MAX_HISTORY) history.shift();
  }

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
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Collecting data — updates every hour', W / 2, H / 2);
    return;
  }

  const globalMax = Math.max(...history.map(h => h.m ?? 0), 1);
  const pad = { top: 20, right: 14, bottom: 28, left: 36 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // Grid lines + Y labels
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH / 4) * i;
    const val = Math.round(globalMax * (1 - i / 4));

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cW, y);
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(val, pad.left - 4, y);
  }

  const n = history.length;

  const pts = history.map((pt, i) => ({
    x: pad.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW),
    y: pad.top + cH - (pt.o ? (pt.p / globalMax) : 0) * cH,
    pt,
  }));

  // Catmull-Rom spline helper
  function spline(points) {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y
      );
    }
  }

  // Filled area under line
  const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  areaGrad.addColorStop(0, 'rgba(85,255,85,0.2)');
  areaGrad.addColorStop(1, 'rgba(85,255,85,0.02)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pad.top + cH);
  ctx.lineTo(pts[0].x, pts[0].y);
  spline(pts);
  ctx.lineTo(pts[n - 1].x, pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  spline(pts);
  ctx.strokeStyle = '#55FF55';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots (skip if too crowded)
  const dotR = n > 72 ? 0 : n > 36 ? 2 : 3;
  if (dotR > 0) {
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = p.pt.o ? '#55FF55' : '#FF5555';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // MAX dashed line
  ctx.strokeStyle = 'rgba(255,255,85,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left + cW, pad.top);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,85,0.5)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`MAX ${globalMax}`, pad.left + 2, pad.top - 2);

  // X axis hour labels
  const tickEvery = Math.max(1, Math.floor(n / 8));
  const firstDay = new Date(history[0].t).getDate();
  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  history.forEach((pt, i) => {
    if (i % tickEvery !== 0 && i !== n - 1) return;
    const x = pad.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const d = new Date(pt.t);
    const lbl = d.getDate() !== firstDay
      ? d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.getHours() + 'h'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(lbl, x, pad.top + cH + 5);
  });
}

graphCanvas.addEventListener('mousemove', e => {
  if (history.length < 2) return;

  const rect = graphCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const padLeft = 36, padRight = 14;
  const cW = rect.width - padLeft - padRight;
  const n = history.length;
  const idx = Math.min(n - 1, Math.max(0, Math.round((mx - padLeft) / cW * (n - 1))));
  const pt = history[idx];
  if (!pt) return;

  const d = new Date(pt.t);
  const timeStr = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const status = pt.o
    ? `<span class="tip-status-online">Online</span>`
    : `<span class="tip-status-offline">Offline</span>`;

  graphTooltip.innerHTML = `${timeStr}<br>${status}${pt.o ? ` · avg ${pt.p} / ${pt.m}` : ''}`;
  graphTooltip.classList.remove('hidden');

  const x = padLeft + (n === 1 ? cW / 2 : (idx / (n - 1)) * cW);
  const tooltipW = graphTooltip.offsetWidth;
  const canvasW = rect.width;
  let left = x;
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

loadHistory().then(() => {
  drawGraph();
  fetchStatus();
});
