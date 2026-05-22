export const COLORS = ['#FF5252', '#448AFF', '#FFEB3B', '#4CAF50', '#E040FB'];

export interface LevelConfig {
  level: number;
  targetScore: number;
  timePerMove: number;
  description: string;
  // Titlu afișat la tranziție — jucătorul știe în ce „lume" intră
  title: string;
  // 0.0–1.0: probabilitate să cadă o piesă complexă (5+ celule, forme L/Z/cruce)
  complexityWeight: number;
  // Câte celule random să fie pre-umplute la start (simulate blocaje)
  preFillCount: number;
}

export const CAMPAIGN_LEVELS: LevelConfig[] = [
  { level: 1,  targetScore: 500,   timePerMove: 0,  title: "SECTOR ZERO",    description: "Warmup — fără limită de timp",                    complexityWeight: 0.1,  preFillCount: 0  },
  { level: 2,  targetScore: 1000,  timePerMove: 30, title: "GRID ONLINE",    description: "30 secunde per mutare",                           complexityWeight: 0.2,  preFillCount: 0  },
  { level: 3,  targetScore: 1500,  timePerMove: 25, title: "STATIC NOISE",   description: "25 sec/mutare — apar piese mai grele",            complexityWeight: 0.35, preFillCount: 3  },
  { level: 4,  targetScore: 2500,  timePerMove: 22, title: "INTERFERENCE",   description: "22 sec/mutare — tabla pornește parțial ocupată",  complexityWeight: 0.45, preFillCount: 6  },
  { level: 5,  targetScore: 3500,  timePerMove: 20, title: "GRAVITY SHIFT",  description: "Gravitație activă — piesele cad la fiecare 3 mutări", complexityWeight: 0.5, preFillCount: 8 },
  { level: 6,  targetScore: 5000,  timePerMove: 18, title: "PRESSURE WAVE",  description: "18 sec — piese tot mai complexe",                 complexityWeight: 0.55, preFillCount: 10 },
  { level: 7,  targetScore: 7000,  timePerMove: 15, title: "OVERLOAD",       description: "15 sec — piese mari, spațiu puțin",               complexityWeight: 0.7,  preFillCount: 12 },
  { level: 8,  targetScore: 9000,  timePerMove: 13, title: "CRITICAL MASS",  description: "13 sec — concentrare maximă",                     complexityWeight: 0.75, preFillCount: 15 },
  { level: 9,  targetScore: 12000, timePerMove: 10, title: "SYSTEM FAILURE", description: "10 sec — aproape imposibil",                      complexityWeight: 0.85, preFillCount: 18 },
  { level: 10, targetScore: 15000, timePerMove: 8,  title: "FINAL PROTOCOL", description: "8 sec — supraviețuiește!",                        complexityWeight: 1.0,  preFillCount: 22 },
];