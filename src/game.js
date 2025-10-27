const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 48;
const WORLD_SCALE = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
const GRAVITY = 2200;
const MAX_SPEED_X = 260;
const JUMP_SPEED = 750;

const levelLayout = [
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  ".................................................M.................M..........",
  "............................B.................................................",
  ".......................B.....................................................",
  "............B.................................................................",
  "..............................................B...............................",
  "....................Q........................................................",
  "............Q................................................................",
  "###########################..###############################..###############"
];

const solids = new Set(["#", "B", "Q"]);

let map = levelLayout.map((row) => row.split(""));

const camera = {
  x: 0,
  y: 0
};

const input = {
  left: false,
  right: false,
  jump: false,
  jumpQueued: false
};

const keys = new Map([
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
  ["a", "left"],
  ["d", "right"],
  ["ArrowUp", "jump"],
  [" ", "jump"],
  ["w", "jump"]
]);

document.addEventListener("keydown", (ev) => {
  const action = keys.get(ev.key);
  if (!action) return;
  if (action === "jump") {
    input.jump = true;
    input.jumpQueued = true;
  } else {
    input[action] = true;
  }
});

document.addEventListener("keyup", (ev) => {
  const action = keys.get(ev.key);
  if (!action) return;
  if (action === "jump") {
    input.jump = false;
  } else {
    input[action] = false;
  }
});

class Entity {
  constructor(x, y, width, height) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.size = { x: width, y: height };
    this.dead = false;
  }

  get left() {
    return this.pos.x;
  }

  get right() {
    return this.pos.x + this.size.x;
  }

  get top() {
    return this.pos.y;
  }

  get bottom() {
    return this.pos.y + this.size.y;
  }
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 36, 48);
    this.big = false;
    this.onGround = false;
    this.color = "#f74b3d";
  }

  setBig(big) {
    if (this.big === big) return;
    const oldHeight = this.size.y;
    this.big = big;
    this.size.y = big ? 72 : 48;
    this.size.x = big ? 42 : 36;
    // Keep the feet planted when changing height
    this.pos.y -= this.size.y - oldHeight;
  }
}

class Enemy extends Entity {
  constructor(x, y) {
    super(x, y, 36, 36);
    this.vel.x = -80;
  }

  update(dt) {
    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.handleHorizontalCollision();

    this.pos.y += this.vel.y * dt;
    this.handleVerticalCollision();

    if (this.bottom > levelLayout.length * TILE_SIZE + 200) {
      this.dead = true;
    }
  }

  handleHorizontalCollision() {
    const tiles = tilesInAABB(this.left, this.top, this.right, this.bottom);
    for (const tile of tiles) {
      if (!tile.solid) continue;
      if (this.vel.x > 0) {
        this.pos.x = tile.x * TILE_SIZE - this.size.x - 0.01;
      } else if (this.vel.x < 0) {
        this.pos.x = tile.x * TILE_SIZE + TILE_SIZE + 0.01;
      }
      this.vel.x *= -1;
    }
  }

  handleVerticalCollision() {
    const tiles = tilesInAABB(this.left, this.top, this.right, this.bottom);
    for (const tile of tiles) {
      if (!tile.solid) continue;
      if (this.vel.y > 0) {
        this.pos.y = tile.y * TILE_SIZE - this.size.y - 0.01;
        this.vel.y = 0;
      } else if (this.vel.y < 0) {
        this.pos.y = tile.y * TILE_SIZE + TILE_SIZE + 0.01;
        this.vel.y = 0;
      }
    }
  }
}

class Mushroom extends Entity {
  constructor(x, y) {
    super(x, y, 32, 32);
    this.vel.x = 60;
  }

  update(dt) {
    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    resolveAxisCollision(this, "x");
    this.pos.y += this.vel.y * dt;
    resolveAxisCollision(this, "y");
    if (this.bottom > levelLayout.length * TILE_SIZE + 200) {
      this.dead = true;
    }
  }
}

const player = new Player(100, 100);
const enemies = [];
const mushrooms = [];


function resetGame() {
  map = levelLayout.map((row) => row.split(""));
  enemies.length = 0;
  mushrooms.length = 0;

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === "M") {
        enemies.push(new Enemy(x * TILE_SIZE, y * TILE_SIZE - 12));
        map[y][x] = ".";
      }
    }
  }

  player.setBig(false);
  player.pos.x = 100;
  player.pos.y = 100;
  player.vel.x = 0;
  player.vel.y = 0;
  player.onGround = false;
  input.jumpQueued = false;
  camera.x = 0;
}

function getWorldWidth() {
  return map[0].length * TILE_SIZE;
}

function updateCamera() {
  const viewWidth = canvas.width / WORLD_SCALE;
  const targetX = player.pos.x - viewWidth / 2 + player.size.x / 2;
  camera.x += (targetX - camera.x) * 0.1;
  const maxCameraX = Math.max(0, getWorldWidth() - viewWidth);
  camera.x = Math.max(0, Math.min(camera.x, maxCameraX));
}

function tilesInAABB(left, top, right, bottom) {
  const tiles = [];
  const x0 = Math.floor(left / TILE_SIZE);
  const y0 = Math.floor(top / TILE_SIZE);
  const x1 = Math.floor((right - 1) / TILE_SIZE);
  const y1 = Math.floor((bottom - 1) / TILE_SIZE);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) continue;
      const char = map[y][x];
      tiles.push({ x, y, char, solid: solids.has(char) });
    }
  }
  return tiles;
}

function resolveAxisCollision(entity, axis) {
  const tiles = tilesInAABB(entity.left, entity.top, entity.right, entity.bottom);
  for (const tile of tiles) {
    if (!tile.solid) continue;
    if (axis === "x") {
      if (entity.vel.x > 0) {
        entity.pos.x = tile.x * TILE_SIZE - entity.size.x - 0.01;
      } else if (entity.vel.x < 0) {
        entity.pos.x = tile.x * TILE_SIZE + TILE_SIZE + 0.01;
      }
      entity.vel.x = 0;
    } else {
      if (entity.vel.y > 0) {
        entity.pos.y = tile.y * TILE_SIZE - entity.size.y - 0.01;
        entity.vel.y = 0;
        if (entity === player) {
          player.onGround = true;
        }
      } else if (entity.vel.y < 0) {
        entity.pos.y = tile.y * TILE_SIZE + TILE_SIZE + 0.01;
        entity.vel.y = 0;
        if (entity === player) {
          hitBlock(tile.x, tile.y);
        }
      }
    }
  }
}

function hitBlock(x, y) {
  const char = map[y][x];
  if (!solids.has(char)) return;
  if (char === "Q") {
    map[y][x] = "x"; // empty box after hitting
    mushrooms.push(new Mushroom(x * TILE_SIZE + 8, y * TILE_SIZE - TILE_SIZE));
  } else if (char === "B") {
    map[y][x] = ".";
  }
}


resetGame();

let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  updatePlayer(dt);


  if (player.bottom > map.length * TILE_SIZE + TILE_SIZE) {
    resetGame();
    return;
  }

  updateCamera();

  for (const enemy of enemies) {
    enemy.update(dt);
  }
  for (const mushroom of mushrooms) {
    mushroom.update(dt);
  }


  if (checkPlayerEnemyCollisions()) {
    return;
  }

  checkPlayerMushroomCollisions();

  cleanupDeadEntities(enemies);
  cleanupDeadEntities(mushrooms);
}

function updatePlayer(dt) {
  let move = 0;
  if (input.left) move -= 1;
  if (input.right) move += 1;
  player.vel.x = move * MAX_SPEED_X;

  player.vel.y += GRAVITY * dt;

  if (input.jumpQueued && player.onGround) {
    player.vel.y = -JUMP_SPEED;
    player.onGround = false;
    input.jumpQueued = false;
  }
  if (!input.jump) {
    input.jumpQueued = false;
    if (player.vel.y < -JUMP_SPEED / 2) {
      player.vel.y = -JUMP_SPEED / 2;
    }
  }

  player.pos.x += player.vel.x * dt;
  resolveAxisCollision(player, "x");


  const worldWidth = getWorldWidth();
  if (player.left < 0) {
    player.pos.x = 0;
  } else if (player.right > worldWidth) {
    player.pos.x = worldWidth - player.size.x;
  }

  player.pos.y += player.vel.y * dt;
  player.onGround = false;
  resolveAxisCollision(player, "y");
}

function cleanupDeadEntities(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].dead) {
      list.splice(i, 1);
    }
  }
}

function checkPlayerEnemyCollisions() {
  for (const enemy of enemies) {
    if (aabbOverlap(player, enemy)) {
      if (player.vel.y > 0 && player.top < enemy.top) {
        // stomp enemy
        enemy.dead = true;
        player.vel.y = -JUMP_SPEED * 0.6;
      } else {

        resetGame();
        return true;
      }
    }
  }
  return false;
}

function checkPlayerMushroomCollisions() {
  for (const mushroom of mushrooms) {
    if (aabbOverlap(player, mushroom)) {
      mushroom.dead = true;
      player.setBig(true);
    }
  }
}

function aabbOverlap(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.save();
  ctx.scale(WORLD_SCALE, WORLD_SCALE);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(-camera.x, 0);

  drawBackground(width, height);
  drawTiles();
  drawPlayerDog(player);
  enemies.forEach((enemy) => drawEntity(enemy, "#4a2f1b"));
  mushrooms.forEach((mushroom) => drawEntity(mushroom, "#ff5f00"));

  ctx.restore();
}

function drawBackground(width, height) {
  ctx.fillStyle = "#8dd0ff";
  ctx.fillRect(camera.x, 0, width, height);
  ctx.fillStyle = "#9be27c";
  ctx.fillRect(camera.x, height - 120, width, 120);
}

function drawTiles() {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tile = map[y][x];
      if (tile === "." || tile === "x") continue;
      const screenX = x * TILE_SIZE;
      const screenY = y * TILE_SIZE;
      if (tile === "#") {
        ctx.fillStyle = "#7c4d2b";
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = "#5d371c";
        ctx.fillRect(screenX + 6, screenY + 6, TILE_SIZE - 12, TILE_SIZE - 12);
      } else if (tile === "B") {
        drawBrick(screenX, screenY);
      } else if (tile === "Q") {
        drawQuestionBlock(screenX, screenY);
      }
    }
  }
}

function drawBrick(x, y) {
  ctx.fillStyle = "#d77b39";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "#9c5321";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.beginPath();
  ctx.moveTo(x, y + TILE_SIZE / 2);
  ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
  ctx.moveTo(x + TILE_SIZE / 2, y);
  ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE);
  ctx.stroke();
}

function drawQuestionBlock(x, y) {
  ctx.fillStyle = "#f9cc3d";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#b57a00";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#b57a00";
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.fillStyle = "#8d5400";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 3);
}

function drawEntity(entity, color) {
  ctx.fillStyle = color;
  ctx.fillRect(entity.pos.x, entity.pos.y, entity.size.x, entity.size.y);
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.strokeRect(entity.pos.x, entity.pos.y, entity.size.x, entity.size.y);
}

function fillRoundedRect(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawPlayerDog(entity) {
  const { x, y } = entity.pos;
  const width = entity.size.x;
  const height = entity.size.y;
  const bodyHeight = height * 0.45;
  const headSize = Math.min(width * 0.7, height * 0.55);
  const legWidth = width * 0.18;
  const legHeight = height * 0.2;

  ctx.save();
  ctx.translate(x, y);

  const furColor = "#a66a2c";
  const earColor = "#8b4f1f";
  const muzzleColor = "#f0d5b2";

  // Tail
  ctx.fillStyle = furColor;
  ctx.beginPath();
  ctx.moveTo(width * 0.85, height - bodyHeight * 0.7);
  ctx.quadraticCurveTo(width * 1.05, height - bodyHeight, width * 0.92, height - bodyHeight * 1.4);
  ctx.lineTo(width * 0.78, height - bodyHeight * 1.05);
  ctx.closePath();
  ctx.fill();

  // Body
  ctx.fillStyle = furColor;
  fillRoundedRect(width * 0.15, height - bodyHeight, width * 0.7, bodyHeight, bodyHeight * 0.4);

  // Belly highlight
  ctx.fillStyle = "rgba(255, 240, 210, 0.7)";
  fillRoundedRect(width * 0.25, height - bodyHeight * 0.85, width * 0.5, bodyHeight * 0.6, bodyHeight * 0.3);

  // Legs
  ctx.fillStyle = furColor;
  for (let i = 0; i < 2; i++) {
    const offset = i === 0 ? width * 0.22 : width * 0.58;
    ctx.fillRect(offset, height - legHeight, legWidth, legHeight);
  }

  // Head
  ctx.fillStyle = furColor;
  ctx.beginPath();
  ctx.arc(width * 0.35, height - bodyHeight, headSize / 2, Math.PI * 0.15, Math.PI * 1.85);
  ctx.fill();

  // Ears
  ctx.fillStyle = earColor;
  ctx.beginPath();
  ctx.ellipse(width * 0.22, height - bodyHeight - headSize * 0.1, headSize * 0.18, headSize * 0.35, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.46, height - bodyHeight - headSize * 0.1, headSize * 0.18, headSize * 0.35, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle
  ctx.fillStyle = muzzleColor;
  ctx.beginPath();
  ctx.ellipse(width * 0.38, height - bodyHeight * 0.75, headSize * 0.32, headSize * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1f1b1a";
  ctx.beginPath();
  ctx.arc(width * 0.3, height - bodyHeight * 0.95, headSize * 0.06, 0, Math.PI * 2);
  ctx.arc(width * 0.41, height - bodyHeight * 0.95, headSize * 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(width * 0.29, height - bodyHeight * 0.97, headSize * 0.025, 0, Math.PI * 2);
  ctx.arc(width * 0.4, height - bodyHeight * 0.97, headSize * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = "#1d1715";
  ctx.beginPath();
  ctx.arc(width * 0.44, height - bodyHeight * 0.74, headSize * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#1d1715";
  ctx.lineWidth = Math.max(1.5, headSize * 0.02);
  ctx.beginPath();
  ctx.arc(width * 0.39, height - bodyHeight * 0.7, headSize * 0.18, Math.PI * 0.15, Math.PI * 0.65);
  ctx.stroke();

  ctx.restore();
}

requestAnimationFrame(gameLoop);

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  ctx.imageSmoothingEnabled = false;
}
