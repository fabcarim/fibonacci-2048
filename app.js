const size = 4;
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const overlayEl = document.getElementById('overlay');
const newGameBtn = document.getElementById('new-game');
const restartBtn = document.getElementById('restart');
const undoBtn = document.getElementById('undo');

let grid = [];
let score = 0;
let bestScore = 0;
let history = [];

// Precompute Fibonacci numbers used for merge validation and results.
const fibs = [1, 2];
while (fibs[fibs.length - 1] < 131072) {
  fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]);
}

function getFibIndex(n) {
  return fibs.indexOf(n);
}

function loadBestScore() {
  const stored = localStorage.getItem('fib2048-best');
  bestScore = stored ? parseInt(stored, 10) : 0;
}

function saveBestScore() {
  localStorage.setItem('fib2048-best', bestScore.toString());
}

function createEmptyGrid() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function copyGrid(source) {
  return source.map((row) => [...row]);
}

function canMerge(a, b) {
  if (!a || !b) return false;
  if (a === 1 && b === 1) return true;
  const idxA = getFibIndex(a);
  const idxB = getFibIndex(b);
  if (idxA === -1 || idxB === -1) return false;
  return Math.abs(idxA - idxB) === 1; // consecutive Fibonacci numbers
}

function nextFibAfterMax(a, b) {
  if (a === 1 && b === 1) return 2;
  const larger = Math.max(a, b);
  const idx = getFibIndex(larger);
  // Ensure the Fibonacci sequence is long enough for the next value.
  if (idx === -1 || idx + 1 >= fibs.length) {
    fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]);
    return fibs[fibs.length - 1];
  }
  return fibs[idx + 1];
}

function spawnTile() {
  const emptyCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) {
        emptyCells.push({ r, c });
      }
    }
  }
  if (!emptyCells.length) return false;
  const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  grid[r][c] = Math.random() < 0.75 ? 1 : 2;
  return true;
}

function pushHistory(gridSnapshot, scoreSnapshot) {
  history.push({ grid: copyGrid(gridSnapshot), score: scoreSnapshot });
  if (history.length > 10) {
    history.shift();
  }
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  grid = copyGrid(prev.grid);
  score = prev.score;
  overlayEl.classList.add('hidden');
  render();
}

function processLine(line) {
  const filtered = line.filter((v) => v !== 0);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    const current = filtered[i];
    const next = filtered[i + 1];
    if (next !== undefined && canMerge(current, next)) {
      const mergedValue = nextFibAfterMax(current, next);
      merged.push(mergedValue);
      gained += mergedValue;
      i++; // skip the next value since it was merged
    } else {
      merged.push(current);
    }
  }
  while (merged.length < size) {
    merged.push(0);
  }
  return { line: merged, gained };
}

function move(direction) {
  let moved = false;
  const prevGrid = copyGrid(grid);
  const prevScore = score;
  const newGrid = createEmptyGrid();
  let moveScore = 0;

  if (direction === 'left' || direction === 'right') {
    for (let r = 0; r < size; r++) {
      let line = [...grid[r]];
      if (direction === 'right') line = line.reverse();
      const { line: processedLine, gained } = processLine(line);
      const finalLine = direction === 'right' ? processedLine.reverse() : processedLine;
      moveScore += gained;
      if (!moved && finalLine.some((val, idx) => val !== grid[r][idx])) {
        moved = true;
      }
      newGrid[r] = finalLine;
    }
  } else {
    for (let c = 0; c < size; c++) {
      let line = [];
      for (let r = 0; r < size; r++) line.push(grid[r][c]);
      if (direction === 'down') line = line.reverse();
      const { line: processedLine, gained } = processLine(line);
      const finalLine = direction === 'down' ? processedLine.reverse() : processedLine;
      moveScore += gained;
      for (let r = 0; r < size; r++) {
        if (!moved && finalLine[r] !== grid[r][c]) {
          moved = true;
        }
        newGrid[r][c] = finalLine[r];
      }
    }
  }

  if (moved) {
    pushHistory(prevGrid, prevScore);
    score = prevScore + moveScore;
    grid = newGrid;
    spawnTile();
    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }
    render();
    if (isGameOver()) {
      overlayEl.classList.remove('hidden');
    }
  }

  return { moved };
}

function isGameOver() {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = grid[r][c];
      if (value === 0) return false;
      if (r < size - 1 && canMerge(value, grid[r + 1][c])) return false;
      if (c < size - 1 && canMerge(value, grid[r][c + 1])) return false;
    }
  }
  return true;
}

function initBoardCells() {
  boardEl.innerHTML = '';
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    boardEl.appendChild(cell);
  }
}

function render() {
  scoreEl.textContent = score.toString();
  bestScoreEl.textContent = bestScore.toString();

  const cells = boardEl.children;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const value = grid[r][c];
      const cell = cells[idx];
      cell.textContent = value || '';
      cell.className = 'cell' + (value ? ` tile-${value}` : '');
    }
  }
}

function initGame() {
  loadBestScore();
  grid = createEmptyGrid();
  score = 0;
  history = [];
  overlayEl.classList.add('hidden');
  initBoardCells();
  spawnTile();
  spawnTile();
  render();
}

function handleKeyDown(e) {
  const keyMap = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  const direction = keyMap[e.key];
  if (direction) {
    e.preventDefault();
    move(direction);
  }
}

let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e) {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function handleTouchEnd(e) {
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const threshold = 20; // basic swipe detection threshold
  if (Math.max(absX, absY) < threshold) return;

  if (absX > absY) {
    move(dx > 0 ? 'right' : 'left');
  } else {
    move(dy > 0 ? 'down' : 'up');
  }
}

newGameBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);
undoBtn.addEventListener('click', undo);
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('touchstart', handleTouchStart, { passive: true });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

initGame();
