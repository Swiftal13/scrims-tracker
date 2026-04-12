const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.mcsrvstat.us/3/na.scrims.network';
const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const MAX_HISTORY = 168;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'scrims-tracker/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function hourKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
}

function hourStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
}

async function main() {
  const data = await get(API_URL);

  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {}
  }

  const now = new Date();
  const key = hourKey(now);
  const online = data.online === true;
  const players = data.players?.online ?? 0;
  const max = data.players?.max ?? 0;

  const last = history[history.length - 1];
  if (last && last.key === key) {
    if (online) { last.sum += players; last.samples++; }
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

  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  console.log(`Saved ${history.length} entries. Online: ${online}, Players: ${players}/${max}`);
}

main().catch(err => { console.error(err); process.exit(1); });
