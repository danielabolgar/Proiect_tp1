
import './style.css'
import { Grid } from './Grid'
import { Piece } from './Piece'

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

// Streak
let streak = 0;
let streakMultiplier = 1;

// Score popups — cifre care sar pe ecran
interface ScorePopup { x: number; y: number; text: string; life: number; color: string; vy: number; }
let scorePopups: ScorePopup[] = [];
function addScorePopup(x: number, y: number, text: string, color = '#ffffff') {
  scorePopups.push({ x, y, text, life: 1.0, color, vy: -1.5 });
}

// Screen shake
let shakeIntensity = 0;
let shakeX = 0;
let shakeY = 0;
function triggerShake(intensity: number) { shakeIntensity = intensity; }

// Animație dispariție celulă cu celulă
interface ClearAnim { cells: { r: number; c: number }[]; timer: number; done: boolean; }
let clearAnim: ClearAnim | null = null;

// Mouse / touch
let mouseCanvasX = 0;
let mouseCanvasY = 0;
let ghostGridX: number | null = null;
let ghostGridY: number | null = null;
let snapValid = false;

const grid = new Grid(40);
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// ─── CAMPAIGN CUSTOM ──────────────────────────────────────────────────────────
interface CustomLevel {
  levelIndex: number;
  totalLevels: number;
  targetScore: number;
  timePerMove: number;
  complexityWeight: number;
  preFillCount: number;
  title: string;
  description: string;
}

let customLevels: CustomLevel[] = [];
let customTargetScore = 0;
let customTotalLevels = 0;

function generateCustomLevels(targetScore: number, totalLevels: number): CustomLevel[] {
  const levels: CustomLevel[] = [];
  const titles = [
    'SECTOR ZERO','GRID ONLINE','STATIC NOISE','INTERFERENCE','GRAVITY SHIFT',
    'PRESSURE WAVE','OVERLOAD','CRITICAL MASS','SYSTEM FAILURE','FINAL PROTOCOL',
    'DARK MATTER','VOID BREACH','SINGULARITY','EVENT HORIZON','FINAL PROTOCOL Ω'
  ];

  for (let i = 0; i < totalLevels; i++) {
    const progress = i / (totalLevels - 1 || 1); // 0 → 1

    // Target: distribuție exponențială — nivelele de la final au ținte mult mai mari
    const exp = Math.pow(progress, 1.5);
    const levelTarget = Math.round(targetScore * exp / 50) * 50 || Math.round(targetScore / totalLevels * (i + 1) / 50) * 50;

    // Timer: pornește de la 0 (fără timer) la nivel 1, ajunge la min 6s la final
    // Primele 20% din nivele nu au timer
    const timerStart = Math.floor(totalLevels * 0.2);
    let timePerMove = 0;
    if (i >= timerStart) {
      const timerProgress = (i - timerStart) / (totalLevels - timerStart);
      timePerMove = Math.round(35 - timerProgress * 29); // 35s → 6s
    }

    // Complexitate piese: 0.1 → 1.0
    const complexityWeight = Math.min(1.0, 0.1 + progress * 0.9);

    // preFill: 0 → ~25 celule la final, dar doar din jumătatea nivelelor
    const fillStart = Math.floor(totalLevels * 0.3);
    const preFillCount = i >= fillStart
      ? Math.round(((i - fillStart) / (totalLevels - fillStart)) * 25)
      : 0;

    const titleIndex = Math.min(i, titles.length - 1);
    const title = titles[titleIndex] || `NIVEL ${i + 1}`;

    let desc = '';
    if (timePerMove === 0) desc = 'Fără limită de timp';
    else if (preFillCount === 0) desc = `${timePerMove}s per mutare`;
    else desc = `${timePerMove}s • tablă parțial ocupată`;

    levels.push({
      levelIndex: i,
      totalLevels,
      targetScore: levelTarget,
      timePerMove,
      complexityWeight,
      preFillCount,
      title,
      description: desc,
    });
  }

  return levels;
}

function getCurrentCustomLevel(): CustomLevel {
  return customLevels[campaignLevel];
}

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

  <div id="screen-campaign-setup" class="overlay" style="display:none">
    <h1 style="font-size:1.3rem;letter-spacing:3px">🏆 CAMPAIGN</h1>
    <p class="hs-text" style="font-size:0.7rem;margin-bottom:8px">Setează-ți provocarea personală</p>
    <div class="setup-form">
      <div class="setup-field">
        <label>PUNCTAJ ȚINTĂ</label>
        <input type="number" id="input-target" value="10000" min="500" max="9999999" step="500"/>
      </div>
      <div class="setup-field">
        <label>NUMĂR NIVELE</label>
        <input type="number" id="input-levels" value="10" min="2" max="20" step="1"/>
      </div>
      <div id="setup-preview" class="setup-preview"></div>
    </div>
    <button id="btn-campaign-start">START CAMPAIGN ▶</button>
    <button id="btn-campaign-back" style="font-size:0.7rem;padding:8px 20px;opacity:0.6;margin-top:2px">ÎNAPOI</button>
  </div>

  <div id="screen-mode" class="overlay" style="display:none">
    <h1 class="glitch">SELECT MODE</h1>
    <div class="mode-cards">
      <div class="mode-card" id="btn-campaign">
        <div class="mode-icon">🏆</div>
        <div class="mode-title">CAMPAIGN</div>
        <div class="mode-desc">Tu alegi ținta și nivelele<br>Cronometru • Dificultate progresivă</div>
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
    <p id="win-subtitle" class="hs-text" style="color:#ffd700"></p>
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
  ['screen-menu','screen-mode','screen-tutorial','screen-campaign-setup','screen-hud','screen-level','screen-win','screen-over']
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
    const lvl = getCurrentCustomLevel();
    const titanChance = lvl.levelIndex >= 2 ? 0.3 : 0.2;
    return new Piece(titanChance, lvl.complexityWeight);
  }
  return new Piece(0.15, 0.15);
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function getTimeLimit(): number {
  if (gameMode === 'endless') return 0;
  return getCurrentCustomLevel().timePerMove;
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
    const lvl = getCurrentCustomLevel();
    document.getElementById('hud-nivel')!.innerText = `${campaignLevel + 1}/${lvl.totalLevels}`;
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
  const lvl = getCurrentCustomLevel();
  document.getElementById('lc-text')!.innerText = `Nivel ${campaignLevel + 1}/${lvl.totalLevels} completat!`;
  document.getElementById('lc-score')!.innerText = `Scorul tău: ${scor} pts`;
  document.getElementById('lc-hs')!.innerText = `Best Campaign: ${highScoreCampaign} pts`;
  sounds.levelUp();
  showOnly('screen-level');
}

function showLevelTitle(title: string) {
  levelTransition = { title, alpha: 1.0, timer: 120 };
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
  if (levelTransition.timer <= 30) levelTransition.alpha = levelTransition.timer / 30;
  if (levelTransition.timer <= 0) { levelTransition = null; return; }

  const lvl = getCurrentCustomLevel();
  ctx.save();
  ctx.globalAlpha = levelTransition.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);

  // Număr nivel
  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,255,255,0.6)';
  ctx.shadowBlur = 0;
  ctx.fillText(`NIVEL ${campaignLevel + 1} / ${lvl.totalLevels}`, canvas.width / 2, canvas.height / 2 - 28);

  // Titlu mare
  ctx.font = 'bold 26px Orbitron, sans-serif';
  ctx.shadowBlur = 30; ctx.shadowColor = '#00ffff';
  ctx.fillStyle = '#00ffff';
  ctx.fillText(levelTransition.title, canvas.width / 2, canvas.height / 2 + 2);

  // Descriere + timer info
  ctx.font = '11px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(224,230,237,0.8)';
  ctx.shadowBlur = 0;
  ctx.fillText(lvl.description, canvas.width / 2, canvas.height / 2 + 24);

  // Dificultate vizuală — bare
  const barW = 120; const barH = 5;
  const barX = canvas.width / 2 - barW / 2;
  const barY = canvas.height / 2 + 40;
  const diffProgress = (campaignLevel + 1) / lvl.totalLevels;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = diffProgress > 0.7 ? '#ff3333' : diffProgress > 0.4 ? '#ffd700' : '#00ffff';
  ctx.fillRect(barX, barY, barW * diffProgress, barH);
  ctx.fillStyle = 'rgba(224,230,237,0.5)';
  ctx.font = '9px Orbitron, sans-serif';
  ctx.fillText('DIFICULTATE', canvas.width / 2, barY + 16);

  ctx.restore();
}

function triggerYouWin() {
  stopMoveTimer();
  saveHS();
  screen = 'you_win';
  winParticlesActive = true;
  const lvl = getCurrentCustomLevel();
  document.getElementById('win-subtitle')!.innerText = `Ai completat toate cele ${lvl.totalLevels} nivele!`;
  document.getElementById('win-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('win-hs')!.innerText = 'BEST CAMPAIGN: ' + highScoreCampaign;
  showOnly('screen-win');
}

// ─── LOGICĂ MUTARE ────────────────────────────────────────────────────────────
function handleMoveLogic() {
  mutariEfectuate++;
  const result = grid.clearLines();

  if (result.totalCleared > 0) {
    // Streak
    streak++;
    streakMultiplier = Math.min(4, 1 + Math.floor(streak / 2));
    const bonusStreak = streak >= 3 ? Math.floor(result.points * (streakMultiplier - 1)) : 0;
    const totalPoints = result.points + bonusStreak;

    // Animație celulă cu celulă
    clearAnim = {
      cells: result.clearedCoords.sort((a,b) => a.c - b.c || a.r - b.r),
      timer: 0,
      done: false
    };

    // Explozie particule
    result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color, 8));

    // Score popup mare în centrul tablei
    const popupColor = result.totalCleared >= 3 ? '#ffd700' : result.totalCleared >= 2 ? '#00ffff' : '#ffffff';
    addScorePopup(canvas.width / 2, 180, `+${totalPoints}`, popupColor);
    if (bonusStreak > 0) addScorePopup(canvas.width / 2, 210, `🔥 x${streakMultiplier} STREAK!`, '#ff8c00');

    // Combo text + shake
    if (result.totalCleared >= 3) {
      sounds.combo();
      triggerShake(8);
      comboFlash = { text: `${result.totalCleared}× COMBO!`, alpha: 1.0, timer: 90, color: '#ffd700' };
    } else if (result.totalCleared >= 2) {
      sounds.combo();
      triggerShake(4);
      comboFlash = { text: `DOUBLE CLEAR!`, alpha: 1.0, timer: 75, color: '#00ffff' };
    } else {
      sounds.clear();
      triggerShake(2);
    }

    scor += totalPoints;
  } else {
    // Fără linie — reset streak
    streak = 0;
    streakMultiplier = 1;
    sounds.place();
    addScorePopup(
      (ghostGridX ?? 5) * grid.cellSize + grid.cellSize,
      (ghostGridY ?? 5) * grid.cellSize,
      '+10',
      'rgba(255,255,255,0.5)'
    );
    scor += 10;
  }

  const geom = grid.checkGeometryBonus();
  if (geom > 0) {
    scor += geom;
    triggerShake(10);
    addScorePopup(canvas.width / 2, 150, `+${geom} GEOMETRY!`, '#ff00ff');
    comboFlash = { text: `⬛ GEOMETRY BONUS!`, alpha: 1.0, timer: 90, color: '#ff00ff' };
  }

  const pragGrav = (gameMode === 'campaign' && campaignLevel >= 4) ? 3 : 4;
  if (mutariEfectuate % pragGrav === 0) grid.applyGravity();

  if (gameMode === 'campaign') {
    const lvl = getCurrentCustomLevel();
    if (scor >= lvl.targetScore) {
      if (campaignLevel >= customLevels.length - 1) {
        triggerYouWin(); return;
      } else {
        triggerLevelComplete(); return;
      }
    }
  }

  if (gameMode === 'endless') {
    if (!grid.poate_plasa_orice(pieseDisponibile)) {
      for (let c = 0; c < grid.size; c++) grid.cells[grid.size - 1][c] = 0;
      streak = 0;
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

document.getElementById('btn-campaign')!.addEventListener('click', () => {
  showOnly('screen-campaign-setup');
  updateSetupPreview();
});
document.getElementById('btn-endless')!.addEventListener('click',  () => startGame('endless'));

document.getElementById('btn-campaign-back')!.addEventListener('click', () => showOnly('screen-mode'));

function updateSetupPreview() {
  const targetInput = document.getElementById('input-target') as HTMLInputElement;
  const levelsInput = document.getElementById('input-levels') as HTMLInputElement;
  const preview = document.getElementById('setup-preview')!;
  const target = Math.max(500, Number(targetInput.value) || 10000);
  const levels = Math.min(20, Math.max(2, Number(levelsInput.value) || 10));
  const previewLevels = generateCustomLevels(target, levels);
  const first = previewLevels[0];
  const mid = previewLevels[Math.floor(levels / 2)];
  const last = previewLevels[levels - 1];
  preview.innerHTML = `
    <div class="preview-row"><span>Nivel 1</span><span>${first.targetScore} pts • fără timer</span></div>
    <div class="preview-row"><span>Nivel ${Math.floor(levels/2)+1}</span><span>${mid.targetScore} pts • ${mid.timePerMove > 0 ? mid.timePerMove+'s/mutare' : 'fără timer'}</span></div>
    <div class="preview-row"><span>Nivel ${levels} (final)</span><span>${last.targetScore} pts • ${last.timePerMove}s/mutare</span></div>
  `;
}

document.getElementById('input-target')!.addEventListener('input', updateSetupPreview);
document.getElementById('input-levels')!.addEventListener('input', updateSetupPreview);

document.getElementById('btn-campaign-start')!.addEventListener('click', () => {
  const targetInput = document.getElementById('input-target') as HTMLInputElement;
  const levelsInput = document.getElementById('input-levels') as HTMLInputElement;
  customTargetScore = Math.max(500, Number(targetInput.value) || 10000);
  customTotalLevels = Math.min(20, Math.max(2, Number(levelsInput.value) || 10));
  customLevels = generateCustomLevels(customTargetScore, customTotalLevels);
  startGame('campaign');
});

document.getElementById('btn-next')!.addEventListener('click', () => {
  if (campaignLevel >= customLevels.length - 1) {
    triggerYouWin();
    return;
  }
  campaignLevel++;
  streak = 0; streakMultiplier = 1;
  grid.reset();
  const lvl = getCurrentCustomLevel();
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
  streak = 0; streakMultiplier = 1;
  particles = []; scorePopups = [];
  winParticlesActive = false;
  levelTransition = null;
  comboFlash = null;
  clearAnim = null;
  grid.reset();
  if (mode === 'campaign') {
    const lvl = getCurrentCustomLevel();
    if (lvl.preFillCount > 0) grid.preFill(lvl.preFillCount);
  }
  pieseDisponibile = [makePiece(), makePiece(), makePiece()];
  screen = 'playing';
  showOnly('screen-hud');
  updateHUD();
  startMoveTimer();
  if (mode === 'campaign') showLevelTitle(getCurrentCustomLevel().title);
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

function drawScorePopups() {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i];
    p.y += p.vy;
    p.life -= 0.018;
    if (p.life <= 0) { scorePopups.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.font = `bold ${p.text.startsWith('+1') ? 16 : 24}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

function drawStreak() {
  if (streak < 2) return;
  const flames = '🔥'.repeat(Math.min(streak, 5));
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = 'bold 13px Orbitron, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff8c00';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ff8c00';
  ctx.fillText(`${flames} ×${streakMultiplier}`, canvas.width - 6, 18);
  ctx.restore();
}

function gameLoop() {
  // Screen shake
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.75;
  } else {
    shakeX = 0; shakeY = 0; shakeIntensity = 0;
  }

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

  ctx.save();
  ctx.translate(shakeX, shakeY);

  updateParticles();
  drawParticles();

  if (screen === 'playing') {
    grid.draw(ctx);

    // Animație dispariție celulă cu celulă
    if (clearAnim && !clearAnim.done) {
      clearAnim.timer += 0.05;
      grid.drawClearAnim(ctx, clearAnim.cells, clearAnim.timer);
      if (clearAnim.timer >= 1.5) clearAnim = null;
    }

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

    drawScorePopups();
    drawStreak();
    drawComboFlash();
    drawLevelTransition();
  }

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

gameLoop();