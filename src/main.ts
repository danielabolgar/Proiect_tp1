import './style.css'
import { Grid } from './Grid'
import { Piece } from './Piece'
import { CAMPAIGN_LEVELS } from './constants'

const app = document.querySelector<HTMLDivElement>('#app')!;

// ─── TIPURI ───────────────────────────────────────────────────────────────────
type GameMode = 'campaign' | 'endless';
type GameScreen = 'menu' | 'mode_select' | 'tutorial' | 'playing' | 'level_complete' | 'you_win' | 'game_over';

// ─── STATE ────────────────────────────────────────────────────────────────────
let gameMode: GameMode = 'endless';
let screen: GameScreen = 'menu';

let scor = 0;
let campaignLevel = 0;
let mutariEfectuate = 0;

// High score separat per mod
let highScoreCampaign = Number(localStorage.getItem('zenblocks_hs_campaign')) || 0;
let highScoreEndless   = Number(localStorage.getItem('zenblocks_hs_endless'))  || 0;
function getHS(): number {
  return gameMode === 'campaign' ? highScoreCampaign : highScoreEndless;
}
function saveHS() {
  if (scor <= getHS()) return;
  if (gameMode === 'campaign') { highScoreCampaign = scor; localStorage.setItem('zenblocks_hs_campaign', scor.toString()); }
  else                         { highScoreEndless = scor;  localStorage.setItem('zenblocks_hs_endless',  scor.toString()); }
  document.getElementById('menuHS')!.innerText = getBestHS().toString();
}
function getBestHS(): number { return Math.max(highScoreCampaign, highScoreEndless); }

// Piese
let pieseDisponibile: Piece[] = [];
let piesaSelectata: Piece | null = null;
let piesaInMana = false;
let offsetX = 0;
let offsetY = 0;

// Timer
let moveTimeLeft = 0;
let moveTimerInterval: number | null = null;
let timerWarning = false;

// Particule
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size?: number; }
let particles: Particle[] = [];

// Tranziție nivel
let levelTransition: { title: string; alpha: number; timer: number } | null = null;
let winParticlesActive = false;

// Combo flash
let comboFlash: { text: string; alpha: number; timer: number; color: string } | null = null;

// Mouse / touch
let mouseCanvasX = 0;
let mouseCanvasY = 0;
let ghostGridX: number | null = null;
let ghostGridY: number | null = null;
let snapValid = false;

const grid = new Grid(40);
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// ─── SUNET ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, type: OscillatorType, duration: number, vol = 0.18, attack = 0.01) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ac.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch {}
}

const sounds = {
  place:    () => gameMode === 'endless'
    ? playTone(440 * Math.pow(2, [0,2,4,7,9][Math.floor(Math.random()*5)]/12), 'sine', 0.4, 0.1, 0.02)
    : playTone(320, 'sine', 0.12, 0.14),
  clear:    () => { playTone(520, 'sine', 0.25, 0.22); playTone(780, 'sine', 0.25, 0.16, 0.05); },
  combo:    () => { playTone(660, 'sine', 0.35, 0.25); playTone(990, 'triangle', 0.35, 0.18, 0.08); playTone(1320, 'sine', 0.4, 0.14, 0.15); },
  gameOver: () => { playTone(220, 'sawtooth', 0.6, 0.3); playTone(110, 'sawtooth', 0.8, 0.25, 0.1); },
  levelUp:  () => { playTone(440, 'sine', 0.2, 0.2); playTone(660, 'sine', 0.25, 0.18, 0.1); playTone(880, 'sine', 0.35, 0.15, 0.2); },
};

// ─── HTML ─────────────────────────────────────────────────────────────────────
app.innerHTML = `
<div class="game-container">

  <div id="screen-menu" class="overlay">
    <h1 class="glitch">ZenBlocks</h1>
    <p class="hs-text">BEST SCORE: <span id="menuHS">${getBestHS()}</span></p>
    <button id="btn-play">INITIALIZE SYSTEM</button>
    <button id="btn-tutorial" style="font-size:0.7rem;padding:8px 20px;margin-top:4px;opacity:0.7">? CUM SE JOACĂ</button>
  </div>

  <div id="screen-tutorial" class="overlay" style="display:none">
    <h1 style="font-size:1.2rem;letter-spacing:3px">CUM SE JOACĂ</h1>
    <div class="tutorial-grid">
      <div class="tut-item"><span class="tut-icon">🧩</span><div><b>Trage piesele</b> pe tablă. Completează rânduri sau coloane întregi pentru a câștiga puncte.</div></div>
      <div class="tut-item"><span class="tut-icon">💥</span><div><b>Combo</b> — completezi 2+ linii deodată? Punctele se dublează și primești un bonus.</div></div>
      <div class="tut-item"><span class="tut-icon">🔮</span><div><b>Titan</b> — celulele violet (⊙) sunt speciale: nu dispar la prima curățare, ci devin normale. +50 pts bonus.</div></div>
      <div class="tut-item"><span class="tut-icon">⬛</span><div><b>Geometry Bonus</b> — formezi un pătrat 3×3 complet pe tablă? +500 pts instant.</div></div>
      <div class="tut-item"><span class="tut-icon">🌊</span><div><b>Gravitație</b> — din nivel 5, la fiecare 3 mutări piesele de pe tablă cad în jos.</div></div>
      <div class="tut-item"><span class="tut-icon">⏱</span><div><b>Timer</b> — în Campaign ai X secunde per mutare. Dacă expiră, jocul se termină.</div></div>
    </div>
    <button id="btn-tutorial-back">ÎNAPOI</button>
  </div>

  <div id="screen-mode" class="overlay" style="display:none">
    <h1 class="glitch">SELECT MODE</h1>
    <div class="mode-cards">
      <div class="mode-card" id="btn-campaign">
        <div class="mode-icon">🏆</div>
        <div class="mode-title">CAMPAIGN</div>
        <div class="mode-desc">10 nivele cu obiective<br>Cronometru per mutare</div>
      </div>
      <div class="mode-card" id="btn-endless">
        <div class="mode-icon">∞</div>
        <div class="mode-title">ENDLESS</div>
        <div class="mode-desc">Fără timer, fără game over<br>Joacă cât vrei • Scor la infinit</div>
      </div>
    </div>
  </div>

  <div id="screen-hud" style="display:none">
    <div class="hud-top">
      <span class="hud-label">SCOR <span id="hud-scor">0</span></span>
      <span class="hud-label" id="hud-nivel-wrap">NIVEL <span id="hud-nivel">1</span></span>
      <span class="hud-label" id="hud-target-wrap">TARGET <span id="hud-target">500</span></span>
      <span class="hud-label" id="hud-hs-wrap">BEST <span id="hud-hs">0</span></span>
    </div>
    <div id="timer-wrap" style="display:none">
      <div id="timer-bar-bg"><div id="timer-bar"></div></div>
      <span id="timer-text">30s</span>
    </div>
  </div>

  <div class="canvas-wrapper" id="canvas-wrap" style="display:none">
    <canvas id="gameCanvas" width="400" height="530"></canvas>
  </div>

  <div id="screen-level" class="overlay" style="display:none">
    <h1 style="color:#00ffff">LEVEL COMPLETE</h1>
    <p id="lc-text" class="hs-text"></p>
    <p id="lc-score" class="hs-text"></p>
    <p id="lc-hs" class="hs-text"></p>
    <button id="btn-next">NEXT LEVEL ▶</button>
  </div>

  <div id="screen-win" class="overlay" style="display:none">
    <h1 class="glitch" style="color:#ffd700;text-shadow:0 0 20px #ffd700">YOU WIN</h1>
    <p class="hs-text" style="color:#ffd700">Ai completat toate cele 10 nivele!</p>
    <p id="win-score" class="hs-text"></p>
    <p id="win-hs" class="hs-text"></p>
    <button id="btn-win-restart">PLAY AGAIN</button>
  </div>

  <div id="screen-over" class="overlay" style="display:none">
    <h1 class="glitch" style="color:#ff00ff">GAME OVER</h1>
    <p id="over-reason" class="hs-text" style="font-size:0.75rem;max-width:280px;text-align:center;line-height:1.6"></p>
    <p id="over-score" class="hs-text"></p>
    <p id="over-hs" class="hs-text"></p>
    <p id="over-new-hs" class="hs-text" style="color:#ffd700;display:none">🏆 NOU HIGH SCORE!</p>
    <button id="btn-over-restart">REBOOT SYSTEM</button>
  </div>

</div>
`;

// ─── REFS ─────────────────────────────────────────────────────────────────────
canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
ctx = canvas.getContext('2d')!;

// ─── HELPERS OVERLAY ──────────────────────────────────────────────────────────
function showOnly(id: string) {
  ['screen-menu','screen-mode','screen-tutorial','screen-hud','screen-level','screen-win','screen-over']
    .forEach(s => {
      const el = document.getElementById(s)!;
      el.style.display = s === id ? (s === 'screen-hud' ? 'block' : 'flex') : 'none';
    });
  const cw = document.getElementById('canvas-wrap')!;
  cw.style.display = (id === 'screen-hud') ? 'inline-block' : 'none';
}

// ─── PARTICULE ────────────────────────────────────────────────────────────────
function createExplosion(x: number, y: number, color: string, count = 12) {
  for (let i = 0; i < count; i++) {
    particles.push({ 
      x: x + 20, 
      y: y + 20, 
      vx: (Math.random() - 0.5) * 14, 
      vy: (Math.random() - 0.5) * 14, 
      life: 1.0, 
      color 
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= 0.025;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.shadowBlur = 15; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    const sz = p.size || 3;
    ctx.fillRect(p.x, p.y, sz, sz);
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ─── HELPER PIESE ─────────────────────────────────────────────────────────────
function makePiece(): Piece {
  if (gameMode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[campaignLevel];
    const titanChance = campaignLevel >= 2 ? 0.3 : 0.2;
    return new Piece(titanChance, lvl.complexityWeight);
  }
  return new Piece(0.15, 0.15); // endless: mai relaxat, titan rar
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function getTimeLimit(): number {
  if (gameMode === 'endless') return 0;
  return CAMPAIGN_LEVELS[campaignLevel].timePerMove;
}

function startMoveTimer() {
  stopMoveTimer();
  const limit = getTimeLimit();
  if (limit === 0) {
    document.getElementById('timer-wrap')!.style.display = 'none';
    return;
  }
  moveTimeLeft = limit;
  timerWarning = false;
  document.getElementById('timer-wrap')!.style.display = 'flex';
  updateTimerUI();

  moveTimerInterval = window.setInterval(() => {
    moveTimeLeft--;
    timerWarning = moveTimeLeft <= 5;
    updateTimerUI();
    if (moveTimeLeft <= 0) {
      stopMoveTimer();
      triggerGameOver('Timp expirat! Ai rămas fără timp pentru o mutare.');
    }
  }, 1000);
}

function stopMoveTimer() {
  if (moveTimerInterval !== null) { clearInterval(moveTimerInterval); moveTimerInterval = null; }
}

// ─── UI HUD ───────────────────────────────────────────────────────────────────
function updateTimerUI() {
  const limit = getTimeLimit();
  const pct = limit > 0 ? (moveTimeLeft / limit) * 100 : 100;
  const bar = document.getElementById('timer-bar')!;
  const txt = document.getElementById('timer-text')!;
  bar.style.width = pct + '%';
  bar.style.background = timerWarning ? '#ff3333' : '#00ffff';
  txt.innerText = moveTimeLeft + 's';
  txt.style.color = timerWarning ? '#ff3333' : '#00ffff';
}

function updateHUD() {
  document.getElementById('hud-scor')!.innerText = scor.toString();
  document.getElementById('hud-hs')!.innerText = getHS().toString();
  if (gameMode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[campaignLevel];
    document.getElementById('hud-nivel')!.innerText = (campaignLevel + 1).toString();
    document.getElementById('hud-target')!.innerText = lvl.targetScore.toString();
    document.getElementById('hud-nivel-wrap')!.style.display = '';
    document.getElementById('hud-target-wrap')!.style.display = '';
    document.getElementById('hud-hs-wrap')!.style.display = '';
  } else {
    document.getElementById('hud-nivel-wrap')!.style.display = 'none';
    document.getElementById('hud-target-wrap')!.style.display = 'none';
    document.getElementById('hud-hs-wrap')!.style.display = '';
  }
}

// ─── GAME OVER / WIN ──────────────────────────────────────────────────────────
function triggerGameOver(reason: string) {
  stopMoveTimer();
  const wasHS = scor > getHS();
  saveHS();
  screen = 'game_over';

  // Explică clar motivul
  const reasonEl = document.getElementById('over-reason')!;
  if (reason.includes('timp')) {
    reasonEl.innerHTML = '⏱ Timpul a expirat.<br>Data viitoare mișcă-te mai repede!';
  } else {
    reasonEl.innerHTML = '🧩 Nu mai există loc pentru nicio piesă.<br>Tabla s-a blocat complet.';
  }
  document.getElementById('over-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('over-hs')!.innerText = 'BEST ' + gameMode.toUpperCase() + ': ' + getHS();
  const newHsEl = document.getElementById('over-new-hs')!;
  newHsEl.style.display = wasHS ? 'block' : 'none';

  sounds.gameOver();
  showOnly('screen-over');
}

function triggerLevelComplete() {
  stopMoveTimer();
  saveHS();
  screen = 'level_complete';
  const lvl = CAMPAIGN_LEVELS[campaignLevel];
  document.getElementById('lc-text')!.innerText = `Nivel ${campaignLevel + 1} completat! Obiectiv: ${lvl.targetScore} pts`;
  document.getElementById('lc-score')!.innerText = `Scorul tău: ${scor} pts`;
  document.getElementById('lc-hs')!.innerText = `Best Campaign: ${highScoreCampaign} pts`;
  sounds.levelUp();
  showOnly('screen-level');
}

function showLevelTitle(title: string) {
  levelTransition = { title, alpha: 1.0, timer: 120 }; // ~2s la 60fps
}

function spawnWinParticles() {
  const colors = ['#ffd700', '#fff700', '#ffaa00', '#ffffff', '#ffe680'];
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10,
      vx: (Math.random() - 0.5) * 3,
      vy: 1.5 + Math.random() * 3,
      life: 1.0,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 5,
    });
  }
}

function drawLevelTransition() {
  if (!levelTransition) return;
  levelTransition.timer--;
  if (levelTransition.timer <= 30) {
    levelTransition.alpha = levelTransition.timer / 30;
  }
  if (levelTransition.timer <= 0) { levelTransition = null; return; }

  ctx.save();
  ctx.globalAlpha = levelTransition.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, canvas.height / 2 - 50, canvas.width, 100);
  
  ctx.font = 'bold 26px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 30;
  ctx.shadowColor = '#00ffff';
  ctx.fillStyle = '#00ffff';
  ctx.fillText(levelTransition.title, canvas.width / 2, canvas.height / 2 - 8);
  
  ctx.font = '11px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(224,230,237,0.8)';
  ctx.shadowBlur = 0;
  const lvl = CAMPAIGN_LEVELS[campaignLevel];
  ctx.fillText(lvl.description, canvas.width / 2, canvas.height / 2 + 18);
  ctx.restore();
}

function triggerYouWin() {
  stopMoveTimer();
  saveHS();
  screen = 'you_win';
  winParticlesActive = true;
  document.getElementById('win-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('win-hs')!.innerText = 'BEST CAMPAIGN: ' + highScoreCampaign;
  showOnly('screen-win');
}

// ─── LOGICĂ MUTARE ────────────────────────────────────────────────────────────
function handleMoveLogic() {
  mutariEfectuate++;
  const result = grid.clearLines();
  if (result.destroyedCells.length > 0) {
    result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color));
    if (result.totalCleared >= 3) {
      sounds.combo();
      comboFlash = { text: `${result.totalCleared}× COMBO! +${result.points}`, alpha: 1.0, timer: 90, color: '#ffd700' };
    } else if (result.totalCleared >= 2) {
      sounds.combo();
      comboFlash = { text: `DOUBLE CLEAR! +${result.points}`, alpha: 1.0, timer: 75, color: '#00ffff' };
    } else {
      sounds.clear();
    }
  } else {
    sounds.place();
  }

  scor += result.points;
  const geom = grid.checkGeometryBonus();
  if (geom > 0) {
    scor += geom;
    comboFlash = { text: `⬛ GEOMETRY BONUS! +${geom}`, alpha: 1.0, timer: 90, color: '#ff00ff' };
  }

  const pragGrav = (gameMode === 'campaign' && campaignLevel >= 4) ? 3 : 4;
  if (mutariEfectuate % pragGrav === 0) grid.applyGravity();

  if (gameMode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[campaignLevel];
    if (scor >= lvl.targetScore) {
      if (campaignLevel >= CAMPAIGN_LEVELS.length - 1) {
        triggerYouWin(); return;
      } else {
        triggerLevelComplete(); return;
      }
    }
  }

  // Endless: niciodată game over — dacă e blocat, șterge rândul de jos
  if (gameMode === 'endless') {
    if (!grid.poate_plasa_orice(pieseDisponibile)) {
      for (let c = 0; c < grid.size; c++) grid.cells[grid.size - 1][c] = 0;
      comboFlash = { text: '∞ RESET — continuă!', alpha: 1.0, timer: 60, color: '#4CAF50' };
    }
    updateHUD();
    return;
  }

  if (!grid.poate_plasa_orice(pieseDisponibile)) {
    triggerGameOver('Nu mai există mutări posibile.');
    return;
  }

  updateHUD();
  startMoveTimer();
}

// ─── INTERACȚIUNE ─────────────────────────────────────────────────────────────
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (screen !== 'playing') return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const CELL_PREV = 28; 
  pieseDisponibile.forEach(piece => {
    const pw = piece.shape[0].length * CELL_PREV;
    const ph = piece.shape.length * CELL_PREV;
    const hitPad = 16;
    if (mouseX >= piece.x - hitPad && mouseX <= piece.x + pw + hitPad &&
        mouseY >= piece.y - hitPad && mouseY <= piece.y + ph + hitPad) {
      piesaSelectata = piece;
      piesaInMana = true;
      offsetX = mouseX - piece.x;
      offsetY = mouseY - piece.y;
      piesaSelectata.x = mouseX - offsetX;
      piesaSelectata.y = mouseY - offsetY;
      ghostGridX = null;
      ghostGridY = null;
    }
  });
});

window.addEventListener('pointermove', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  mouseCanvasX = e.clientX - rect.left;
  mouseCanvasY = e.clientY - rect.top;

  if (!piesaInMana || !piesaSelectata || screen !== 'playing') return;

  piesaSelectata.x = mouseCanvasX - offsetX;
  piesaSelectata.y = mouseCanvasY - offsetY;

  const pw = piesaSelectata.shape[0].length;
  const ph = piesaSelectata.shape.length;
  const cX = piesaSelectata.x + (pw * grid.cellSize) / 2;
  const cY = piesaSelectata.y + (ph * grid.cellSize) / 2;
  
  ghostGridX = Math.round((cX - (pw * grid.cellSize) / 2) / grid.cellSize);
  ghostGridY = Math.round((cY - (ph * grid.cellSize) / 2) / grid.cellSize);
  snapValid = grid.verifica_validitate(piesaSelectata.shape, ghostGridX, ghostGridY);
});

window.addEventListener('pointerup', () => {
  if (!piesaInMana || !piesaSelectata || screen !== 'playing') return;

  if (ghostGridX !== null && ghostGridY !== null &&
      grid.verifica_validitate(piesaSelectata.shape, ghostGridX, ghostGridY)) {
    grid.plaseaza_piesa(piesaSelectata.shape, ghostGridX, ghostGridY);
    sounds.place();
    const index = pieseDisponibile.indexOf(piesaSelectata);
    if (index !== -1) {
      pieseDisponibile[index] = makePiece();
    }
    scor += 10;
    
    piesaSelectata = null;
    piesaInMana = false;
    handleMoveLogic();
  } else {
    piesaSelectata = null;
    piesaInMana = false;
  }

  ghostGridX = null;
  ghostGridY = null;
  snapValid = false;
});

// ─── NAVIGARE BUTOANE ─────────────────────────────────────────────────────────
document.getElementById('btn-play')!.addEventListener('click', () => {
  showOnly('screen-mode');
});

document.getElementById('btn-tutorial')!.addEventListener('click', () => showOnly('screen-tutorial'));
document.getElementById('btn-tutorial-back')!.addEventListener('click', () => showOnly('screen-menu'));

document.getElementById('btn-campaign')!.addEventListener('click', () => startGame('campaign'));
document.getElementById('btn-endless')!.addEventListener('click',  () => startGame('endless'));

document.getElementById('btn-next')!.addEventListener('click', () => {
  if (campaignLevel >= CAMPAIGN_LEVELS.length - 1) {
    triggerYouWin();
    return;
  }
  campaignLevel++;
  grid.reset();
  const lvl = CAMPAIGN_LEVELS[campaignLevel];
  if (lvl.preFillCount > 0) grid.preFill(lvl.preFillCount);
  pieseDisponibile = [makePiece(), makePiece(), makePiece()];
  screen = 'playing';
  showOnly('screen-hud');
  updateHUD();
  startMoveTimer();
  showLevelTitle(lvl.title);
});

document.getElementById('btn-win-restart')!.addEventListener('click', () => {
  showOnly('screen-menu');
});

document.getElementById('btn-over-restart')!.addEventListener('click', () => {
  showOnly('screen-menu');
});

// ─── START JOC ────────────────────────────────────────────────────────────────
function startGame(mode: GameMode) {
  gameMode = mode;
  scor = 0;
  campaignLevel = 0;
  mutariEfectuate = 0;
  particles = [];
  winParticlesActive = false;
  levelTransition = null;
  comboFlash = null;
  grid.reset();
  if (mode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[0];
    if (lvl.preFillCount > 0) grid.preFill(lvl.preFillCount);
  }
  pieseDisponibile = [makePiece(), makePiece(), makePiece()];
  screen = 'playing';
  showOnly('screen-hud');
  updateHUD();
  startMoveTimer();
  if (mode === 'campaign') showLevelTitle(CAMPAIGN_LEVELS[0].title);
}

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────
function drawGhostPreview() {
  if (!piesaSelectata || ghostGridX === null || ghostGridY === null) return;

  const color = snapValid ? 'rgba(0,255,255,0.25)' : 'rgba(255,50,50,0.18)';
  const borderColor = snapValid ? 'rgba(0,255,255,0.7)' : 'rgba(255,50,50,0.6)';

  ctx.fillStyle = color;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;

  for (let r = 0; r < piesaSelectata.shape.length; r++) {
    for (let c = 0; c < piesaSelectata.shape[r].length; c++) {
      if (piesaSelectata.shape[r][c] !== 0) {
        const x = (ghostGridX + c) * grid.cellSize;
        const y = (ghostGridY + r) * grid.cellSize;
        if (ghostGridX + c >= 0 && ghostGridX + c < grid.size &&
            ghostGridY + r >= 0 && ghostGridY + r < grid.size) {
          ctx.fillRect(x + 2, y + 2, grid.cellSize - 4, grid.cellSize - 4);
          ctx.strokeRect(x + 2, y + 2, grid.cellSize - 4, grid.cellSize - 4);
        }
      }
    }
  }
}

function drawComboFlash() {
  if (!comboFlash) return;
  comboFlash.timer--;
  if (comboFlash.timer <= 20) comboFlash.alpha = comboFlash.timer / 20;
  if (comboFlash.timer <= 0) { comboFlash = null; return; }

  const progress = 1 - comboFlash.timer / 90;
  const y = 200 - progress * 40; // se ridică ușor

  ctx.save();
  ctx.globalAlpha = comboFlash.alpha;
  ctx.font = 'bold 22px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 25;
  ctx.shadowColor = comboFlash.color;
  ctx.fillStyle = comboFlash.color;
  ctx.fillText(comboFlash.text, canvas.width / 2, y);
  ctx.restore();
}

function gameLoop() {
  ctx.fillStyle = '#020204';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (winParticlesActive) {
    spawnWinParticles();
    particles.forEach(p => {
      ctx.globalAlpha = p.life * 0.85;
      ctx.shadowBlur = 10; ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      const sz = (p as any).size || 3;
      ctx.fillRect(p.x, p.y, sz, sz);
      p.x += p.vx; p.y += p.vy; p.life -= 0.008;
    });
    particles = particles.filter(p => p.life > 0);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    requestAnimationFrame(gameLoop);
    return;
  }

  updateParticles();
  drawParticles();

  if (screen === 'playing') {
    grid.draw(ctx);
    if (piesaInMana) drawGhostPreview();

    const timp = Date.now() * 0.003;
    const PIESE_Y_BASE = 450;
    pieseDisponibile.forEach((piece, index) => {
      if (piece !== piesaSelectata) {
        piece.x = 20 + index * 130;
        piece.y = PIESE_Y_BASE + Math.sin(timp + index) * 4;
      } else {
        ctx.shadowBlur = 30;
        ctx.shadowColor = piece.isTitan ? "#ff00ff" : "#00ffff";
      }
      piece.draw(ctx, 28, piece.x, piece.y);
      ctx.shadowBlur = 0;
    });

    if (piesaInMana && piesaSelectata && ghostGridX !== null && ghostGridY !== null) {
      const indicatorX = piesaSelectata.x + piesaSelectata.shape[0].length * grid.cellSize / 2;
      const indicatorY = piesaSelectata.y - 14;
      if (indicatorY > 0) {
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = snapValid ? '#00ffff' : '#ff3333';
        ctx.shadowBlur = 8; ctx.shadowColor = snapValid ? '#00ffff' : '#ff3333';
        ctx.fillText(snapValid ? '✓ OK' : '✗', indicatorX, indicatorY);
        ctx.shadowBlur = 0;
      }
    }

    ctx.strokeStyle = "rgba(0,255,255,0.15)";
    ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(10, 415); ctx.lineTo(390, 415); ctx.stroke();
    ctx.setLineDash([]);

    drawComboFlash();
    drawLevelTransition();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();