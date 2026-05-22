import { COLORS } from './constants'

export class Piece {
  shape: number[][];
  color: string;
  isTitan: boolean;
  x: number = 0;
  y: number = 0;

  constructor(titanChance: number = 0.2, complexityWeight: number = 0.2) {
    this.shape = this.generateRandomShape(complexityWeight);
    this.isTitan = Math.random() < titanChance;
    if (this.isTitan) this.injectTitan();
    this.color = this.isTitan ? '#457B9D' : COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  cloneShape(): number[][] {
    return this.shape.map(row => [...row]);
  }

  // Piese simple: 1–4 celule, ușor de plasat
  private simpleShapes(): number[][][] {
    return [
      [[1]],
      [[1, 1]],
      [[1], [1]],
      [[1, 1], [1, 0]],
      [[1, 1, 1]],
      [[1], [1], [1]],
      [[1, 1], [1, 1]],
      [[1, 1, 0], [0, 1, 1]],
      [[0, 1, 1], [1, 1, 0]],
      [[1, 1, 1, 1]],
      [[1], [1], [1], [1]],
    ];
  }

  // Piese complexe: 5+ celule, forme dificile
  private complexShapes(): number[][][] {
    return [
      [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
      [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
      [[1, 0, 1], [1, 1, 1]],
      [[1, 1, 1, 1, 1]],
      [[1], [1], [1], [1], [1]],
      [[1, 1, 1], [1, 0, 0], [1, 0, 0]],
      [[1, 1, 1], [0, 0, 1], [0, 0, 1]],
      [[1, 1, 0], [0, 1, 0], [0, 1, 1]],
      [[1, 1, 1], [1, 0, 1]],
      [[1, 1, 1], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 1]],
    ];
  }

  private generateRandomShape(complexityWeight: number): number[][] {
    const simple = this.simpleShapes();
    const complex = this.complexShapes();
    if (Math.random() < complexityWeight) {
      return complex[Math.floor(Math.random() * complex.length)];
    }
    return simple[Math.floor(Math.random() * simple.length)];
  }

  private injectTitan() {
    for (let r = 0; r < this.shape.length; r++) {
      for (let c = 0; c < this.shape[r].length; c++) {
        if (this.shape[r][c] === 1) {
          this.shape[r][c] = -1;
          return;
        }
      }
    }
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  draw(ctx: CanvasRenderingContext2D, cellSize: number, offsetX: number, offsetY: number) {
    if (!this.shape || this.shape.length === 0) return;

    const normalBlocks: { bx: number; by: number }[] = [];
    const titanBlocks: { bx: number; by: number }[] = [];

    for (let r = 0; r < this.shape.length; r++) {
      for (let c = 0; c < this.shape[r].length; c++) {
        if (this.shape[r][c] !== 0) {
          const blockX = offsetX + c * cellSize;
          const blockY = offsetY + r * cellSize;
          if (this.shape[r][c] === -1) titanBlocks.push({ bx: blockX, by: blockY });
          else normalBlocks.push({ bx: blockX, by: blockY });
        }
      }
    }

    if (normalBlocks.length > 0) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      normalBlocks.forEach(({ bx, by }) => {
        const grad = ctx.createLinearGradient(bx, by, bx + cellSize, by + cellSize);
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, "#ffffff");
        ctx.fillStyle = grad;
        this.drawRoundedRect(ctx, bx + 2, by + 2, cellSize - 4, cellSize - 4, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.moveTo(bx + 6, by + 6);
        ctx.lineTo(bx + cellSize - 12, by + 6);
        ctx.lineTo(bx + 6, by + cellSize - 12);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    if (titanBlocks.length > 0) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ff00ff";
      titanBlocks.forEach(({ bx, by }) => {
        const grad = ctx.createLinearGradient(bx, by, bx + cellSize, by + cellSize);
        grad.addColorStop(0, "#4a00e0");
        grad.addColorStop(1, "#ff00ff");
        ctx.fillStyle = grad;
        this.drawRoundedRect(ctx, bx + 2, by + 2, cellSize - 4, cellSize - 4, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.moveTo(bx + 6, by + 6);
        ctx.lineTo(bx + cellSize - 12, by + 6);
        ctx.lineTo(bx + 6, by + cellSize - 12);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      titanBlocks.forEach(({ bx, by }) => {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx + cellSize / 2, by + cellSize / 2, 5, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
}