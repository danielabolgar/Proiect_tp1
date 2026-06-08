import './style.css'
import { Grid } from './Grid'
import { Piece } from './Piece'

// Selectarea containerului principal al aplicației din DOM
const app = document.querySelector<HTMLDivElement>('#app')!;

// Definirea tipurilor stricte pentru modurile de joc și ecranele interfeței
type GameMode = 'campaign' | 'endless';
type GameScreen = 'menu' | 'mode_select' | 'tutorial' | 'playing' | 'level_complete' | 'you_win' | 'game_over';

// Stările inițiale ale ecranelor și modului de joc
let gameMode: GameMode = 'endless';
let screen: GameScreen = 'menu';

// Variabile de monitorizare a progresului și scorului
let scor = 0;
let campaignLevel = 0;
let mutariEfectuate = 0;

// Încărcarea high-score-urilor salvate local în browser (sau 0 dacă nu există)
let highScoreCampaign = Number(localStorage.getItem('zenblocks_hs_campaign')) || 0;
let highScoreEndless   = Number(localStorage.getItem('zenblocks_hs_endless'))  || 0;

// Returnează high-score-ul corespunzător modului curent de joc
function getHS(): number {
  return gameMode === 'campaign' ? highScoreCampaign : highScoreEndless;
}

// Salvează noul high-score în localStorage dacă scorul curent îl depășește pe cel vechi
function saveHS() {
  if (scor <= getHS()) return;
  if (gameMode === 'campaign') { 
    highScoreCampaign = scor; 
    localStorage.setItem('zenblocks_hs_campaign', scor.toString()); 
  }
  else { 
    highScoreEndless = scor;  
    localStorage.setItem('zenblocks_hs_endless',  scor.toString()); 
  }
  // Actualizează textul din meniul principal cu cel mai bun scor general
  document.getElementById('menuHS')!.innerText = getBestHS().toString();
}

// Returnează maximul absolut dintre cele două moduri de joc
function getBestHS(): number { return Math.max(highScoreCampaign, highScoreEndless); }

// Managementul pieselor active din zona de dock (piese disponibile și interacțiunea drag-and-drop)
let pieseDisponibile: Piece[] = [];
let piesaSelectata: Piece | null = null;
let piesaInMana = false;
let offsetX = 0; // Decalaj X mouse față de originea piesei
let offsetY = 0; // Decalaj Y mouse față de originea piesei

// Gestiunea cronometrului pentru mutări (specific modului Campaign)
let moveTimeLeft = 0;
let moveTimerInterval: number | null = null;
let timerWarning = false; // Devine true când rămân mai puțin de 5 secunde

// Structura și array-ul pentru sistemul de particule (efecte vizuale la distrugerea blocurilor)
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size?: number; }
let particles: Particle[] = [];

// Stări pentru animații speciale: tranziție de nivel și ecranul final de victorie
let levelTransition: { title: string; alpha: number; timer: number } | null = null;
let winParticlesActive = false;

// Text temporar animat pe ecran pentru evenimente sau combo-uri (ex: "DOUBLE CLEAR!")
let comboFlash: { text: string; alpha: number; timer: number; color: string } | null = null;

// Multiplicator pentru curățări consecutive de linii (Streak System)
let streak = 0;
let streakMultiplier = 1;

// Structura și array-ul pentru pop-up-urile plutitoare de scor (+50, +500 etc.)
interface ScorePopup { x: number; y: number; text: string; life: number; color: string; vy: number; }
let scorePopups: ScorePopup[] = [];
function addScorePopup(x: number, y: number, text: string, color = '#ffffff') {
  scorePopups.push({ x, y, text, life: 1.0, color, vy: -1.5 });
}

// Intensitatea și coordonatele pentru efectul de Screen Shake (cutremur de ecran)
let shakeIntensity = 0;
let shakeX = 0;
let shakeY = 0;
function triggerShake(intensity: number) { shakeIntensity = intensity; }

// Animația aplicată celulelor în momentul în care o linie este completată și se șterge
interface ClearAnim { cells: { r: number; c: number }[]; timer: number; done: boolean; }
let clearAnim: ClearAnim | null = null;

// Poziția cursorului și datele de proiecție (Ghost Preview) pe grila jocului
let mouseCanvasX = 0;
let mouseCanvasY = 0;
let ghostGridX: number | null = null;
let ghostGridY: number | null = null;
let snapValid = false; // Specifică dacă piesa poate fi plasată la coordonatele curente de ghost

// Instanțierea grilei principale de joc (cu dimensiune/celulă specificată)
const grid = new Grid(40);
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Structura definiției pentru un nivel configurat dinamic în modul Campaign
interface CustomLevel {
  levelIndex: number;
  totalLevels: number;
  targetScore: number;
  timePerMove: number;      // Limita de timp în secunde (0 = infinit)
  complexityWeight: number; // Factor de generare a formelor complexe (0.0 - 1.0)
  preFillCount: number;     // Câte blocuri sunt deja plasate aleatoriu pe tablă la start
  title: string;
  description: string;
}

let customLevels: CustomLevel[] = [];
let customTargetScore = 0;
let customTotalLevels = 0;

// Algoritm de generare procedurală a nivelelor pe baza preferințelor din meniul de configurare
function generateCustomLevels(targetScore: number, totalLevels: number): CustomLevel[] {
  const levels: CustomLevel[] = [];
  const titles = [
    'SECTOR ZERO','GRID ONLINE','STATIC NOISE','INTERFERENCE','GRAVITY SHIFT',
    'PRESSURE WAVE','OVERLOAD','CRITICAL MASS','SYSTEM FAILURE','FINAL PROTOCOL',
    'DARK MATTER','VOID BREACH','SINGULARITY','EVENT HORIZON','FINAL PROTOCOL Ω'
  ];

  for (let i = 0; i < totalLevels; i++) {
    const progress = i / (totalLevels - 1 || 1); 

    // Scorul țintă crește exponențial pe măsură ce avansezi în nivele
    const exp = Math.pow(progress, 1.5);
    const levelTarget = Math.round(targetScore * exp / 50) * 50 || Math.round(targetScore / totalLevels * (i + 1) / 50) * 50;

    // Cronometrul se introduce după 20% din parcurgerea campaniei și scade progresiv (de la 35s la 6s)
    const timerStart = Math.floor(totalLevels * 0.2);
    let timePerMove = 0;
    if (i >= timerStart) {
      const timerProgress = (i - timerStart) / (totalLevels - timerStart);
      timePerMove = Math.round(35 - timerProgress * 29); 
    }

    // Complexitatea formelor crește de la nivel la nivel
    const complexityWeight = Math.min(1.0, 0.1 + progress * 0.9);

    // Tabla începe să fie pre-populată cu blocuri de la 30% din campanie, ajungând până la 25 de blocuri
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

// Returnează obiectul de configurare pentru nivelul curent din campanie
function getCurrentCustomLevel(): CustomLevel {
  return customLevels[campaignLevel];
}

// Inițializarea leneșă (Lazy Initialization) a contextului Web Audio API
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// Generator de sunete sintetizate în timp real folosind oscilatoare matematice (fără fișiere audio externe)
function playTone(freq: number, type: OscillatorType, duration: number, vol = 0.18, attack = 0.01) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    
    // Configurare plic de volum (Sustain -> Decay/Release) pentru a evita pocniturile audio
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ac.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch {}
}

// Librărie de efecte sonore predefinite, generate prin arpegii din unde sinusoidale
const sounds = {
  // Sunet la plasarea unei piese (alege o notă dintr-o pentatonică)
  place: () => {
    playTone(440 * Math.pow(2, [0,2,4,7,9][Math.floor(Math.random()*5)]/12), 'sine', 0.18, 0.08, 0.005);
  },

  // Arpegiu ascendent rapid la curățarea unei singure linii
  clear: () => {
    playTone(523, 'sine', 0.3, 0.12, 0.01);
    setTimeout(() => playTone(659, 'sine', 0.3, 0.10, 0.01), 60);
    setTimeout(() => playTone(784, 'sine', 0.35, 0.08, 0.01), 120);
  },

  // Arpegiu complex și extins pentru realizarea unui combo (2+ linii)
  combo: () => {
    playTone(523, 'sine', 0.4, 0.15, 0.01);
    setTimeout(() => playTone(659, 'sine', 0.4, 0.13, 0.01), 50);
    setTimeout(() => playTone(784, 'sine', 0.4, 0.11, 0.01), 100);
    setTimeout(() => playTone(1046, 'sine', 0.5, 0.10, 0.01), 160);
  },

  // Succesiune de note grave, descendente, la pierderea jocului
  gameOver: () => {
    playTone(392, 'sine', 0.5, 0.15, 0.02);
    setTimeout(() => playTone(330, 'sine', 0.6, 0.13, 0.02), 200);
    setTimeout(() => playTone(262, 'sine', 0.8, 0.12, 0.02), 450);
  },

  // Sunet festiv la finalizarea cu succes a unui nivel
  levelUp: () => {
    playTone(523, 'sine', 0.2, 0.15, 0.01);
    setTimeout(() => playTone(659, 'sine', 0.2, 0.13, 0.01), 80);
    setTimeout(() => playTone(784, 'sine', 0.2, 0.12, 0.01), 160);
    setTimeout(() => playTone(1046, 'sine', 0.35, 0.14, 0.01), 260);
  },

  // Sunet ascuțit ce marchează activarea modului Fever
  fever: () => {
    playTone(880, 'sine', 0.25, 0.14, 0.01);
    setTimeout(() => playTone(1108, 'sine', 0.3, 0.12, 0.01), 80);
    setTimeout(() => playTone(1318, 'sine', 0.35, 0.10, 0.01), 160);
  },

  // Alertă sonoră rapidă bimodală pentru evenimentul Rush
  rush: () => {
    playTone(660, 'sine', 0.15, 0.12, 0.005);
    setTimeout(() => playTone(880, 'sine', 0.15, 0.10, 0.005), 60);
    setTimeout(() => playTone(660, 'sine', 0.15, 0.10, 0.005), 120);
  },

  // Sunet grav de alarmă când tabla de joc urcă periculos în modul Endless
  danger: () => {
    playTone(196, 'sine', 0.5, 0.18, 0.02);
    setTimeout(() => playTone(165, 'sine', 0.6, 0.15, 0.02), 250);
  },
};

// Injectarea structurii HTML pentru interfața utilizatorului (meniuri, formulare, HUD și Canvas)
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
      <div class="tut-item"><span class="tut-icon">🔥</span><div><b>FEVER</b> (Endless) — eveniment random: liniile valorează 3× timp de 10 mutări.</div></div>
      <div class="tut-item"><span class="tut-icon">⚠</span><div><b>Tablă care urcă</b> (Endless) — la fiecare 500 pts apare un rând nou de jos. Dacă ajunge sus — game over!</div></div>
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

// Preluarea elementelor canvas-ului și configurarea contextului 2D de desenare
canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
ctx = canvas.getContext('2d')!;

// Funcție utilitară pentru ascunderea tuturor ecranelor HTML și afișarea exclusivă a celui dorit
function showOnly(id: string) {
  ['screen-menu','screen-mode','screen-tutorial','screen-campaign-setup','screen-hud','screen-level','screen-win','screen-over']
    .forEach(s => {
      const el = document.getElementById(s)!;
      el.style.display = s === id ? (s === 'screen-hud' ? 'block' : 'flex') : 'none';
    });
  const cw = document.getElementById('canvas-wrap')!;
  cw.style.display = (id === 'screen-hud') ? 'inline-block' : 'none';
}

// Spawnează un grup de particule direcționate aleatoriu dintr-un punct fix (efect de explozie)
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

// Actualizează starea fizică a particulelor (poziție și degradare via opacitate)
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= 0.025;
    if (p.life <= 0) particles.splice(i, 1); // Elimină particulele moarte din memorie
  }
}

// Randează particulele active pe ecran cu un efect de strălucire (glow) dinamic
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.shadowBlur = 15; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    const sz = p.size || 3;
    ctx.fillRect(p.x, p.y, sz, sz);
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; // Resetare parametri globali ctx
}

// Fabrică o piesă nouă adaptată contextului curent de joc și dificultății
function makePiece(): Piece {
  if (gameMode === 'campaign') {
    const lvl = getCurrentCustomLevel();
    const titanChance = lvl.levelIndex >= 2 ? 0.3 : 0.2; // Șansă crescută de piese Titan în nivele avansate
    return new Piece(titanChance, lvl.complexityWeight);
  }
  return getEndlessPiece();
}

// Gestiunea coloanei sonore Ambientale (Sintetizator procedural de fundal pentru meniuri)
let menuMusicNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let menuMusicInterval: number | null = null;
let menuMusicActive = false;

// Lansează sunetul de tip drone de fundal și pornește secvențiatorul generativ de note muzicale
function startMenuMusic() {
  if (menuMusicActive) return;
  menuMusicActive = true;

  const ac = getAudio();

  // Creează un acord grav bifonic continuu (drone) cu filtru Lowpass
  const droneFreqs = [130.81, 130.81 * 1.003]; 
  droneFreqs.forEach(freq => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    osc.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ac.currentTime + 2);
    osc.start();
    menuMusicNodes.push({ osc, gain });
  });

  // Gamă muzicală predefinită pentru notele ambientale redate aleatoriu
  const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  let noteIndex = 0;

  // Funcția recursivă declanșată prin interval ce generează melodii armonice unice
  const playNextNote = () => {
    if (!menuMusicActive) return;
    const ac2 = getAudio();
    const freq = scale[Math.floor(Math.random() * scale.length)];
    const osc = ac2.createOscillator();
    const gain = ac2.createGain();
    osc.connect(gain); gain.connect(ac2.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ac2.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ac2.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 2.5);
    osc.start(ac2.currentTime);
    osc.stop(ac2.currentTime + 2.5);
    noteIndex++;

    // Din 4 în 4 note adaugă un ecou armonic la o octavă superioară
    if (noteIndex % 4 === 0) {
      const osc2 = ac2.createOscillator();
      const gain2 = ac2.createGain();
      osc2.connect(gain2); gain2.connect(ac2.destination);
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      gain2.gain.setValueAtTime(0, ac2.currentTime + 0.3);
      gain2.gain.linearRampToValueAtTime(0.03, ac2.currentTime + 0.4);
      gain2.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 2.0);
      osc2.start(ac2.currentTime + 0.3);
      osc2.stop(ac2.currentTime + 2.0);
    }
  };

  playNextNote();
  menuMusicInterval = window.setInterval(playNextNote, 1800);
}

// Oprește sunetul ambiental diminuând lin volumul (Fade Out) pentru a asigura o tranziție curată
function stopMenuMusic() {
  if (!menuMusicActive) return;
  menuMusicActive = false;

  if (menuMusicInterval !== null) {
    clearInterval(menuMusicInterval);
    menuMusicInterval = null;
  }

  const ac = getAudio();
  menuMusicNodes.forEach(({ gain, osc }) => {
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 1.0);
    osc.stop(ac.currentTime + 1.1);
  });
  menuMusicNodes = [];
}

// Gestiunea mecanismelor modului Endless (Evenimente speciale periodice și dificultate)
type EventType = 'fever' | 'rush';
interface GameEvent {
  type: EventType;
  movesLeft: number;
  totalMoves: number;
}
let activeEvent: GameEvent | null = null;
let nextEventIn = 8;         // Numărul de mutări rămase până la următorul eveniment random
let endlessWave = 0;         // Valul curent în funcție de liniile adiționale apărute
let endlessScoreCheckpoint = 0; // Urmărește pragul de puncte pentru ridicarea tablei

const EVENT_DURATION = 10; 
const RISING_ROW_SCORE = 1500;

// Declanșează un eveniment modificator de mecanică în mod complet aleatoriu
function triggerRandomEvent() {
  if (gameMode !== 'endless') return;
  const types: EventType[] = ['fever', 'rush'];
  const type = types[Math.floor(Math.random() * types.length)];
  activeEvent = { type, movesLeft: EVENT_DURATION, totalMoves: EVENT_DURATION };

  const labels: Record<EventType, string> = {
    fever: '🔥 FEVER — liniile valorează 3×!',
    rush:  '⚡ RUSH — piese simple pentru 10 mutări!',
  };
  const colors: Record<EventType, string> = {
    fever: '#ff4400', rush: '#00ffff',
  };
  comboFlash = { text: labels[type], alpha: 1.0, timer: 120, color: colors[type] };
  triggerShake(6);

  if (type === 'fever') sounds.fever();
  else sounds.rush();
}

// Împinge toate blocurile în sus și adaugă un rând incomplet la baza grilei (mecanică de presiune)
function addRisingRow() {
  for (let r = 0; r < grid.size - 1; r++) {
    grid.cells[r] = [...grid.cells[r + 1]];
  }

  const newRow = Array(grid.size).fill(2); // Umple rândul cu blocuri solide
  const gaps = 2 + Math.floor(Math.random() * 2); // Lasă goluri libere aleatorii pentru a fi rezolvate
  const gapPositions = new Set<number>();
  while (gapPositions.size < gaps) gapPositions.add(Math.floor(Math.random() * grid.size));
  gapPositions.forEach(c => { newRow[c] = 0; });
  grid.cells[grid.size - 1] = newRow;

  endlessWave++;
  triggerShake(5);
  addScorePopup(canvas.width / 2, 300, '⚠ TABLĂ URCĂ!', '#ff3333');
  sounds.danger();
}

// Verifică dacă scorul a depășit checkpoint-ul stabilind dacă e cazul ca tabla să se ridice
function checkRisingRows() {
  if (gameMode !== 'endless') return;
  if (scor - endlessScoreCheckpoint >= RISING_ROW_SCORE) {
    endlessScoreCheckpoint = scor;
    addRisingRow();
    
    // Verifică starea liniei superioare de demarcație; dacă e blocată se termină jocul
    for (let c = 0; c < grid.size; c++) {
      if (grid.cells[1][c] !== 0) {
        triggerGameOver('Blocurile au ajuns prea sus!');
        return;
      }
    }
  }
}

// Determină structura formelor generate în modul Endless pe baza valurilor sau evenimentelor active
function getEndlessPiece(): Piece {
  if (activeEvent?.type === 'rush') return new Piece(0, 0.05); 
  return new Piece(0.15, 0.15 + endlessWave * 0.02); 
}

// Returnează valoarea maximă a cronometrului în conformitate cu nivelul campaniei
function getTimeLimit(): number {
  if (gameMode === 'endless') return 0;
  return getCurrentCustomLevel().timePerMove;
}

// Resetează și repornește numărătoarea inversă pentru mutarea curentă
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

// Șterge intervalul activ al cronometrului pentru a opri degradarea timpului
function stopMoveTimer() {
  if (moveTimerInterval !== null) { clearInterval(moveTimerInterval); moveTimerInterval = null; }
}

// Re-calculează procentul și re-colorează componenta grafică a barei de timp în roșu la criză
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

// Sincronizează valorile numerice interne cu elementele de text din interfața utilizator (HUD)
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

// Oprește elementele active și configurează panoul informativ final corespunzător cauzei eșecului
function triggerGameOver(reason: string) {
  stopMoveTimer();
  const wasHS = scor > getHS();
  saveHS();
  screen = 'game_over';

  const reasonEl = document.getElementById('over-reason')!;
  if (reason.includes('timp')) {
    reasonEl.innerHTML = '⏱ Timpul a expirat.<br>Data viitoare mișcă-te mai repede!';
  } else if (reason.includes('sus')) {
    reasonEl.innerHTML = '⚠ Blocurile au ajuns prea sus!<br>Curăță linii mai repede data viitoare.';
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

// Afișează ecranul intermediar de succes la atingerea punctajului țintă dintr-un nivel de campanie
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

// Pornește animația de Overlay cu titlul și descrierea tehnică a noului nivel
function showLevelTitle(title: string) {
  levelTransition = { title, alpha: 1.0, timer: 120 };
}

// Generează confeti sub formă de particule aurii rectangulare ce cad lin din partea de sus a ecranului
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

// Randează grafic panoul cinetic de introducere în nivel (Titlu, Descriere, Bară de dificultate progresivă)
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

  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,255,255,0.6)';
  ctx.shadowBlur = 0;
  ctx.fillText(`NIVEL ${campaignLevel + 1} / ${lvl.totalLevels}`, canvas.width / 2, canvas.height / 2 - 28);

  ctx.font = 'bold 26px Orbitron, sans-serif';
  ctx.shadowBlur = 30; ctx.shadowColor = '#00ffff';
  ctx.fillStyle = '#00ffff';
  ctx.fillText(levelTransition.title, canvas.width / 2, canvas.height / 2 + 2);

  ctx.font = '11px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(224,230,237,0.8)';
  ctx.shadowBlur = 0;
  ctx.fillText(lvl.description, canvas.width / 2, canvas.height / 2 + 24);

  // Segment de randare pentru bara orizontală indicatoare a nivelului de dificultate
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

// Activează starea și ecranul de victorie absolută la epuizarea tuturor nivelelor campaniei
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

// Nucleul de procesare logică a regulilor de joc executat imediat după plasarea validă a unei piese
function handleMoveLogic() {
  mutariEfectuate++;
  const result = grid.clearLines(); // Procesează grila pentru a detecta linii pline completate

  if (result.totalCleared > 0) {
    // Calculează punctajele de bază și aplică eventualul modificator Fever
    const feverMult = activeEvent?.type === 'fever' ? 3 : 1;
    const basePoints = result.points * feverMult;

    // Actualizarea sistemului de multiplicare bazat pe streak (curățări consecutive)
    streak++;
    streakMultiplier = Math.min(4, 1 + Math.floor(streak / 2));
    const bonusStreak = streak >= 3 ? Math.floor(basePoints * (streakMultiplier - 1)) : 0;
    const totalPoints = basePoints + bonusStreak;

    // Acordă un bonus adițional substanțial de risc dacă liniile conțin blocuri din modul Endless
    let dangerBonus = 0;
    result.clearedCoords.forEach(({r}) => {
      if (grid.cells[r]?.includes(2)) dangerBonus += 200;
    });
    if (dangerBonus > 0) addScorePopup(canvas.width / 2, 160, `+${dangerBonus} DANGER CLEAR!`, '#ff3333');

    // Lansează structura animației de ștergere și inițializează exploziile pe ecran
    clearAnim = { cells: result.clearedCoords.sort((a,b) => a.c - b.c || a.r - b.r), timer: 0, done: false };
    result.destroyedCells.forEach(cell => createExplosion(cell.x, cell.y, cell.color, 8));

    // Determină culoarea pop-up-ului în funcție de complexitatea mutării executate
    const popupColor = feverMult > 1 ? '#ff4400' : result.totalCleared >= 3 ? '#ffd700' : result.totalCleared >= 2 ? '#00ffff' : '#ffffff';
    addScorePopup(canvas.width / 2, 180, `+${totalPoints}${feverMult > 1 ? ' 🔥' : ''}`, popupColor);
    if (bonusStreak > 0) addScorePopup(canvas.width / 2, 210, `🔥 x${streakMultiplier} STREAK!`, '#ff8c00');

    // Ajustează feed-back-ul tactil/vizual (Shake) în raport cu numărul de linii distruse simultan
    if (result.totalCleared >= 3) {
      sounds.combo(); triggerShake(8);
      comboFlash = { text: `${result.totalCleared}× COMBO!`, alpha: 1.0, timer: 90, color: '#ffd700' };
    } else if (result.totalCleared >= 2) {
      sounds.combo(); triggerShake(4);
      comboFlash = { text: `DOUBLE CLEAR!`, alpha: 1.0, timer: 75, color: '#00ffff' };
    } else {
      sounds.clear(); triggerShake(2);
    }

    scor += totalPoints + dangerBonus;
  } else {
    // Dacă mutarea nu a curățat nicio linie, se resetează combo streak-ul
    streak = 0;
    streakMultiplier = 1;
    sounds.place();
  }

  // Verifică detectarea automată a tiparului special de pătrat solid (Geometry Bonus)
  const geom = grid.checkGeometryBonus();
  if (geom > 0) {
    scor += geom;
    triggerShake(10);
    addScorePopup(canvas.width / 2, 150, `+${geom} GEOMETRY!`, '#ff00ff');
    comboFlash = { text: `⬛ GEOMETRY BONUS!`, alpha: 1.0, timer: 90, color: '#ff00ff' };
  }

  // Mecanica de Gravitate: Aplică periodic (la X mutări) coborârea blocurilor suspendate
  const pragGrav = (gameMode === 'campaign' && campaignLevel >= 4) ? 3 : 4;
  if (mutariEfectuate % pragGrav === 0) grid.applyGravity();

  // Verificări condiții de victorie / progres specifice modului Campaign
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

  // Gestiune stări, cronometre evenimente și salvare automată specifice modului Endless
  if (gameMode === 'endless') {
    if (activeEvent) {
      activeEvent.movesLeft--;
      if (activeEvent.movesLeft <= 0) {
        activeEvent = null;
        comboFlash = { text: 'EVENIMENT TERMINAT', alpha: 1.0, timer: 60, color: '#888888' };
      }
    }

    nextEventIn--;
    if (nextEventIn <= 0) {
      triggerRandomEvent();
      nextEventIn = 8 + Math.floor(Math.random() * 5);
    }

    checkRisingRows();
    if (screen === 'game_over') return;

    // Soft Reset în Endless: dacă nicio piesă din dock nu mai are loc, curăță baza pentru a preveni blocarea directă
    if (!grid.poate_plasa_orice(pieseDisponibile)) {
      for (let c = 0; c < grid.size; c++) grid.cells[grid.size - 1][c] = 0;
      streak = 0;
      comboFlash = { text: '∞ RESET — continuă!', alpha: 1.0, timer: 60, color: '#4CAF50' };
    }
    updateHUD();
    return;
  }

  // În modul Campaign, imposibilitatea plasării vreunei piese duce instant la Game Over
  if (!grid.poate_plasa_orice(pieseDisponibile)) {
    triggerGameOver('Nu mai există mutări posibile.');
    return;
  }

  updateHUD();
  startMoveTimer();
}

// Ascultător Pointerdown: Detectează momentul atingerii/click-ului pe o piesă din docul de selecție
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (screen !== 'playing') return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const CELL_PREV = 28; // Dimensiunea redusă a celulei pentru piesele din dock
  pieseDisponibile.forEach(piece => {
    const pw = piece.shape[0].length * CELL_PREV;
    const ph = piece.shape.length * CELL_PREV;
    const hitPad = 16; // Margine de siguranță extinsă pentru a ușura prinderea pieselor pe mobil
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

// Ascultător Pointermove (Abonat global pe fereastră): Mută piesa selectată și calculează coordonatele de snap pe grilă
window.addEventListener('pointermove', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  mouseCanvasX = e.clientX - rect.left;
  mouseCanvasY = e.clientY - rect.top;

  if (!piesaInMana || !piesaSelectata || screen !== 'playing') return;

  piesaSelectata.x = mouseCanvasX - offsetX;
  piesaSelectata.y = mouseCanvasY - offsetY;

  // Calculul centrului geometric al formei deplasate pentru determinarea precisă a indicelui de linie/coloană
  const pw = piesaSelectata.shape[0].length;
  const ph = piesaSelectata.shape.length;
  const cX = piesaSelectata.x + (pw * grid.cellSize) / 2;
  const cY = piesaSelectata.y + (ph * grid.cellSize) / 2;
  
  ghostGridX = Math.round((cX - (pw * grid.cellSize) / 2) / grid.cellSize);
  ghostGridY = Math.round((cY - (ph * grid.cellSize) / 2) / grid.cellSize);
  snapValid = grid.verifica_validitate(piesaSelectata.shape, ghostGridX, ghostGridY);
});

// Ascultător Pointerup (Global): Eliberează piesa și încearcă integrarea ei permanentă în matricea grilei
window.addEventListener('pointerup', () => {
  if (!piesaInMana || !piesaSelectata || screen !== 'playing') return;

  if (ghostGridX !== null && ghostGridY !== null &&
      grid.verifica_validitate(piesaSelectata.shape, ghostGridX, ghostGridY)) {
    // Plasează efectiv piesa în grila internă a jocului
    grid.plaseaza_piesa(piesaSelectata.shape, ghostGridX, ghostGridY);
    sounds.place();
    const index = pieseDisponibile.indexOf(piesaSelectata);
    if (index !== -1) {
      pieseDisponibile[index] = makePiece(); // Regenerare imediată a slotului eliberat din dock
    }

    // Acordă puncte direct proporționale cu numărul de blocuri din structura piesei poziționate
    const cellCount = piesaSelectata.shape.flat().filter(v => v !== 0).length;
    const placementPoints = cellCount * 50;
    scor += placementPoints;
    addScorePopup(
      (ghostGridX + piesaSelectata.shape[0].length / 2) * grid.cellSize,
      (ghostGridY) * grid.cellSize,
      `+${placementPoints}`,
      'rgba(255,255,255,0.8)'
    );
    
    piesaSelectata = null;
    piesaInMana = false;
    handleMoveLogic(); // Lansează logica secundară de evaluare a mutării
  } else {
    // Resetează stările drag-and-drop făcând piesa să revină în dock în caz de plasare invalidă
    piesaSelectata = null;
    piesaInMana = false;
  }

  ghostGridX = null;
  ghostGridY = null;
  snapValid = false;
});

// Gestiunea delegărilor de evenimente click pentru navigarea între ecranele HTML din interfață
document.getElementById('btn-play')!.addEventListener('click', () => {
  showOnly('screen-mode');
});

// Inițializează și deblochează contextul audio la prima interacțiune directă a utilizatorului (Politica browser-elor)
document.getElementById('btn-play')!.addEventListener('click', startMenuMusic, { once: true });
document.getElementById('btn-tutorial')!.addEventListener('click', startMenuMusic, { once: true });

document.getElementById('btn-tutorial')!.addEventListener('click', () => showOnly('screen-tutorial'));
document.getElementById('btn-tutorial-back')!.addEventListener('click', () => showOnly('screen-menu'));

document.getElementById('btn-campaign')!.addEventListener('click', () => {
  showOnly('screen-campaign-setup');
  updateSetupPreview();
});
document.getElementById('btn-endless')!.addEventListener('click',  () => startGame('endless'));

document.getElementById('btn-campaign-back')!.addEventListener('click', () => showOnly('screen-mode'));

// Re-calculează și actualizează dinamic previzualizarea textului de configurare a campaniei în timp real
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

// Maparea evenimentelor de tip input pentru actualizarea dinamică a preview-ului de campanie
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

// Avansează nivelul din campanie, re-inițializează configurațiile de grilă și aplică pre-popularea de blocuri
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
  startMenuMusic();
});

document.getElementById('btn-over-restart')!.addEventListener('click', () => {
  showOnly('screen-menu');
  startMenuMusic();
});

// Inițializarea curată a tuturor variabilelor de sistem și pornirea stării primare a jocului ales
function startGame(mode: GameMode) {
  stopMenuMusic();
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
  activeEvent = null;
  nextEventIn = 8;
  endlessWave = 0;
  endlessScoreCheckpoint = 0;
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

// Desenează umbra transparentă (Ghost Preview) direct pe grilă sub piesa aflată în mâna utilizatorului
function drawGhostPreview() {
  if (!piesaSelectata || ghostGridX === null || ghostGridY === null) return;

  // Schimbă culoarea de proiecție (Cyan/Roșu) în funcție de validitatea coordonatelor detectate
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

// Randează textul flash central pentru mesaje mari (ex: "3× COMBO!") folosind un efect cinematic de fade-out
function drawComboFlash() {
  if (!comboFlash) return;
  comboFlash.timer--;
  if (comboFlash.timer <= 20) comboFlash.alpha = comboFlash.timer / 20;
  if (comboFlash.timer <= 0) { comboFlash = null; return; }

  const progress = 1 - comboFlash.timer / 90;
  const y = 200 - progress * 40; // Efect fin de translație ascendentă (plutire)

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

// Randarea și actualizarea textelor plutitoare de scor (+50, +200) cu degradare treptată (Life-cycle style)
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

// Desenează emojurile de flăcări în colțul ecranului dacă streak-ul consecutiv este activ
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

// Loop-ul principal al motorului grafic (Game Loop), sincronizat prin RequestAnimationFrame
function gameLoop() {
  // Calculul și amortizarea cinematică a vibrației ecranului (Screen Shake damping)
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.75;
  } else {
    shakeX = 0; shakeY = 0; shakeIntensity = 0;
  }

  // Curățarea ecranului cu fundalul ultra-întunecat al jocului
  ctx.fillStyle = '#020204';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ramură logică specială pentru starea You Win (Oprește jocul standard și randează doar confeti)
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
  ctx.translate(shakeX, shakeY); // Aplică vectorul de cutremur asupra întregului context grafic

  updateParticles();
  drawParticles();

  if (screen === 'playing') {
    grid.draw(ctx); // Randează matricea principală și celulele blocurilor

    // Randează componenta vizuală UI a indicatorului de progres pentru evenimentul Endless activ
    if (activeEvent && gameMode === 'endless') {
      const evColors: Record<EventType, string> = { fever: '#ff4400', rush: '#00ffff' };
      const evLabels: Record<EventType, string> = { fever: '🔥 FEVER', rush: '⚡ RUSH' };
      const col = evColors[activeEvent.type];
      const progress = activeEvent.movesLeft / activeEvent.totalMoves;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(4, 2, 110, 22);
      ctx.fillStyle = col;
      ctx.fillRect(4, 2, 110 * progress, 22);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = col;
      ctx.fillRect(4, 2, 110, 22);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 6; ctx.shadowColor = col;
      ctx.fillText(`${evLabels[activeEvent.type]} ${activeEvent.movesLeft}`, 8, 16);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Desenează secvențele active ale animației speciale de ștergere a liniilor
    if (clearAnim && !clearAnim.done) {
      clearAnim.timer += 0.05;
      grid.drawClearAnim(ctx, clearAnim.cells, clearAnim.timer);
      if (clearAnim.timer >= 1.5) clearAnim = null;
    }

    if (piesaInMana) drawGhostPreview();

    // Randează cele 3 piese din dock aplicându-le un efect fin de plutire sinusoidală (levitare)
    const timp = Date.now() * 0.003;
    const PIESE_Y_BASE = 450;
    pieseDisponibile.forEach((piece, index) => {
      if (piece !== piesaSelectata) {
        piece.x = 20 + index * 130;
        piece.y = PIESE_Y_BASE + Math.sin(timp + index) * 4;
      } else {
        // Evidențiază puternic piesa trasă în mână prin efecte de iluminare neon
        ctx.shadowBlur = 30;
        ctx.shadowColor = piece.isTitan ? "#ff00ff" : "#00ffff";
      }
      piece.draw(ctx, 28, piece.x, piece.y);
      ctx.shadowBlur = 0;
    });

    // Desenează textul indicator plutitor (✓ OK / ✗) fix deasupra piesei selectate
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

    // Randează linia punctată (Dash Line) de demarcație dintre zona grilei și docul cu piese
    ctx.strokeStyle = "rgba(0,255,255,0.15)";
    ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(10, 415); ctx.lineTo(390, 415); ctx.stroke();
    ctx.setLineDash([]);

    // Apelul funcțiilor interne de desenare pentru interfețele dinamice din interiorul canvas-ului
    drawScorePopups();
    drawStreak();
    drawComboFlash();
    drawLevelTransition();
  }

  ctx.restore();
  requestAnimationFrame(gameLoop); // Re-execută loop-ul grafic la următorul refresh al monitorului
}

// Inițializează imediat bucla principală de randare la încărcarea scriptului
gameLoop();
