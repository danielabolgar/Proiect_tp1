
import './style.css'
import { Grid } from './Grid'
import { Piece } from './Piece'
import { CAMPAIGN_LEVELS } from './constants'

const app = document.querySelector<HTMLDivElement>('#app')!;

// ─── TIPURI ───────────────────────────────────────────────────────────────────
type GameMode = 'campaign' | 'endless';
type GameScreen = 'menu' | 'mode_select' | 'playing' | 'level_complete' | 'you_win' | 'game_over';

// ─── STATE ────────────────────────────────────────────────────────────────────
let gameMode: GameMode = 'endless';
let screen: GameScreen = 'menu';

// Scor & progres
let scor = 0;
let campaignLevel = 0;       
let mutariEfectuate = 0;
let highScore = Number(localStorage.getItem('zenblocks_hs')) || 0;

// Piese
let pieseDisponibile: Piece[] = [];
let piesaSelectata: Piece | null = null;
let piesaInMana = false;
let offsetX = 0;
let offsetY = 0;

// Cronometru per mutare
let moveTimeLeft = 0;          // secunde rămase
let moveTimerInterval: number | null = null;
let timerWarning = false;      // flash roșu când < 5s

// Particule
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size?: number; }
let particles: Particle[] = [];

// Tranziție nivel — titlu flash
let levelTransition: { title: string; alpha: number; timer: number } | null = null;

// Animație finală nivel 10
let winParticlesActive = false;

// Mouse / touch position
let mouseCanvasX = 0;
let mouseCanvasY = 0;

// Ghost snap
let ghostGridX: number | null = null;
let ghostGridY: number | null = null;
let snapValid = false;

// Grid & canvas
const grid = new Grid(40); // Dimensiunea celulei din Grid.ts
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// ─── HTML ─────────────────────────────────────────────────────────────────────
app.innerHTML = `
<div class="game-container">

  <div id="screen-menu" class="overlay">
    <h1 class="glitch">ZenBlocks</h1>
    <p class="hs-text">HIGH SCORE: <span id="menuHS">${highScore}</span></p>
    <button id="btn-play">INITIALIZE SYSTEM</button>
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
        <div class="mode-desc">Scor cât mai mare<br>Fără limită de timp</div>
      </div>
    </div>
  </div>

  <div id="screen-hud" style="display:none">
    <div class="hud-top">
      <span class="hud-label">SCOR <span id="hud-scor">0</span></span>
      <span class="hud-label" id="hud-nivel-wrap">NIVEL <span id="hud-nivel">1</span></span>
      <span class="hud-label" id="hud-target-wrap">TARGET <span id="hud-target">500</span></span>
    </div>
    <div id="timer-wrap" style="display:none">
      <div id="timer-bar-bg">
        <div id="timer-bar"></div>
      </div>
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
    <p id="over-reason" class="hs-text"></p>
    <p id="over-score" class="hs-text"></p>
    <p id="over-hs" class="hs-text"></p>
    <button id="btn-over-restart">REBOOT SYSTEM</button>
  </div>

</div>
`;

// ─── REFS ─────────────────────────────────────────────────────────────────────
canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
ctx = canvas.getContext('2d')!;

// ─── HELPERS OVERLAY ──────────────────────────────────────────────────────────
function showOnly(id: string) {
  ['screen-menu','screen-mode','screen-hud','screen-level','screen-win','screen-over']
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
  return new Piece(0.2, 0.15);
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
  if (gameMode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[campaignLevel];
    document.getElementById('hud-nivel')!.innerText = (campaignLevel + 1).toString();
    document.getElementById('hud-target')!.innerText = lvl.targetScore.toString();
    document.getElementById('hud-nivel-wrap')!.style.display = '';
    document.getElementById('hud-target-wrap')!.style.display = '';
  } else {
    document.getElementById('hud-nivel-wrap')!.style.display = 'none';
    document.getElementById('hud-target-wrap')!.style.display = 'none';
  }
}

// ─── GAME OVER / WIN ──────────────────────────────────────────────────────────
function checkAndSaveHS() {
  if (scor > highScore) {
    highScore = scor;
    localStorage.setItem('zenblocks_hs', highScore.toString());
    document.getElementById('menuHS')!.innerText = highScore.toString();
  }
}

function triggerGameOver(reason: string) {
  stopMoveTimer();
  checkAndSaveHS();
  screen = 'game_over';
  document.getElementById('over-reason')!.innerText = reason;
  document.getElementById('over-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('over-hs')!.innerText = 'HIGH SCORE: ' + highScore;
  showOnly('screen-over');
}

function triggerLevelComplete() {
  stopMoveTimer();
  screen = 'level_complete';
  const lvl = CAMPAIGN_LEVELS[campaignLevel];
  document.getElementById('lc-text')!.innerText = `Nivel ${campaignLevel + 1} completat! Obiectiv: ${lvl.targetScore} pts`;
  document.getElementById('lc-score')!.innerText = `Scorul tău: ${scor} pts`;
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
  checkAndSaveHS();
  screen = 'you_win';
  winParticlesActive = true;
  document.getElementById('win-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('win-hs')!.innerText = 'HIGH SCORE: ' + highScore;
  showOnly('screen-win');
}

// ─── LOGICĂ MUTARE ────────────────────────────────────────────────────────────
function handleMoveLogic() {
  mutariEfectuate++;
  const result = grid.clearLines();
  if (result.destroyedCells.length > 0) {
    result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color));
  }

  scor += result.points;
  scor += grid.checkGeometryBonus();

  // Aplică gravitația conform structurii nivelelor
  const pragGrav = (gameMode === 'campaign' && campaignLevel >= 4) ? 3 : 4;
  if (mutariEfectuate % pragGrav === 0) grid.applyGravity();

  // Campaign: Verifică dacă s-a atins targetul
  if (gameMode === 'campaign') {
    const lvl = CAMPAIGN_LEVELS[campaignLevel];
    if (scor >= lvl.targetScore) {
      if (campaignLevel >= CAMPAIGN_LEVELS.length - 1) {
        triggerYouWin();
        return;
      } else {
        triggerLevelComplete();
        return;
      }
    }
  }

  // Verifică game over local
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

document.getElementById('btn-campaign')!.addEventListener('click', () => {
  startGame('campaign');
});

document.getElementById('btn-endless')!.addEventListener('click', () => {
  startGame('endless');
});

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

function gameLoop() {
  ctx.fillStyle = '#020204';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (winParticlesActive) {
    spawnWinParticles();
    particles.forEach(p => {
      ctx.globalAlpha = p.life * 0.85;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      const sz = (p as any).size || 3;
      ctx.fillRect(p.x, p.y, sz, sz);
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;
    });
    particles = particles.filter(p => p.life > 0);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
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
        ctx.shadowBlur = 8;
        ctx.shadowColor = snapValid ? '#00ffff' : '#ff3333';
        ctx.fillText(snapValid ? '✓ OK' : '✗', indicatorX, indicatorY);
        ctx.shadowBlur = 0;
      }
    }

    ctx.strokeStyle = "rgba(0,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(10, 415);
    ctx.lineTo(390, 415);
    ctx.stroke();
    ctx.setLineDash([]);

    drawLevelTransition();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();