const COLS = 10;
const ROWS = 20;
const HIGH_SCORE_KEY = 'tetris-high-score';

const PIECES = {
  I: { color: 'cyan', matrix: [[1, 1, 1, 1]] },
  O: { color: 'yellow', matrix: [[1, 1], [1, 1]] },
  T: { color: 'purple', matrix: [[0, 1, 0], [1, 1, 1]] },
  S: { color: 'green', matrix: [[0, 1, 1], [1, 1, 0]] },
  Z: { color: 'red', matrix: [[1, 1, 0], [0, 1, 1]] },
  J: { color: 'blue', matrix: [[1, 0, 0], [1, 1, 1]] },
  L: { color: 'orange', matrix: [[0, 0, 1], [1, 1, 1]] },
};

const SCORE_TABLE = [0, 100, 300, 500, 800];

const gameBoard = document.querySelector('#gameBoard');
const nextPreview = document.querySelector('#nextPreview');
const boardOverlay = document.querySelector('#boardOverlay');
const overlayIcon = document.querySelector('#overlayIcon');
const overlayEyebrow = document.querySelector('#overlayEyebrow');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayDescription = document.querySelector('#overlayDescription');
const overlayScore = document.querySelector('#overlayScore');
const overlayPrimaryButton = document.querySelector('#overlayPrimaryButton');
const overlaySecondaryButton = document.querySelector('#overlaySecondaryButton');
const scoreValue = document.querySelector('#scoreValue');
const bestValue = document.querySelector('#bestValue');
const levelValue = document.querySelector('#levelValue');
const linesValue = document.querySelector('#linesValue');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('.status-dot');
const pauseButton = document.querySelector('#pauseButton');
const headerPauseButton = document.querySelector('#headerPauseButton');
const restartButton = document.querySelector('#restartButton');

const cells = [];
const previewCells = [];
let board = createEmptyBoard();
let currentPiece = null;
let nextPiece = null;
let bag = [];
let score = 0;
let bestScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
let lines = 0;
let level = 1;
let status = 'start';
let dropTimer = null;
let recordBeaten = false;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function createCells(container, count, target) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    fragment.appendChild(cell);
    target.push(cell);
  }
  container.appendChild(fragment);
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function drawType() {
  if (bag.length === 0) bag = shuffle(Object.keys(PIECES));
  return bag.pop();
}

function makePiece(type = drawType()) {
  const definition = PIECES[type];
  return {
    type,
    color: definition.color,
    matrix: cloneMatrix(definition.matrix),
    x: 0,
    y: 0,
  };
}

function resetGame() {
  stopTimer();
  board = createEmptyBoard();
  currentPiece = null;
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  recordBeaten = false;
  nextPiece = makePiece();
  spawnPiece();
  status = 'playing';
  setOverlayVisible(false);
  updateStatus();
  render();
  scheduleDrop();
}

function spawnPiece() {
  currentPiece = nextPiece || makePiece();
  nextPiece = makePiece();
  currentPiece.x = Math.floor((COLS - currentPiece.matrix[0].length) / 2);
  currentPiece.y = 0;
  if (collides(currentPiece)) {
    gameOver();
  }
}

function collides(piece, x = piece.x, y = piece.y, matrix = piece.matrix) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[row].length; column += 1) {
      if (!matrix[row][column]) continue;
      const boardX = x + column;
      const boardY = y + row;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
      if (boardY >= 0 && board[boardY][boardX]) return true;
    }
  }
  return false;
}

function movePiece(dx, dy) {
  if (status !== 'playing' || !currentPiece) return false;
  if (collides(currentPiece, currentPiece.x + dx, currentPiece.y + dy)) return false;
  currentPiece.x += dx;
  currentPiece.y += dy;
  render();
  return true;
}

function softDrop(isManual = false) {
  if (status !== 'playing') return;
  if (movePiece(0, 1)) {
    if (isManual) {
      score += 1;
      updateStats();
    }
    return;
  }
  lockPiece();
}

function hardDrop() {
  if (status !== 'playing' || !currentPiece) return;
  let distance = 0;
  while (movePiece(0, 1)) distance += 1;
  score += distance * 2;
  updateStats();
  lockPiece();
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse());
}

function rotatePiece() {
  if (status !== 'playing' || !currentPiece) return;
  const rotated = rotateMatrix(currentPiece.matrix);
  const wallKicks = [0, -1, 1, -2, 2];
  const validX = wallKicks.find((offset) => !collides(currentPiece, currentPiece.x + offset, currentPiece.y, rotated));
  if (validX === undefined) return;
  currentPiece.matrix = rotated;
  currentPiece.x += validX;
  render();
}

function mergePiece() {
  currentPiece.matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!value) return;
      const boardY = currentPiece.y + rowIndex;
      const boardX = currentPiece.x + columnIndex;
      if (boardY >= 0) board[boardY][boardX] = currentPiece.color;
    });
  });
}

function lockPiece() {
  if (status !== 'playing') return;
  mergePiece();
  const cleared = clearLines();
  if (cleared > 0) {
    lines += cleared;
    score += SCORE_TABLE[cleared];
    level = Math.floor(lines / 10) + 1;
  }
  updateStats();
  spawnPiece();
  render();
  if (status === 'playing') scheduleDrop();
}

function clearLines() {
  const remainingRows = board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - remainingRows.length;
  if (cleared === 0) return 0;
  board = [...Array.from({ length: cleared }, () => Array(COLS).fill(null)), ...remainingRows];
  return cleared;
}

function getGhostY() {
  if (!currentPiece) return 0;
  let ghostY = currentPiece.y;
  while (!collides(currentPiece, currentPiece.x, ghostY + 1)) ghostY += 1;
  return ghostY;
}

function render() {
  const visible = board.map((row) => [...row]);
  const ghostY = getGhostY();
  if (currentPiece) {
    currentPiece.matrix.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (!value) return;
        const ghostRow = ghostY + rowIndex;
        const ghostColumn = currentPiece.x + columnIndex;
        if (ghostRow >= 0 && ghostRow < ROWS && ghostColumn >= 0 && ghostColumn < COLS && !visible[ghostRow][ghostColumn]) {
          visible[ghostRow][ghostColumn] = `ghost-${currentPiece.color}`;
        }
      });
    });
    currentPiece.matrix.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (!value) return;
        const boardY = currentPiece.y + rowIndex;
        const boardX = currentPiece.x + columnIndex;
        if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) visible[boardY][boardX] = currentPiece.color;
      });
    });
  }
  visible.flat().forEach((color, index) => {
    const cell = cells[index];
    cell.className = 'cell';
    if (!color) return;
    if (color.startsWith('ghost-')) {
      cell.classList.add('cell--ghost', `cell--ghost-${color.replace('ghost-', '')}`);
      return;
    }
    cell.classList.add('cell--filled', `cell--${color}`);
  });
  renderPreview();
}

function renderPreview() {
  previewCells.forEach((cell) => { cell.className = 'cell'; });
  if (!nextPiece) return;
  const offsetX = Math.floor((4 - nextPiece.matrix[0].length) / 2);
  const offsetY = Math.floor((4 - nextPiece.matrix.length) / 2);
  nextPiece.matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!value) return;
      const previewIndex = (offsetY + rowIndex) * 4 + offsetX + columnIndex;
      if (previewCells[previewIndex]) previewCells[previewIndex].classList.add('cell--filled', `cell--${nextPiece.color}`);
    });
  });
}

function updateStats() {
  if (score > bestScore) {
    bestScore = score;
    recordBeaten = true;
    localStorage.setItem(HIGH_SCORE_KEY, String(bestScore));
  }
  scoreValue.textContent = score.toLocaleString('ko-KR');
  bestValue.textContent = bestScore.toLocaleString('ko-KR');
  levelValue.textContent = level;
  linesValue.textContent = lines;
}

function updateStatus() {
  const labels = { start: '준비', playing: '플레이 중', paused: '일시정지', gameover: '게임 오버' };
  statusText.textContent = labels[status];
  statusDot.classList.toggle('is-paused', status === 'paused');
  statusDot.classList.toggle('is-over', status === 'gameover');
  const canPause = status === 'playing' || status === 'paused';
  pauseButton.disabled = !canPause;
  headerPauseButton.disabled = !canPause;
  pauseButton.innerHTML = status === 'paused' ? '<span>▶</span> 계속하기' : '<span>Ⅱ</span> 일시정지';
}

function setOverlayVisible(visible) {
  boardOverlay.hidden = !visible;
}

function showStartOverlay() {
  overlayIcon.textContent = '✦';
  overlayEyebrow.textContent = 'READY WHEN YOU ARE';
  overlayTitle.textContent = '블록을 쌓아보세요';
  overlayDescription.innerHTML = '가로줄을 완성하면 줄이 사라집니다.<br />빈틈 없이, 오래 살아남아 보세요.';
  overlayScore.hidden = true;
  overlayPrimaryButton.textContent = '게임 시작';
  overlaySecondaryButton.hidden = true;
  setOverlayVisible(true);
}

function showPauseOverlay() {
  overlayIcon.textContent = 'Ⅱ';
  overlayEyebrow.textContent = 'TAKE A BREATH';
  overlayTitle.textContent = '잠시 멈췄어요';
  overlayDescription.innerHTML = '준비가 되면 계속하기를 눌러<br />블록 쌓기를 이어가세요.';
  overlayScore.hidden = true;
  overlayPrimaryButton.textContent = '계속하기';
  overlaySecondaryButton.textContent = '새 게임';
  overlaySecondaryButton.hidden = false;
  setOverlayVisible(true);
}

function showGameOverOverlay() {
  overlayIcon.textContent = '✦';
  overlayEyebrow.textContent = recordBeaten ? 'NEW PERSONAL BEST' : 'NICE TRY';
  overlayTitle.textContent = '게임 오버';
  overlayDescription.textContent = recordBeaten ? '새로운 최고 기록을 만들었어요!' : '다시 도전해서 기록을 높여보세요.';
  overlayScore.innerHTML = `SCORE&nbsp;&nbsp; ${score.toLocaleString('ko-KR')}<br />LINES&nbsp;&nbsp; ${lines}`;
  overlayScore.hidden = false;
  overlayPrimaryButton.textContent = '다시 시작';
  overlaySecondaryButton.hidden = true;
  setOverlayVisible(true);
}

function togglePause() {
  if (status === 'playing') {
    status = 'paused';
    stopTimer();
    showPauseOverlay();
  } else if (status === 'paused') {
    status = 'playing';
    setOverlayVisible(false);
    scheduleDrop();
  }
  updateStatus();
}

function gameOver() {
  status = 'gameover';
  stopTimer();
  updateStats();
  showGameOverOverlay();
  updateStatus();
}

function dropInterval() {
  return Math.max(90, 750 - (level - 1) * 60);
}

function scheduleDrop() {
  stopTimer();
  if (status !== 'playing') return;
  dropTimer = window.setTimeout(() => {
    softDrop(false);
    if (status === 'playing') scheduleDrop();
  }, dropInterval());
}

function stopTimer() {
  if (dropTimer !== null) {
    window.clearTimeout(dropTimer);
    dropTimer = null;
  }
}

function startFromOverlay() {
  if (status === 'paused') {
    togglePause();
    return;
  }
  resetGame();
}

function handleAction(action) {
  if (action === 'left') movePiece(-1, 0);
  if (action === 'right') movePiece(1, 0);
  if (action === 'down') softDrop(true);
  if (action === 'rotate') rotatePiece();
  if (action === 'drop') hardDrop();
  if (status === 'playing') scheduleDrop();
}

createCells(gameBoard, COLS * ROWS, cells);
createCells(nextPreview, 16, previewCells);
updateStats();
showStartOverlay();
updateStatus();
render();

overlayPrimaryButton.addEventListener('click', startFromOverlay);
overlaySecondaryButton.addEventListener('click', resetGame);
pauseButton.addEventListener('click', togglePause);
headerPauseButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', resetGame);

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (status === 'start' || status === 'gameover')) {
    event.preventDefault();
    resetGame();
    return;
  }
  if (event.key.toLowerCase() === 'p' || event.key === 'Escape') {
    if (status === 'playing' || status === 'paused') {
      event.preventDefault();
      togglePause();
    }
    return;
  }
  if (status !== 'playing') return;
  const actions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  handleAction(action);
});
