export const COLORS = ['#FF5252', '#448AFF', '#FFEB3B', '#4CAF50', '#E040FB'];

export interface LevelConfig {
  level: number;
  targetScore: number;
  timePerMove: number; 
  description: string;
}

export const CAMPAIGN_LEVELS: LevelConfig[] = [
  { level: 1,  targetScore: 500,   timePerMove: 0,  description: "Warmup — fără limită de timp" },
  { level: 2,  targetScore: 1000,  timePerMove: 30, description: "30 secunde per mutare" },
  { level: 3,  targetScore: 1500,  timePerMove: 25, description: "25 secunde per mutare" },
  { level: 4,  targetScore: 2500,  timePerMove: 22, description: "22 secunde per mutare" },
  { level: 5,  targetScore: 3500,  timePerMove: 20, description: "Gravitație activă" },
  { level: 6,  targetScore: 5000,  timePerMove: 18, description: "18 secunde per mutare" },
  { level: 7,  targetScore: 7000,  timePerMove: 15, description: "Piese mai mari" },
  { level: 8,  targetScore: 9000,  timePerMove: 13, description: "13 secunde — concentrare maximă" },
  { level: 9,  targetScore: 12000, timePerMove: 10, description: "10 secunde — aproape imposibil" },
  { level: 10, targetScore: 15000, timePerMove: 8,  description: "FINAL — 8 secunde. Supraviețuiește!" },
];

export const POWERUP_COSTS = {
  BOMB: 300,
  UNDO: 200,
};