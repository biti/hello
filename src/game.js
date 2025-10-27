const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 48;
const WORLD_SCALE = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
const GRAVITY = 2200;
const MAX_SPEED_X = 260;
const JUMP_SPEED = 750;
const BULLET_SPEED = 460;
const FIRE_COOLDOWN = 0.35;
const BOSS_HITS_REQUIRED = 5;
const LEVEL_TRANSITION_DELAY = 1.2;
const VICTORY_MESSAGE_DURATION = 4;

const LEVEL_WIDTH = 120;
function fillRow(pattern) {
  return pattern.length >= LEVEL_WIDTH
    ? pattern.slice(0, LEVEL_WIDTH)
    : pattern.padEnd(LEVEL_WIDTH, ".");
}

const levels = [
  {
    layout: [
      fillRow(""),
      fillRow(""),
      fillRow("...........B.....................Q................B........................."),
      fillRow("......................M.................................B..................."),
      fillRow("....Q......................B..................Q............................."),
      fillRow("...................B.........................M................B............."),
      fillRow(".............M........................B.......................M............."),
      fillRow("....................Q......................B.........................Q......"),
      fillRow(".........B....................Q..........................B.................."),
      fillRow("....M...................B........................M...............B.........."),
      fillRow(".........................B...........Q.........................M............"),
      fillRow("S....B.....M...........B.....Q............M....................F....K......."),
      fillRow("#####################..####################..###########################....")
    ]
  },
  {
    layout: [
      fillRow(""),
      fillRow("...............B.......................B...................B..............."),
      fillRow("..........Q....................Q....................Q......................."),
      fillRow("................M...........M..............M..............................."),
      fillRow("......B................B.......................B................B.........."),
      fillRow("..............Q..................Q.....................Q...................."),
      fillRow("....M..................M....................M..................M..........."),
      fillRow("...................B...................B...................B................"),
      fillRow(".........Q....................Q....................Q....................Q..."),
      fillRow("....B.............B...................B...................B................."),
      fillRow("........M..................M..................M..................M........."),
      fillRow("S.......B....M...........B....Q.......M.............B..............F...K...."),
      fillRow("###########..############..###########..############..####################..")
    ]
  },
  {
    layout: [
      fillRow(""),
      fillRow("........B.........B...........B.........B...........B.........B..........."),
      fillRow("....Q........Q.........Q........Q.........Q........Q.........Q........Q...."),
      fillRow("..........M........M........M........M........M........M........M........."),
      fillRow("......B.........B.........B.........B.........B.........B.........B......."),
      fillRow("....Q........Q........Q........Q........Q........Q........Q........Q......"),
      fillRow("..M.....M.....M.....M.....M.....M.....M.....M.....M.....M.....M.....M....."),
      fillRow("......B.........B.........B.........B.........B.........B.........B......."),
      fillRow("....Q........Q........Q........Q........Q........Q........Q........Q......"),
      fillRow("..B.....B.....B.....B.....B.....B.....B.....B.....B.....B.....B.....B....."),
      fillRow("..M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.M.."),
      fillRow("S..B..M..B..M..B..M..B..M..B..M..B..M..B..M..B..M..B..M..B..M..F..K......."),
      fillRow("########..########..########..########..########..########..############..")
    ]
  }
];

const solids = new Set(["#", "B", "Q"]);

let map = [];
let currentLevelIndex = 0;
let playerSpawn = { x: 100, y: 100 };
let boss = null;
let flag = null;
let pendingAdvance = false;
let transitionTimer = 0;
let celebrationTimer = 0;

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
  if (ev.key === "Enter" && !ev.repeat) {
    attemptFire();
  }

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
    this.facing = 1;
    this.fireCooldown = 0;
  }

  setBig(big) {
    if (this.big === big) return;
    const oldHeight = this.size.y;
    this.big = big;
    this.size.y = big ? 72 : 48;
    this.size.x = big ? 42 : 36;
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

    if (this.bottom > map.length * TILE_SIZE + 200) {
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

class Boss extends Entity {
  constructor(x, y) {
    super(x, y, 60, 72);
    this.vel.x = -90;
    this.health = BOSS_HITS_REQUIRED;
    this.onGround = false;
  }

  takeHit() {
    this.health = Math.max(0, this.health - 1);
    if (this.health === 0) {
      this.dead = true;
    }
  }

  update(dt) {
    if (this.dead) return;
    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.resolveHorizontal();

    this.pos.y += this.vel.y * dt;
    this.onGround = false;
    this.resolveVertical();

    if (this.bottom > map.length * TILE_SIZE + 200) {
      this.dead = true;
    }
  }

  resolveHorizontal() {
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

  resolveVertical() {
    const tiles = tilesInAABB(this.left, this.top, this.right, this.bottom);
    for (const tile of tiles) {
      if (!tile.solid) continue;
      if (this.vel.y > 0) {
        this.pos.y = tile.y * TILE_SIZE - this.size.y - 0.01;
        this.vel.y = 0;
        this.onGround = true;
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
    if (this.bottom > map.length * TILE_SIZE + 200) {
      this.dead = true;
    }
  }
}

class Bullet extends Entity {
  constructor(x, y, direction) {
    super(x, y, 12, 12);
    this.vel.x = BULLET_SPEED * direction;
    this.direction = direction;
  }

  update(dt) {
    this.pos.x += this.vel.x * dt;
    const tiles = tilesInAABB(this.left, this.top, this.right, this.bottom);
    for (const tile of tiles) {
      if (!tile.solid) continue;
      this.dead = true;
      break;
    }
    if (this.pos.x < 0 || this.pos.x > getWorldWidth() + 200) {
      this.dead = true;
    }
  }
}

class Flag {
  constructor(x, y) {
    this.baseX = x + TILE_SIZE / 2;
    this.baseY = y + TILE_SIZE;
    this.height = TILE_SIZE * 4;
    this.progress = 0;
    this.raising = false;
    this.raised = false;
    this.triggeredNext = false;
  }

  raise() {
    if (!this.raising && !this.raised) {
      this.raising = true;
    }
  }

  update(dt) {
    if (this.raising && !this.raised) {
      this.progress += dt / 1.5;
      if (this.progress >= 1) {
        this.progress = 1;
        this.raising = false;
        this.raised = true;
      }
    }
  }

  getFlagY() {
    return this.baseY - this.progress * this.height - TILE_SIZE * 0.6;
  }
}

const player = new Player(100, 100);
const enemies = [];
const mushrooms = [];
const bullets = [];

function loadLevel(index) {
  currentLevelIndex = index;
  const level = levels[index];
  map = level.layout.map((row) => row.split(""));
  enemies.length = 0;
  mushrooms.length = 0;
  bullets.length = 0;
  boss = null;
  flag = null;
  pendingAdvance = false;
  transitionTimer = 0;

  let spawnFound = false;

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const char = map[y][x];
      if (char === "M") {
        enemies.push(new Enemy(x * TILE_SIZE, y * TILE_SIZE - 12));
        map[y][x] = ".";
      } else if (char === "K") {
        boss = new Boss(x * TILE_SIZE - TILE_SIZE / 2, y * TILE_SIZE - 24);
        map[y][x] = ".";
      } else if (char === "S") {
        playerSpawn = { x: x * TILE_SIZE, y: y * TILE_SIZE - player.size.y };
        map[y][x] = ".";
        spawnFound = true;
      } else if (char === "F") {
        flag = new Flag(x * TILE_SIZE, y * TILE_SIZE);
        map[y][x] = ".";
      }
    }
  }

  if (!spawnFound) {
    playerSpawn = { x: 100, y: 100 };
  }

  player.setBig(false);
  player.pos.x = playerSpawn.x;
  player.pos.y = playerSpawn.y;
  player.vel.x = 0;
  player.vel.y = 0;
  player.onGround = false;
  player.fireCooldown = 0;
  input.jumpQueued = false;
  camera.x = 0;
}

function restartFromBeginning() {
  loadLevel(0);
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
    map[y][x] = "x";
    mushrooms.push(new Mushroom(x * TILE_SIZE + 8, y * TILE_SIZE - TILE_SIZE));
  } else if (char === "B") {
    map[y][x] = ".";
  }
}

function attemptFire() {
  if (player.fireCooldown > 0 || pendingAdvance) return;
  const direction = player.facing >= 0 ? 1 : -1;
  const bulletX = player.pos.x + (direction > 0 ? player.size.x : -12);
  const bulletY = player.pos.y + player.size.y * 0.4;
  bullets.push(new Bullet(bulletX, bulletY, direction));
  player.fireCooldown = FIRE_COOLDOWN;
}

loadLevel(0);

let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  updatePlayer(dt);

  if (player.bottom > map.length * TILE_SIZE + TILE_SIZE) {
    restartFromBeginning();
    return;
  }

  updateCamera();

  for (const enemy of enemies) {
    enemy.update(dt);
  }
  if (boss) {
    boss.update(dt);
    if (boss.dead) {
      if (flag) {
        flag.raise();
      } else if (!pendingAdvance) {
        pendingAdvance = true;
        transitionTimer = LEVEL_TRANSITION_DELAY;
      }
    }
  }
  for (const mushroom of mushrooms) {
    mushroom.update(dt);
  }
  for (const bullet of bullets) {
    bullet.update(dt);
  }
  if (flag) {
    flag.update(dt);
  }

  if (checkPlayerEnemyCollisions()) {
    restartFromBeginning();
    return;
  }
  if (checkPlayerBossCollision()) {
    restartFromBeginning();
    return;
  }
  checkPlayerMushroomCollisions();
  handleBulletBossCollisions();

  cleanupDeadEntities(enemies);
  cleanupDeadEntities(mushrooms);
  cleanupDeadEntities(bullets);

  if (flag && flag.raised && !flag.triggeredNext) {
    flag.triggeredNext = true;
    pendingAdvance = true;
    transitionTimer = LEVEL_TRANSITION_DELAY;
  }

  if (pendingAdvance) {
    transitionTimer -= dt;
    if (transitionTimer <= 0) {
      advanceLevel();
    }
  }

  if (celebrationTimer > 0) {
    celebrationTimer = Math.max(0, celebrationTimer - dt);
  }
}

function updatePlayer(dt) {
  let move = 0;
  if (input.left) move -= 1;
  if (input.right) move += 1;
  player.vel.x = move * MAX_SPEED_X;

  if (move !== 0) {
    player.facing = move;
  }

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
        enemy.dead = true;
        player.vel.y = -JUMP_SPEED * 0.6;
      } else {
        return true;
      }
    }
  }
  return false;
}

function checkPlayerBossCollision() {
  if (!boss || boss.dead) return false;
  if (aabbOverlap(player, boss)) {
    if (player.vel.y > 0 && player.top < boss.top + boss.size.y * 0.3) {
      player.vel.y = -JUMP_SPEED * 0.8;
      return false;
    }
    return true;
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

function handleBulletBossCollisions() {
  if (!boss || boss.dead) return;
  for (const bullet of bullets) {
    if (bullet.dead) continue;
    if (aabbOverlap(bullet, boss)) {
      bullet.dead = true;
      boss.takeHit();
    }
  }
}

function advanceLevel() {
  pendingAdvance = false;
  if (currentLevelIndex < levels.length - 1) {
    loadLevel(currentLevelIndex + 1);
  } else {
    celebrationTimer = VICTORY_MESSAGE_DURATION;
    loadLevel(0);
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

  bullets.forEach((bullet) => drawBullet(bullet));
  if (boss && !boss.dead) {
    drawBoss(boss);
  }
  mushrooms.forEach((mushroom) => drawEntity(mushroom, "#ff5f00"));
  if (flag) {
    drawFlag(flag);
  }

  if (celebrationTimer > 0) {
    drawCelebration(width, height);
  }

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
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

  ctx.beginPath();
  ctx.moveTo(x, y + TILE_SIZE / 2);
  ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
  ctx.moveTo(x + TILE_SIZE / 2, y);
  ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE);
  ctx.stroke();
}

function drawQuestionBlock(x, y) {
  ctx.fillStyle = "#f9c74f";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "#d08b37";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
  ctx.fillStyle = "#8b4513";
  ctx.font = `${TILE_SIZE * 0.75}px Impact`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 4);
}

function drawEntity(entity, color) {
  ctx.fillStyle = color;
  ctx.fillRect(entity.pos.x, entity.pos.y, entity.size.x, entity.size.y);
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.strokeRect(entity.pos.x, entity.pos.y, entity.size.x, entity.size.y);
}

function drawBullet(bullet) {
  ctx.fillStyle = "#ffec6e";
  ctx.beginPath();
  ctx.arc(
    bullet.pos.x + bullet.size.x / 2,
    bullet.pos.y + bullet.size.y / 2,
    bullet.size.x / 2,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
}

function drawBoss(bossEntity) {
  ctx.save();
  ctx.translate(bossEntity.pos.x, bossEntity.pos.y);
  ctx.fillStyle = "#4f2f4f";
  fillRoundedRect(0, 0, bossEntity.size.x, bossEntity.size.y, 12);
  ctx.fillStyle = "#ff6b6b";
  const eyeSize = bossEntity.size.x * 0.18;
  ctx.beginPath();
  ctx.arc(bossEntity.size.x * 0.35, bossEntity.size.y * 0.25, eyeSize, 0, Math.PI * 2);
  ctx.arc(bossEntity.size.x * 0.65, bossEntity.size.y * 0.25, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe066";
  ctx.fillRect(
    bossEntity.size.x * 0.2,
    bossEntity.size.y * 0.55,
    bossEntity.size.x * 0.6,
    bossEntity.size.y * 0.25
  );
  ctx.strokeStyle = "#301830";
  ctx.lineWidth = 4;
  ctx.strokeRect(
    bossEntity.size.x * 0.2,
    bossEntity.size.y * 0.55,
    bossEntity.size.x * 0.6,
    bossEntity.size.y * 0.25
  );
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  const barWidth = bossEntity.size.x;
  const barHeight = 10;
  const barX = bossEntity.pos.x;
  const barY = bossEntity.pos.y - 18;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = "#ff4757";
  ctx.fillRect(
    barX,
    barY,
    barWidth * (bossEntity.health / BOSS_HITS_REQUIRED),
    barHeight
  );
  ctx.strokeStyle = "#2f1430";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
}

function drawFlag(flagEntity) {
  const poleX = flagEntity.baseX - 4;
  const poleY = flagEntity.baseY - flagEntity.height;
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(poleX, poleY, 8, flagEntity.height);

  ctx.fillStyle = "#8b5e34";
  ctx.fillRect(poleX - 6, flagEntity.baseY, 20, 8);

  const flagY = flagEntity.getFlagY();
  ctx.fillStyle = flagEntity.raised ? "#ff3b30" : "#ffd54f";
  ctx.beginPath();
  ctx.moveTo(flagEntity.baseX, flagY);
  ctx.lineTo(flagEntity.baseX + TILE_SIZE * 0.9, flagY + TILE_SIZE * 0.3);
  ctx.lineTo(flagEntity.baseX, flagY + TILE_SIZE * 0.6);
  ctx.closePath();
  ctx.fill();
}

function drawCelebration(width, height) {
  ctx.save();
  ctx.resetTransform();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.font = "48px \"Noto Sans SC\", sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("全部通过！继续挑战吧！", width / 2, height / 2);
  ctx.restore();
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

  ctx.fillStyle = furColor;
  ctx.beginPath();
  const tailDirection = entity.facing >= 0 ? 1 : -1;
  ctx.moveTo(width * 0.85, height - bodyHeight * 0.7);
  ctx.quadraticCurveTo(
    width * (1.05 + 0.1 * tailDirection),
    height - bodyHeight,
    width * 0.92,
    height - bodyHeight * 1.4
  );

  ctx.lineTo(width * 0.78, height - bodyHeight * 1.05);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = furColor;
  fillRoundedRect(width * 0.15, height - bodyHeight, width * 0.7, bodyHeight, bodyHeight * 0.4);

  ctx.fillStyle = "rgba(255, 240, 210, 0.7)";
  fillRoundedRect(width * 0.25, height - bodyHeight * 0.85, width * 0.5, bodyHeight * 0.6, bodyHeight * 0.3);

  ctx.fillStyle = furColor;
  for (let i = 0; i < 2; i++) {
    const offset = i === 0 ? width * 0.22 : width * 0.58;
    ctx.fillRect(offset, height - legHeight, legWidth, legHeight);
  }

  ctx.fillStyle = furColor;
  ctx.beginPath();
  ctx.arc(width * 0.35, height - bodyHeight, headSize / 2, Math.PI * 0.15, Math.PI * 1.85);
  ctx.fill();

  ctx.fillStyle = earColor;
  ctx.beginPath();
  ctx.ellipse(width * 0.22, height - bodyHeight - headSize * 0.1, headSize * 0.18, headSize * 0.35, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.46, height - bodyHeight - headSize * 0.1, headSize * 0.18, headSize * 0.35, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = muzzleColor;
  ctx.beginPath();
  ctx.ellipse(width * 0.38, height - bodyHeight * 0.75, headSize * 0.32, headSize * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

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

  ctx.fillStyle = "#1d1715";
  ctx.beginPath();
  ctx.arc(width * 0.44, height - bodyHeight * 0.74, headSize * 0.05, 0, Math.PI * 2);
  ctx.fill();

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
