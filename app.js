const size = 4;
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const bestLabelEl = document.getElementById('best-label');
const overlayEl = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const newGameBtn = document.getElementById('new-game');
const restartBtn = document.getElementById('restart');
const undoBtn = document.getElementById('undo');
const timerBox = document.getElementById('timer-box');
const timerEl = document.getElementById('timer');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const modeNameEl = document.getElementById('mode-name');
const modeNoteEl = document.getElementById('mode-note');

let grid = [];
let score = 0;
let bestScore = 0;
let history = [];
let currentMode = 'classic';
let gameOver = false;
let timerId = null;
let timeRemaining = 0;

// Precompute Fibonacci numbers for merge validation and results.
const fibs = [1, 2];
while (fibs[fibs.length - 1] < 131072) {
  fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]);
}

// Prime utilities for prime mode.
const primes = [2, 3];
function extendPrimesUpTo(n) {
  let last = primes[primes.length - 1];
  while (last < n) {
    let candidate = last + 1;
    // simple primality check is fine for small numbers here
    while (!isPrime(candidate)) candidate++;
    primes.push(candidate);
    last = candidate;
  }
}

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function nextPrimeAfter(n) {
  extendPrimesUpTo(n + 100); // ensure list is long enough
  let candidate = n + 1;
  while (!isPrime(candidate)) candidate++;
  return candidate;
}

function getFibIndex(n) {
  return fibs.indexOf(n);
}

function createEmptyGrid() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function copyGrid(source) {
  return source.map((row) => [...row]);
}

function spawnValue(values) {
  const roll = Math.random();
  let cumulative = 0;
  for (const option of values) {
    cumulative += option.prob;
    if (roll <= cumulative) return option.value;
  }
  return values[values.length - 1].value;
}

const modes = {
  classic: {
    label: 'Classica',
    description: 'Regola 2048 classica con tessere 2/4.',
    timer: null,
    spawn: () => spawnValue([
      { value: 2, prob: 0.9 },
      { value: 4, prob: 0.1 },
    ]),
    canMerge: (a, b) => a !== 0 && a === b,
    merge: (a, b) => a + b,
  },
  timed: {
    label: 'A tempo',
    description: 'Stesse regole classiche ma con conto alla rovescia.',
    timer: 120,
    spawn: () => spawnValue([
      { value: 2, prob: 0.9 },
      { value: 4, prob: 0.1 },
    ]),
    canMerge: (a, b) => a !== 0 && a === b,
    merge: (a, b) => a + b,
  },
  fibonacci: {
    label: 'Fibonacci',
    description: 'Solo fusioni tra numeri consecutivi di Fibonacci (1+1 permesso).',
    timer: null,
    spawn: () => spawnValue([
      { value: 1, prob: 0.75 },
      { value: 2, prob: 0.25 },
    ]),
    canMerge: (a, b) => {
      if (!a || !b) return false;
      if (a === 1 && b === 1) return true;
      const idxA = getFibIndex(a);
      const idxB = getFibIndex(b);
      if (idxA === -1 || idxB === -1) return false;
      return Math.abs(idxA - idxB) === 1;
    },
    merge: (a, b) => {
      if (a === 1 && b === 1) return 2;
      const larger = Math.max(a, b);
      const idx = getFibIndex(larger);
      if (idx === -1 || idx + 1 >= fibs.length) {
        fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]);
        return fibs[fibs.length - 1];
      }
      return fibs[idx + 1];
    },
  },
  prime: {
    label: 'Primi',
    description: 'Fondi solo numeri primi consecutivi (2+2 → 3 per iniziare).',
    timer: null,
    spawn: () => spawnValue([
      { value: 2, prob: 0.7 },
      { value: 3, prob: 0.3 },
    ]),
    canMerge: (a, b) => {
      if (!a || !b) return false;
      if (a === 2 && b === 2) return true; // allow start of chain
      if (!isPrime(a) || !isPrime(b)) return false;
      extendPrimesUpTo(Math.max(a, b) + 20);
      const idxA = primes.indexOf(a);
      const idxB = primes.indexOf(b);
      return Math.abs(idxA - idxB) === 1;
    },
    merge: (a, b) => {
      if (a === 2 && b === 2) return 3;
      const larger = Math.max(a, b);
      return nextPrimeAfter(larger);
    },
  },
};

function loadBestScore() {
  const key = `variant-best-${currentMode}`;
  const stored = localStorage.getItem(key);
  bestScore = stored ? parseInt(stored, 10) : 0;
  bestScoreEl.textContent = bestScore.toString();
  bestLabelEl.textContent = `Best (${modes[currentMode].label})`;
}

function updateModeMeta() {
  const mode = modes[currentMode];
  modeNameEl.textContent = mode.label;
  modeNoteEl.textContent = mode.description;
}

function saveBestScore() {
  const key = `variant-best-${currentMode}`;
  localStorage.setItem(key, bestScore.toString());
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
  grid[r][c] = modes[currentMode].spawn();
  return true;
}

function pushHistory(gridSnapshot, scoreSnapshot) {
  history.push({ grid: copyGrid(gridSnapshot), score: scoreSnapshot });
  if (history.length > 10) {
    history.shift();
  }
}

function undo() {
  if (gameOver) return;
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
    if (next !== undefined && modes[currentMode].canMerge(current, next)) {
      const mergedValue = modes[currentMode].merge(current, next);
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
  if (gameOver) return { moved: false };
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
      endGame('Game Over', 'Non ci sono più mosse.');
    }
  }

  return { moved };
}

function isGameOver() {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = grid[r][c];
      if (value === 0) return false;
      if (r < size - 1 && modes[currentMode].canMerge(value, grid[r + 1][c])) return false;
      if (c < size - 1 && modes[currentMode].canMerge(value, grid[r][c + 1])) return false;
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

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startTimer(seconds) {
  stopTimer();
  timeRemaining = seconds;
  timerBox.classList.remove('hidden');
  timerEl.textContent = `${timeRemaining}s`;
  timerId = setInterval(() => {
    timeRemaining -= 1;
    timerEl.textContent = `${timeRemaining}s`;
    if (timeRemaining <= 0) {
      stopTimer();
      endGame('Tempo scaduto', 'Il tempo è finito.');
    }
  }, 1000);
}

function hideTimer() {
  stopTimer();
  timerBox.classList.add('hidden');
  timerEl.textContent = '--';
}

function endGame(title, message) {
  stopTimer();
  gameOver = true;
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlayEl.classList.remove('hidden');
}

function initGame() {
  stopTimer();
  gameOver = false;
  loadBestScore();
  updateModeMeta();
  grid = createEmptyGrid();
  score = 0;
  history = [];
  overlayEl.classList.add('hidden');
  initBoardCells();
  spawnTile();
  spawnTile();
  render();
  if (modes[currentMode].timer) {
    startTimer(modes[currentMode].timer);
  } else {
    hideTimer();
  }
}

function switchMode(newMode) {
  currentMode = newMode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === newMode);
  });
  initGame();
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

newGameBtn.addEventListener('click', () => initGame());
restartBtn.addEventListener('click', () => initGame());
undoBtn.addEventListener('click', () => undo());
modeButtons.forEach((btn) => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('touchstart', handleTouchStart, { passive: true });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

// start default mode
switchMode(currentMode);
