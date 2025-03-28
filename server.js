const WebSocket = require('ws');
const wss = new WebSocket.Server({ host: '192.168.0.103', port: 8080 });

let players = [];
let boards = [];
let ships = [];
let currentTurn = 0;

function placeShips(board, shipSizes) {
  const boardSize = 10;
  const placedShips = [];
  shipSizes.forEach(size => {
    let placed = false;
    while (!placed) {
      const isHorizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * boardSize);
      const col = Math.floor(Math.random() * boardSize);
      if (canPlaceShip(board, row, col, size, isHorizontal)) {
        const ship = { size, cells: [], sunk: false };
        for (let i = 0; i < size; i++) {
          if (isHorizontal) {
            board[row][col + i] = 1;
            ship.cells.push(row * boardSize + col + i);
          } else {
            board[row + i][col] = 1;
            ship.cells.push((row + i) * boardSize + col);
          }
        }
        placedShips.push(ship);
        placed = true;
      }
    }
  });
  return placedShips;
}

function canPlaceShip(board, row, col, size, isHorizontal) {
  const boardSize = 10;
  if (isHorizontal) {
    if (col + size > boardSize) return false;
    for (let i = 0; i < size; i++) {
      if (board[row][col + i] !== 0 || isAdjacentOccupied(board, row, col + i)) return false;
    }
  } else {
    if (row + size > boardSize) return false;
    for (let i = 0; i < size; i++) {
      if (board[row + i][col] !== 0 || isAdjacentOccupied(board, row + i, col)) return false;
    }
  }
  return true;
}

function isAdjacentOccupied(board, row, col) {
  const boardSize = 10;
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      const newRow = row + r;
      const newCol = col + c;
      if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
        if (board[newRow][newCol] !== 0) return true;
      }
    }
  }
  return false;
}

wss.on('connection', (ws) => {
  console.log('Игрок подключился');

  const playerId = players.length;
  players.push(ws);
  boards[playerId] = Array(10).fill().map(() => Array(10).fill(0));
  ships[playerId] = placeShips(boards[playerId], [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]);
  ws.send(JSON.stringify({ type: 'player', id: playerId, ships: ships[playerId] }));

  if (players.length === 2) {
    currentTurn = 0;
    players[0].send(JSON.stringify({ type: 'start', turn: true }));
    players[1].send(JSON.stringify({ type: 'start', turn: false }));
  }

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'shot' && players.length === 2) {
      if (data.player !== currentTurn) return;

      const opponentId = data.player === 0 ? 1 : 0;
      const row = data.row;
      const col = data.col;

      let hit = false;
      if (boards[opponentId][row][col] === 1) {
        hit = true;
        boards[opponentId][row][col] = 2;
        players[opponentId].send(JSON.stringify({ type: 'hit', row, col }));
        players[data.player].send(JSON.stringify({ type: 'result', row, col, hit: true }));

        const sunkShip = checkShipSunk(opponentId, row, col);
        if (sunkShip) {
          const deadZone = calculateDeadZone(sunkShip);
          console.log('Корабль потоплен, deadZone:', deadZone);
          players[data.player].send(JSON.stringify({ type: 'sunk', cells: sunkShip.cells, deadZone }));
          players[opponentId].send(JSON.stringify({ type: 'sunk', cells: sunkShip.cells }));
        }
      } else if (boards[opponentId][row][col] === 0) {
        boards[opponentId][row][col] = -1;
        players[opponentId].send(JSON.stringify({ type: 'miss', row, col }));
        players[data.player].send(JSON.stringify({ type: 'result', row, col, hit: false }));
      }

      if (hit) {
        players[data.player].send(JSON.stringify({ type: 'turn', yourTurn: true }));
        players[opponentId].send(JSON.stringify({ type: 'turn', yourTurn: false }));
      } else {
        currentTurn = opponentId;
        players[data.player].send(JSON.stringify({ type: 'turn', yourTurn: false }));
        players[opponentId].send(JSON.stringify({ type: 'turn', yourTurn: true }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Игрок отключился');
    players = players.filter(p => p !== ws);
    boards = [];
    ships = [];
    currentTurn = 0;
    if (players.length > 0) {
      players[0].send(JSON.stringify({ type: 'error', message: 'Противник отключился. Ожидание нового игрока...' }));
    }
  });
});

function checkShipSunk(playerId, row, col) {
  const index = row * 10 + col;
  for (const ship of ships[playerId]) {
    if (ship.cells.includes(index) && !ship.sunk) {
      const allHit = ship.cells.every(i => {
        const r = Math.floor(i / 10);
        const c = i % 10;
        return boards[playerId][r][c] === 2;
      });
      if (allHit) {
        ship.sunk = true;
        return ship;
      }
    }
  }
  return null;
}

function calculateDeadZone(ship) {
  const deadZone = new Set();
  const boardSize = 10;

  ship.cells.forEach(index => {
    const row = Math.floor(index / boardSize);
    const col = index % boardSize;

    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        const newRow = row + r;
        const newCol = col + c;
        if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
          const newIndex = newRow * boardSize + newCol;
          if (!ship.cells.includes(newIndex)) {
            deadZone.add(JSON.stringify({ row: newRow, col: newCol }));
          }
        }
      }
    }
  });

  return Array.from(deadZone).map(item => JSON.parse(item));
}

console.log('Сервер запущен на 192.168.0.103:8080');
