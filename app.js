// Xsolla Ultralight Games — portal
//
// Discovers game folders in this directory automatically (no manifest to edit):
//   1. Read the "Title_pictures/" directory listing (works when this site is served
//      by anything that returns an autoindex page for a folder with no index.html,
//      e.g. `python -m http.server`, nginx/Apache autoindex, most static servers).
//      Each image there ("<GameFolder>.png|jpg|jpeg|webp|gif|svg") names one game.
//   2. As a supplement, brute-force probe conventional "Game1", "Game2", ... names
//      so new games are still picked up on hosts that don't support autoindex.
//   3. Every candidate is verified by fetching "<name>/index.html"; the <title> of
//      that file becomes the card's display name.

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

const galleryEl = document.getElementById('gallery');
const emptyStateEl = document.getElementById('emptyState');
const rescanBtn = document.getElementById('rescanBtn');
const fileNoticeEl = document.getElementById('fileNotice');
const playerEl = document.getElementById('player');
const playerFrameEl = document.getElementById('playerFrame');
const playerTitleEl = document.getElementById('playerTitle');
const closePlayerBtn = document.getElementById('closePlayer');

const gameInfoCache = new Map(); // name -> { title } | null

function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const ax = [], bx = [];
  let m;
  while ((m = re.exec(a))) ax.push(m[1] ? [parseInt(m[1], 10), ''] : [Infinity, m[2]]);
  re.lastIndex = 0;
  while ((m = re.exec(b))) bx.push(m[1] ? [parseInt(m[1], 10), ''] : [Infinity, m[2]]);
  while (ax.length && bx.length) {
    const an = ax.shift(), bn = bx.shift();
    const diff = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (diff) return diff;
  }
  return ax.length - bx.length;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Step 1: parse Title_pictures/ directory listing, if the server provides one.
async function listTitlePictures() {
  const map = new Map(); // gameName -> image filename
  try {
    const res = await fetch('Title_pictures/', { cache: 'no-store' });
    if (!res.ok) return map;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const clean = decodeURIComponent(href.split('?')[0].split('#')[0]).replace(/\/$/, '');
      const filename = clean.split('/').pop();
      const m = filename && filename.match(/^(.+)\.([a-zA-Z0-9]+)$/);
      if (m && IMAGE_EXTS.includes(m[2].toLowerCase())) {
        map.set(m[1], filename);
      }
    });
  } catch (e) {
    // No autoindex available (file://, or a server that doesn't list directories) — ignored.
  }
  return map;
}

// Try each known image extension in turn (used when the listing above isn't available).
function probeTitleImage(name) {
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= IMAGE_EXTS.length) { resolve(null); return; }
      const ext = IMAGE_EXTS[i++];
      const img = new Image();
      img.onload = () => resolve(`${name}.${ext}`);
      img.onerror = tryNext;
      img.src = `Title_pictures/${name}.${ext}`;
    };
    tryNext();
  });
}

// Confirms "<name>/index.html" exists and extracts its <title>. Cached per name.
async function checkGame(name) {
  if (gameInfoCache.has(name)) return gameInfoCache.get(name);
  let info = null;
  try {
    const res = await fetch(`${name}/index.html`, { cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      info = { title: (m && m[1].trim()) || name };
    }
  } catch (e) {
    info = null;
  }
  gameInfoCache.set(name, info);
  return info;
}

async function discoverGames() {
  const candidates = new Map(); // name -> filename | undefined (unknown yet)

  for (const [name, filename] of await listTitlePictures()) {
    candidates.set(name, filename);
  }

  // Supplement with a bounded brute-force scan for the conventional GameN naming,
  // so newly added games still surface even without directory-listing support.
  let misses = 0;
  for (let n = 1; n <= 200 && misses < 8; n++) {
    const name = `Game${n}`;
    if (candidates.has(name)) { misses = 0; continue; }
    const info = await checkGame(name);
    if (info) {
      candidates.set(name, undefined);
      misses = 0;
    } else {
      misses++;
    }
  }

  const games = [];
  for (const name of candidates.keys()) {
    const info = await checkGame(name);
    if (!info) continue; // a stray title image with no matching game folder
    let filename = candidates.get(name);
    if (filename === undefined) filename = await probeTitleImage(name);
    games.push({
      name,
      title: info.title,
      image: filename ? `Title_pictures/${filename}` : null,
    });
  }

  games.sort((a, b) => naturalCompare(a.name, b.name));
  return games;
}

function renderSkeleton(count = 3) {
  galleryEl.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card skeleton">
      <div class="card-media"></div>
      <div class="card-title"></div>
    </div>
  `).join('');
  emptyStateEl.hidden = true;
}

function renderGames(games) {
  if (!games.length) {
    galleryEl.innerHTML = '';
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;
  galleryEl.innerHTML = games.map((game) => {
    const media = game.image
      ? `<img src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}" loading="lazy">`
      : `<div class="card-noimg">${escapeHtml(game.title)}</div>`;
    return `
      <button class="card" type="button" data-name="${escapeHtml(game.name)}" data-title="${escapeHtml(game.title)}">
        <span class="card-media">
          ${media}
          <span class="card-play"><span>&#9654;</span></span>
        </span>
        <span class="card-title">${escapeHtml(game.title)}</span>
      </button>
    `;
  }).join('');
}

function openPlayer(name, title) {
  playerTitleEl.textContent = title;
  playerFrameEl.title = title;
  playerFrameEl.src = `${name}/index.html`;
  playerEl.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closePlayer() {
  playerEl.hidden = true;
  playerFrameEl.src = 'about:blank';
  document.body.style.overflow = '';
}

galleryEl.addEventListener('click', (e) => {
  const card = e.target.closest('.card[data-name]');
  if (!card) return;
  openPlayer(card.dataset.name, card.dataset.title);
});

closePlayerBtn.addEventListener('click', closePlayer);
playerEl.addEventListener('click', (e) => {
  if (e.target === playerEl) closePlayer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !playerEl.hidden) closePlayer();
});

async function runScan() {
  rescanBtn.classList.add('busy');
  renderSkeleton();
  const games = await discoverGames();
  renderGames(games);
  rescanBtn.classList.remove('busy');
}

rescanBtn.addEventListener('click', runScan);

if (location.protocol === 'file:') {
  fileNoticeEl.hidden = false;
}

runScan();
