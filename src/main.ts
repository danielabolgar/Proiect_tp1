import './style.css'
import { Grid } from './Grid'
import { Piece } from './Piece'
import { CAMPAIGN_LEVELS, POWERUP_COSTS } from './constants'

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

// Power-ups
let bombActive = false;        // modul bomb: următorul tap pe tablă => explozie 3x3
let undoScorSnapshot = 0;      // scorul înainte de ultima mutare (pentru Undo)
let undoPieseSnapshot: { shape: number[][], color: string, isTitan: boolean, x: number, y: number }[] = [];

// Particule
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
let particles: Particle[] = [];

// Mouse / touch position
let mouseCanvasX = 0;
let mouseCanvasY = 0;

// Ghost snap
let ghostGridX: number | null = null;
let ghostGridY: number | null = null;
let snapValid = false;

// Grid & canvas
const grid = new Grid(40);
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// ─── HTML ─────────────────────────────────────────────────────────────────────
app.innerHTML = `
<div class="game-container">

  <!-- MENIU PRINCIPAL -->
  <div id="screen-menu" class="overlay">
    <h1 class="glitch">ZenBlocks</h1>
    <p class="hs-text">HIGH SCORE: <span id="menuHS">${highScore}</span></p>
    <button id="btn-play">INITIALIZE SYSTEM</button>
  </div>

  <!-- SELECȚIE MOD -->
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

  <!-- HUD JOC -->
  <div id="screen-hud" style="display:none">
    <div class="hud-top">
      <span class="hud-label">SCOR <span id="hud-scor">0</span></span>
      <span class="hud-label" id="hud-nivel-wrap">NIVEL <span id="hud-nivel">1</span></span>
      <span class="hud-label" id="hud-target-wrap">TARGET <span id="hud-target">500</span></span>
    </div>
    <!-- Timer bar -->
    <div id="timer-wrap" style="display:none">
      <div id="timer-bar-bg">
        <div id="timer-bar"></div>
      </div>
      <span id="timer-text">30s</span>
    </div>
    <!-- Power-ups -->
    <div class="powerup-row">
      <button class="pu-btn" id="pu-bomb" title="Bomb — distruge 3x3 (cost: ${POWERUP_COSTS.BOMB} pts)">
        💣 BOMB <span class="pu-cost">${POWERUP_COSTS.BOMB}</span>
      </button>
      <button class="pu-btn" id="pu-undo" title="Undo — anulează ultima mutare (cost: ${POWERUP_COSTS.UNDO} pts)">
        ↩ UNDO <span class="pu-cost">${POWERUP_COSTS.UNDO}</span>
      </button>
    </div>
  </div>

  <!-- CANVAS -->
  <div class="canvas-wrapper" id="canvas-wrap" style="display:none">
    <canvas id="gameCanvas" width="400" height="530"></canvas>
  </div>

  <!-- NIVEL COMPLET -->
  <div id="screen-level" class="overlay" style="display:none">
    <h1 style="color:#00ffff">LEVEL COMPLETE</h1>
    <p id="lc-text" class="hs-text"></p>
    <p id="lc-score" class="hs-text"></p>
    <button id="btn-next">NEXT LEVEL ▶</button>
  </div>

  <!-- YOU WIN -->
  <div id="screen-win" class="overlay" style="display:none">
    <h1 class="glitch" style="color:#ffd700;text-shadow:0 0 20px #ffd700">YOU WIN</h1>
    <p class="hs-text" style="color:#ffd700">Ai completat toate cele 10 nivele!</p>
    <p id="win-score" class="hs-text"></p>
    <p id="win-hs" class="hs-text"></p>
    <button id="btn-win-restart">PLAY AGAIN</button>
  </div>

  <!-- GAME OVER -->
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
    particles.push({ x: x + 20, y: y + 20, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, life: 1.0, color });
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
    ctx.fillRect(p.x, p.y, 3, 3);
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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

// ─── UI HUD ───────────────────────────────────────────────────────────────────
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
  // Power-up buttons
  const bombBtn = document.getElementById('pu-bomb') as HTMLButtonElement;
  const undoBtn = document.getElementById('pu-undo') as HTMLButtonElement;
  bombBtn.disabled = scor < POWERUP_COSTS.BOMB || bombActive;
  bombBtn.classList.toggle('pu-active', bombActive);
  undoBtn.disabled = scor < POWERUP_COSTS.UNDO || !grid.hasSavedState();
}

function saveUndoSnapshot() {
  undoScorSnapshot = scor;
  undoPieseSnapshot = pieseDisponibile.map(p => ({ shape: p.cloneShape(), color: p.color, isTitan: p.isTitan, x: p.x, y: p.y }));
  grid.saveState();
}

function restoreUndoSnapshot() {
  scor = undoScorSnapshot;
  pieseDisponibile = undoPieseSnapshot.map(snap => {
    const p = new Piece();
    p.shape = snap.shape;
    p.color = snap.color;
    p.isTitan = snap.isTitan;
    p.x = snap.x;
    p.y = snap.y;
    return p;
  });
  grid.restoreState();
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

function triggerYouWin() {
  stopMoveTimer();
  checkAndSaveHS();
  screen = 'you_win';
  document.getElementById('win-score')!.innerText = 'SCOR FINAL: ' + scor;
  document.getElementById('win-hs')!.innerText = 'HIGH SCORE: ' + highScore;
  showOnly('screen-win');
}

// ─── LOGICĂ MUTARE ────────────────────────────────────────────────────────────
function handleMoveLogic() {
  mutariEfectuate++;
  const result = grid.clearLines();
  if (result.destroyedCells.length > 0)
    result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color));

  scor += result.points;
  scor += grid.checkGeometryBonus();

  // Gravity la fiecare 4 mutări în endless, la fiecare 3 în campaign lvl 5+
  const pragGrav = (gameMode === 'campaign' && campaignLevel >= 4) ? 3 : 4;
  if (mutariEfectuate % pragGrav === 0) grid.applyGravity();

  // Campaign: verifică dacă s-a atins targetul
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

  // Verifică game over (nu mai poți plasa)
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

  // Modul BOMB: tap pe tablă
  if (bombActive) {
    const gridX = Math.floor(mouseX / grid.cellSize);
    const gridY = Math.floor(mouseY / grid.cellSize);
    if (gridX >= 0 && gridX < grid.size && gridY >= 0 && gridY < grid.size) {
      const result = grid.applyBomb(gridX, gridY);
      result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color, 20));
      scor = Math.max(0, scor - POWERUP_COSTS.BOMB);
      bombActive = false;
      handleMoveLogic();
    }
    return;
  }

  // Selectare piesă
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
    saveUndoSnapshot();
    grid.plaseaza_piesa(piesaSelectata.shape, ghostGridX, ghostGridY);
    
    const index = pieseDisponibile.indexOf(piesaSelectata);
    if (index !== -1) {
      pieseDisponibile[index] = new Piece(gameMode === 'campaign' && campaignLevel >= 2 ? 0.3 : 0.2);
    }
    scor += 10;
    
    piesaSelectata = null;
    piesaInMana = false;
    handleMoveLogic();
  } else {
    // Întoarcere instanta pe poziția inițială
    piesaSelectata = null;
    piesaInMana = false;
  }

  ghostGridX = null;
  ghostGridY = null;
  snapValid = false;
});

// ─── POWER-UP BUTTONS ─────────────────────────────────────────────────────────
document.getElementById('pu-bomb')!.addEventListener('click', () => {
  if (scor < POWERUP_COSTS.BOMB || bombActive) return;
  bombActive = !bombActive;
  updateHUD();
});

document.getElementById('pu-undo')!.addEventListener('click', () => {
  if (scor < POWERUP_COSTS.UNDO || !grid.hasSavedState()) return;
  scor -= POWERUP_COSTS.UNDO;
  restoreUndoSnapshot();
  startMoveTimer();
  updateHUD();
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
  pieseDisponibile = [new Piece(0.3), new Piece(0.3), new Piece(0.3)];
  screen = 'playing';
  showOnly('screen-hud');
  updateHUD();
  startMoveTimer();
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
  bombActive = false;
  particles = [];
  grid.reset();
  pieseDisponibile = [new Piece(), new Piece(), new Piece()];
  screen = 'playing';
  showOnly('screen-hud');
  updateHUD();
  startMoveTimer();
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

function drawBombHover() {
  if (!bombActive) return;
  const gx = Math.floor(mouseCanvasX / grid.cellSize);
  const gy = Math.floor(mouseCanvasY / grid.cellSize);
  if (gx < 0 || gx >= grid.size || gy < 0 || gy >= grid.size) return;

  ctx.strokeStyle = 'rgba(255,60,60,0.9)';
  ctx.fillStyle = 'rgba(255,40,40,0.12)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  for (let r = gy - 1; r <= gy + 1; r++) {
    for (let c = gx - 1; c <= gx + 1; c++) {
      if (r >= 0 && r < grid.size && c >= 0 && c < grid.size) {
        ctx.fillRect(c * grid.cellSize + 1, r * grid.cellSize + 1, grid.cellSize - 2, grid.cellSize - 2);
        ctx.strokeRect(c * grid.cellSize + 1, r * grid.cellSize + 1, grid.cellSize - 2, grid.cellSize - 2);
      }
    }
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 2;
  const cx = gx * grid.cellSize + grid.cellSize / 2;
  const cy = gy * grid.cellSize + grid.cellSize / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
  ctx.stroke();
}

function gameLoop() {
  ctx.fillStyle = '#020204';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  updateParticles();
  drawParticles();

  if (screen === 'playing') {
    grid.draw(ctx);

    if (piesaInMana) drawGhostPreview();
    drawBombHover();

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
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();