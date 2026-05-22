export class Grid {
  size: number = 10;
  cells: number[][];
  cellSize: number;

  constructor(cellSize: number = 40) {
    this.cellSize = cellSize;
    this.cells = Array.from({ length: 10 }, () => Array(10).fill(0));
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = "rgba(0, 255, 255, 0.05)";
    ctx.lineWidth = 1;

    const normalCells: { x: number; y: number }[] = [];
    const titanCells: { x: number; y: number }[] = [];

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const x = c * this.cellSize;
        const y = r * this.cellSize;
        ctx.strokeRect(x, y, this.cellSize, this.cellSize);
        if (this.cells[r][c] !== 0) {
          if (this.cells[r][c] === -1) titanCells.push({ x, y });
          else normalCells.push({ x, y });
        }
      }
    }

    if (normalCells.length > 0) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#00ffff";
      normalCells.forEach(({ x, y }) => {
        const gradient = ctx.createLinearGradient(x, y, x + this.cellSize, y + this.cellSize);
        gradient.addColorStop(0, "#008080");
        gradient.addColorStop(1, "#00ffff");
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x + 3, y + 3, this.cellSize - 6, this.cellSize - 6, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + this.cellSize - 15, y + 8);
        ctx.lineTo(x + 8, y + this.cellSize - 15);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    if (titanCells.length > 0) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ff00ff";
      titanCells.forEach(({ x, y }) => {
        const gradient = ctx.createLinearGradient(x, y, x + this.cellSize, y + this.cellSize);
        gradient.addColorStop(0, "#4a00e0");
        gradient.addColorStop(1, "#ff00ff");
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x + 3, y + 3, this.cellSize - 6, this.cellSize - 6, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + this.cellSize - 15, y + 8);
        ctx.lineTo(x + 8, y + this.cellSize - 15);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      titanCells.forEach(({ x, y }) => {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 6, 0, Math.PI * 2);
        ctx.stroke();
      });
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

  applyGravity() {
    for (let c = 0; c < this.size; c++) {
      let emptyRow = this.size - 1;
      for (let r = this.size - 1; r >= 0; r--) {
        if (this.cells[r][c] !== 0) {
          const val = this.cells[r][c];
          this.cells[r][c] = 0;
          this.cells[emptyRow][c] = val;
          emptyRow--;
        }
      }
    }
  }

  clearLines(): { points: number; totalCleared: number; destroyedCells: any[] } {
    let rowsToClear: number[] = [];
    let colsToClear: number[] = [];
    let destroyedCells: any[] = [];

    for (let r = 0; r < this.size; r++) {
      if (this.cells[r].every(cell => cell !== 0)) rowsToClear.push(r);
    }
    for (let c = 0; c < this.size; c++) {
      let colFull = true;
      for (let r = 0; r < this.size; r++) {
        if (this.cells[r][c] === 0) { colFull = false; break; }
      }
      if (colFull) colsToClear.push(c);
    }

    let titanPoints = 0;
    const cellsToEmpty = new Set<string>();
    rowsToClear.forEach(r => { for (let c = 0; c < this.size; c++) cellsToEmpty.add(`${r},${c}`); });
    colsToClear.forEach(c => { for (let r = 0; r < this.size; r++) cellsToEmpty.add(`${r},${c}`); });

    cellsToEmpty.forEach(coord => {
      const [r, c] = coord.split(',').map(Number);
      const val = this.cells[r][c];
      destroyedCells.push({ x: c * this.cellSize, y: r * this.cellSize, color: val === -1 ? "#ff00ff" : "#00ffff" });
      if (val === -1) { this.cells[r][c] = 1; titanPoints += 50; }
      else this.cells[r][c] = 0;
    });

    const totalCleared = rowsToClear.length + colsToClear.length;
    let points = totalCleared * 100;
    if (totalCleared >= 2) points *= 2;
    return { points: points + titanPoints, totalCleared, destroyedCells };
  }

  verifica_validitate(shape: number[][], gridX: number, gridY: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const targetR = gridY + r;
          const targetC = gridX + c;
          if (targetR < 0 || targetR >= this.size || targetC < 0 || targetC >= this.size) return false;
          if (this.cells[targetR][targetC] !== 0) return false;
        }
      }
    }
    return true;
  }

  plaseaza_piesa(shape: number[][], gridX: number, gridY: number) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) this.cells[gridY + r][gridX + c] = shape[r][c];
      }
    }
  }

  poate_plasa_orice(piese: any[]): boolean {
    return piese.some(piesa => {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.verifica_validitate(piesa.shape, c, r)) return true;
        }
      }
      return false;
    });
  }

  checkGeometryBonus(): number {
    for (let r = 0; r <= 7; r++) {
      for (let c = 0; c <= 7; c++) {
        let isSquare = true;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            if (this.cells[r + i][c + j] === 0) { isSquare = false; break; }
          }
          if (!isSquare) break;
        }
        if (isSquare) return 500;
      }
    }
    return 0;
  }

  reset() {
    this.cells = Array.from({ length: 10 }, () => Array(10).fill(0));
  }

  // Pre-umple N celule random în jumătatea de jos (rândurile 5–9),
  // garantând că nu blochează complet nicio coloană
  preFill(count: number) {
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < 500) {
      tries++;
      const r = 5 + Math.floor(Math.random() * 5); // doar jumătatea de jos
      const c = Math.floor(Math.random() * this.size);
      if (this.cells[r][c] !== 0) continue;
      // Verifică să nu umplem complet o coloană
      const colFilled = this.cells.filter(row => row[c] !== 0).length;
      if (colFilled >= this.size - 2) continue;
      this.cells[r][c] = 1;
      placed++;
    }
  }
}