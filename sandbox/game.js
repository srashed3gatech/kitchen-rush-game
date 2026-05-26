// =====================================================================
//  KITCHEN RUSH  —  Complete Game Logic
// =====================================================================

'use strict';

// ── Canvas ────────────────────────────────────────────────────────────
const CW = 900;   // canvas width
const CH = 530;   // canvas height  (panel + hud above)
const GAME_DURATION = 180; // seconds

// ── Item Database ─────────────────────────────────────────────────────
const ITEMS = {
  // Raw ingredients
  LETTUCE : { id:'LETTUCE',  name:'Lettuce',        emoji:'🥬', badge:'',   type:'raw' },
  TOMATO  : { id:'TOMATO',   name:'Tomato',          emoji:'🍅', badge:'',   type:'raw' },
  MEAT    : { id:'MEAT',     name:'Meat',            emoji:'🥩', badge:'',   type:'raw' },
  CHEESE  : { id:'CHEESE',   name:'Cheese',          emoji:'🧀', badge:'',   type:'raw' },
  BREAD   : { id:'BREAD',    name:'Bread',           emoji:'🍞', badge:'',   type:'raw' },
  // Processed
  CHOPPED_LETTUCE : { id:'CHOPPED_LETTUCE', name:'Chopped Lettuce', emoji:'🥬', badge:'✂️', type:'processed' },
  CHOPPED_TOMATO  : { id:'CHOPPED_TOMATO',  name:'Chopped Tomato',  emoji:'🍅', badge:'✂️', type:'processed' },
  COOKED_MEAT     : { id:'COOKED_MEAT',     name:'Cooked Meat',     emoji:'🥩', badge:'🔥', type:'processed' },
  COOKED_CHEESE   : { id:'COOKED_CHEESE',   name:'Cooked Cheese',   emoji:'🧀', badge:'🔥', type:'processed' },
  // Dishes
  SALAD         : { id:'SALAD',         name:'Salad',         emoji:'🥗', badge:'', type:'dish' },
  BURGER        : { id:'BURGER',        name:'Burger',        emoji:'🍔', badge:'', type:'dish' },
  GRILLED_CHEESE: { id:'GRILLED_CHEESE',name:'Grilled Cheese',emoji:'🫓', badge:'', type:'dish' },
  PIZZA         : { id:'PIZZA',         name:'Pizza',         emoji:'🍕', badge:'', type:'dish' },
};

// ── Processing rules  (what raw → where → how long → what result) ─────
const PROCESSES = {
  LETTUCE : { station:'CUTTING', time:2.0, result:'CHOPPED_LETTUCE' },
  TOMATO  : { station:'CUTTING', time:2.0, result:'CHOPPED_TOMATO'  },
  MEAT    : { station:'STOVE',   time:3.0, result:'COOKED_MEAT'     },
  CHEESE  : { station:'STOVE',   time:3.0, result:'COOKED_CHEESE'   },
};

// ── Recipes ───────────────────────────────────────────────────────────
const RECIPES = [
  { id:'SALAD',          emoji:'🥗', name:'Salad',         ingredients:['CHOPPED_LETTUCE','CHOPPED_TOMATO'],             timeLimit:65,  points:80  },
  { id:'BURGER',         emoji:'🍔', name:'Burger',        ingredients:['COOKED_MEAT','CHOPPED_LETTUCE','BREAD'],         timeLimit:95,  points:130 },
  { id:'GRILLED_CHEESE', emoji:'🫓', name:'Grilled Cheese',ingredients:['COOKED_CHEESE','BREAD'],                        timeLimit:60,  points:100 },
  { id:'PIZZA',          emoji:'🍕', name:'Pizza',         ingredients:['COOKED_MEAT','CHOPPED_TOMATO','COOKED_CHEESE'], timeLimit:115, points:160 },
];

// Quick lookup: recipe id → recipe object
const RECIPE_MAP = Object.fromEntries(RECIPES.map(r => [r.id, r]));

// Display string for an ingredient id
function ingDisplay(id) {
  const i = ITEMS[id];
  return i ? (i.badge + i.emoji) : id;
}

// ── Helpers ───────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh, margin=0) {
  return ax < bx+bw+margin && ax+aw > bx-margin &&
         ay < by+bh+margin && ay+ah > by-margin;
}

// ── Station ───────────────────────────────────────────────────────────
class Station {
  constructor(type, x, y, w, h) {
    this.type = type;
    this.x = x; this.y = y; this.w = w; this.h = h;
    // processing state
    this.slot       = null;   // item currently in / on station
    this.processing = false;
    this.procTimer  = 0;
    this.procTime   = 0;
    this.procResult = null;
    // assembly items list (ASSEMBLY only)
    this.pile = [];
    // glow when ready
    this.glow = 0;  // countdown timer
  }

  get cx() { return this.x + this.w/2; }
  get cy() { return this.y + this.h/2; }

  update(dt) {
    if (this.processing) {
      this.procTimer += dt;
      if (this.procTimer >= this.procTime) {
        this.processing = false;
        this.slot       = { ...ITEMS[this.procResult] };
        this.glow       = 2.5;
      }
    }
    if (this.glow > 0) this.glow -= dt;
  }

  startProcessing(item) {
    const rule = PROCESSES[item.id];
    this.slot       = item;
    this.processing = true;
    this.procTimer  = 0;
    this.procTime   = rule.time;
    this.procResult = rule.result;
    this.glow       = 0;
  }

  // Is the player close enough to interact?
  isNear(px, py, pw, ph) {
    return rectsOverlap(px, py, pw, ph, this.x, this.y, this.w, this.h, 18);
  }

  // ── Drawing ──────────────────────────────────────────────────────
  draw(ctx) {
    ctx.save();

    // Glow shadow
    if (this.glow > 0) {
      const alpha = clamp(this.glow / 1.5, 0, 1);
      ctx.shadowColor  = '#FFD700';
      ctx.shadowBlur   = 18 * alpha;
    }

    // Station body
    roundRect(ctx, this.x, this.y, this.w, this.h, 10);
    ctx.fillStyle = this._bodyColor();
    ctx.fill();
    ctx.strokeStyle = this._borderColor();
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Station icon + label
    this._drawIcon(ctx);

    // Progress bar (processing stations)
    if (this.processing) {
      const pct = this.procTimer / this.procTime;
      const bx = this.x + 6, by = this.y + this.h - 12, bw = this.w - 12, bh = 7;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, bx, by, bw, bh, 3);
      ctx.fill();
      ctx.fillStyle = '#4FC3F7';
      roundRect(ctx, bx, by, bw * pct, bh, 3);
      ctx.fill();
    }

    // Item sitting on station (done processing or just placed)
    if (this.slot && !this.processing) {
      ctx.font = '15px serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(this.slot.emoji + this.slot.badge, this.x + this.w - 3, this.y + 3);
    }

    // Assembly pile
    if (this.type === 'ASSEMBLY' && this.pile.length) {
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const startX = this.cx - ((this.pile.length - 1) * 11);
      for (let i = 0; i < this.pile.length; i++) {
        ctx.fillText(this.pile[i].emoji + this.pile[i].badge, startX + i*22, this.y + this.h - 13);
      }
    }

    ctx.restore();
  }

  _bodyColor() {
    const map = {
      LETTUCE :'#1a3a18', TOMATO:'#3a1010', MEAT:'#2e1505',
      CHEESE  :'#322700', BREAD :'#2a1a00',
      CUTTING :'#0c2a40', STOVE :'#3a1400',
      ASSEMBLY:'#1a1240', SERVE :'#0c2a18',
    };
    return map[this.type] || '#222';
  }

  _borderColor() {
    if (this.processing)           return '#4FC3F7';
    if (this.slot && !this.processing) return '#4CAF50';
    const map = {
      LETTUCE :'#4CAF50', TOMATO:'#EF5350', MEAT:'#FF8F00',
      CHEESE  :'#FDD835', BREAD :'#FF8F00',
      CUTTING :'#42A5F5', STOVE :'#FF5722',
      ASSEMBLY:'#AB47BC', SERVE :'#66BB6A',
    };
    return map[this.type] || '#555';
  }

  _drawIcon(ctx) {
    const emojis = {
      LETTUCE:'🥬', TOMATO:'🍅', MEAT:'🥩', CHEESE:'🧀', BREAD:'🍞',
      CUTTING:'🔪', STOVE:'🍳', ASSEMBLY:'🍽️', SERVE:'🪟',
    };
    const labels = {
      LETTUCE:'LETTUCE', TOMATO:'TOMATO', MEAT:'MEAT', CHEESE:'CHEESE', BREAD:'BREAD',
      CUTTING:'CHOP', STOVE:'COOK', ASSEMBLY:'ASSEMBLE', SERVE:'SERVE',
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Big emoji
    const emojiSize = Math.min(this.w, this.h) * 0.36;
    ctx.font = `${emojiSize}px serif`;
    ctx.fillText(emojis[this.type] || '?', this.cx, this.cy - 7);

    // Small label
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(labels[this.type] || this.type, this.cx, this.y + this.h - 8);
  }
}

// ── Player ────────────────────────────────────────────────────────────
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 38; this.h = 42;
    this.speed   = 210;
    this.held    = null;  // item being carried
    this.walkT   = 0;     // walk animation timer
    this.moving  = false;
  }

  get cx() { return this.x + this.w/2; }
  get cy() { return this.y + this.h/2; }

  update(dt, input, stations) {
    let dx = 0, dy = 0;
    if (input.left)  dx -= 1;
    if (input.right) dx += 1;
    if (input.up)    dy -= 1;
    if (input.down)  dy += 1;

    this.moving = (dx !== 0 || dy !== 0);
    if (this.moving) {
      const mag = Math.sqrt(dx*dx + dy*dy);
      dx /= mag; dy /= mag;

      const nx = this.x + dx * this.speed * dt;
      const ny = this.y + dy * this.speed * dt;

      if (this._canMoveTo(nx, this.y, stations)) this.x = nx;
      if (this._canMoveTo(this.x, ny, stations)) this.y = ny;

      this.x = clamp(this.x, 0, CW - this.w);
      this.y = clamp(this.y, 0, CH - this.h);

      this.walkT += dt * 10;
    }
  }

  _canMoveTo(nx, ny, stations) {
    for (const s of stations) {
      if (rectsOverlap(nx, ny, this.w, this.h, s.x, s.y, s.w, s.h, -3)) return false;
    }
    return true;
  }

  draw(ctx) {
    const cx = this.cx;
    const cy = this.cy;
    const bob = this.moving ? Math.sin(this.walkT) * 2.5 : 0;
    const yb  = cy + bob;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, this.y + this.h + 4, 14, 5, 0, 0, Math.PI*2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#1565C0';
    const legOff = this.moving ? Math.sin(this.walkT) * 5 : 0;
    ctx.fillRect(cx-12, yb+10, 10, 16+legOff);
    ctx.fillRect(cx+2,  yb+10, 10, 16-legOff);

    // Body (chef coat)
    ctx.fillStyle = '#eceff1';
    roundRect(ctx, cx-15, yb-14, 30, 26, 5);
    ctx.fill();

    // Apron
    ctx.fillStyle = '#b0bec5';
    ctx.fillRect(cx-7, yb-4, 14, 20);

    // Arms
    ctx.fillStyle = '#eceff1';
    const armSwing = this.moving ? Math.sin(this.walkT) * 8 : 0;
    ctx.fillRect(cx-23, yb-12+armSwing, 9, 18);
    ctx.fillRect(cx+14, yb-12-armSwing, 9, 18);

    // Head
    ctx.fillStyle = '#FFCCBC';
    ctx.beginPath();
    ctx.arc(cx, yb-22, 13, 0, Math.PI*2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#37474F';
    ctx.beginPath();
    ctx.arc(cx-4, yb-24, 2, 0, Math.PI*2);
    ctx.arc(cx+4, yb-24, 2, 0, Math.PI*2);
    ctx.fill();

    // Smile
    ctx.beginPath();
    ctx.arc(cx, yb-20, 4, 0.2, Math.PI-0.2);
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Chef hat
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx-12, yb-36, 24, 14);
    ctx.fillRect(cx-9,  yb-45, 18, 12);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx-12, yb-36, 24, 14);

    ctx.restore();

    // Held item (floating above head)
    if (this.held) {
      ctx.save();
      const hoverY = yb - 60 + Math.sin(Date.now()/400) * 3;
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Background bubble
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, cx-18, hoverY-14, 36, 28, 8);
      ctx.fill();

      ctx.fillText(this.held.emoji + this.held.badge, cx, hoverY);
      ctx.restore();
    }
  }
}

// ── Order ─────────────────────────────────────────────────────────────
class Order {
  constructor(recipe) {
    this.recipe    = recipe;
    this.timeLeft  = recipe.timeLimit;
    this.totalTime = recipe.timeLimit;
    this.state     = 'active';   // active | done | failed
    this.fadeT     = 0;
  }

  update(dt) {
    if (this.state !== 'active') {
      this.fadeT += dt;
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.state    = 'failed';
    }
  }

  get progress()  { return this.timeLeft / this.totalTime; }
  get isUrgent()  { return this.progress < 0.28; }
  get isExpired() { return this.fadeT > 1.0; }

  barColor() {
    const p = this.progress;
    if (p > 0.55) return '#4CAF50';
    if (p > 0.28) return '#FFC107';
    return '#F44336';
  }
}

// ── Notification popup ────────────────────────────────────────────────
class Notif {
  constructor(text, color, x, y) {
    this.text  = text;
    this.color = color;
    this.x = x; this.y = y;
    this.t = 0;
  }
  update(dt) { this.t += dt; this.y -= 35 * dt; }
  get done()  { return this.t > 1.4; }
  get alpha() { return clamp(1 - this.t / 1.4, 0, 1); }
}

// ── Main Game ─────────────────────────────────────────────────────────
class KitchenRushGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.canvas.width  = CW;
    this.canvas.height = CH;

    this.state = 'menu';

    // Game objects
    this.player   = null;
    this.stations = [];
    this.orders   = [];
    this.notifs   = [];

    // Timers & score
    this.score       = 0;
    this.timeLeft    = GAME_DURATION;
    this.orderTimer  = 8;
    this.orderInterval = 14;
    this.maxOrders   = 4;

    this.lastTS = 0;
    this.input  = { left:false, right:false, up:false, down:false, interact:false, interactJustDown:false };

    this._bindInput();
    this._bindUI();
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ── Input ─────────────────────────────────────────────────────────
  _bindInput() {
    const map = {
      ArrowLeft:'left', KeyA:'left',
      ArrowRight:'right', KeyD:'right',
      ArrowUp:'up',  KeyW:'up',
      ArrowDown:'down', KeyS:'down',
      Space:'interact', KeyE:'interact',
    };
    document.addEventListener('keydown', e => {
      const a = map[e.code];
      if (!a) return;
      e.preventDefault();
      if (a === 'interact' && !this.input.interact) this.input.interactJustDown = true;
      this.input[a] = true;
    });
    document.addEventListener('keyup', e => {
      const a = map[e.code];
      if (a) this.input[a] = false;
    });
  }

  // ── UI buttons ────────────────────────────────────────────────────
  _bindUI() {
    document.getElementById('startBtn').addEventListener('click',   () => this._startGame());
    document.getElementById('restartBtn').addEventListener('click', () => this._startGame());
  }

  // ── Start / Reset ─────────────────────────────────────────────────
  _startGame() {
    this.score      = 0;
    this.timeLeft   = GAME_DURATION;
    this.orders     = [];
    this.notifs     = [];
    this.orderTimer = 6;

    this._buildKitchen();
    this.player = new Player(CW/2 - 19, CH/2 - 21);

    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');

    this.state = 'playing';
  }

  // ── Kitchen layout ────────────────────────────────────────────────
  _buildKitchen() {
    this.stations = [];
    const S = (t, x, y, w, h) => new Station(t, x, y, w, h);

    // Ingredient sources — top strip
    this.stations.push(S('LETTUCE',  10,  10, 80, 72));
    this.stations.push(S('TOMATO',  100,  10, 80, 72));
    this.stations.push(S('MEAT',    190,  10, 80, 72));
    this.stations.push(S('CHEESE',  280,  10, 80, 72));
    this.stations.push(S('BREAD',   370,  10, 80, 72));

    // Processing — left strip
    this.stations.push(S('CUTTING', 10, 148, 72, 88));
    this.stations.push(S('STOVE',   10, 258, 72, 88));

    // Assembly — center-right island
    this.stations.push(S('ASSEMBLY', 620, 200, 140, 110));

    // Serving windows — bottom strip
    this.stations.push(S('SERVE',  90, CH-82, 100, 72));
    this.stations.push(S('SERVE', 210, CH-82, 100, 72));
    this.stations.push(S('SERVE', 330, CH-82, 100, 72));
  }

  // ── Main loop ─────────────────────────────────────────────────────
  _loop(ts) {
    const dt = Math.min((ts - this.lastTS) / 1000, 0.08);
    this.lastTS = ts;

    if (this.state === 'playing') this._update(dt);
    this._render();

    this.input.interactJustDown = false;
    requestAnimationFrame(ts2 => this._loop(ts2));
  }

  // ── Update ────────────────────────────────────────────────────────
  _update(dt) {
    // Game timer
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this._endGame(); return; }

    // Update entities
    this.player.update(dt, this.input, this.stations);
    this.stations.forEach(s => s.update(dt));

    // Update orders
    this.orders.forEach(o => o.update(dt));
    this.orders = this.orders.filter(o => {
      if (o.state === 'failed' && o.isExpired) {
        this.score = Math.max(0, this.score - 25);
        this._notif('-25', '#FF5252', this.player.cx, this.player.cy - 40);
        return false;
      }
      if (o.state === 'done' && o.isExpired) return false;
      return true;
    });

    // Spawn orders
    this.orderTimer -= dt;
    if (this.orderTimer <= 0 && this.orders.filter(o=>o.state==='active').length < this.maxOrders) {
      this._spawnOrder();
      this.orderTimer = this.orderInterval + (Math.random() * 8 - 4);
    }

    // Interaction
    if (this.input.interactJustDown) this._handleInteract();

    // Notifications
    this.notifs.forEach(n => n.update(dt));
    this.notifs = this.notifs.filter(n => !n.done);

    // HUD update
    this._updateHUD();
  }

  _spawnOrder() {
    const r = RECIPES[Math.floor(Math.random() * RECIPES.length)];
    this.orders.push(new Order(r));
  }

  // ── Interaction logic ─────────────────────────────────────────────
  _handleInteract() {
    // Find nearest reachable station
    let best = null, bestD = Infinity;
    for (const s of this.stations) {
      if (!s.isNear(this.player.x, this.player.y, this.player.w, this.player.h)) continue;
      const dx = this.player.cx - s.cx, dy = this.player.cy - s.cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return;
    this._interactWith(best);
  }

  _interactWith(s) {
    const p  = this.player;
    const held = p.held;

    // ── INGREDIENT SOURCE ─────────────────────────────────────────
    if (['LETTUCE','TOMATO','MEAT','CHEESE','BREAD'].includes(s.type)) {
      if (!held) {
        p.held = { ...ITEMS[s.type] };
        this._notif('Grabbed ' + ITEMS[s.type].name, '#fff', p.cx, p.cy-50);
      } else {
        this._notif('Hands full!', '#FF8F00', p.cx, p.cy-50);
      }
      return;
    }

    // ── CUTTING BOARD ─────────────────────────────────────────────
    if (s.type === 'CUTTING') {
      if (held && !s.slot && !s.processing) {
        const rule = PROCESSES[held.id];
        if (rule && rule.station === 'CUTTING') {
          s.startProcessing(held);
          p.held = null;
          this._notif('Chopping… ✂️', '#64B5F6', p.cx, p.cy-50);
        } else {
          this._notif("Can't chop that!", '#FF8F00', p.cx, p.cy-50);
        }
      } else if (!held && s.slot && !s.processing) {
        p.held = s.slot; s.slot = null;
        this._notif('Picked up ' + p.held.name, '#4CAF50', p.cx, p.cy-50);
      } else if (s.processing) {
        this._notif('Still chopping…', '#aaa', p.cx, p.cy-50);
      } else if (held && s.slot) {
        this._notif('Station busy!', '#FF8F00', p.cx, p.cy-50);
      }
      return;
    }

    // ── STOVE ─────────────────────────────────────────────────────
    if (s.type === 'STOVE') {
      if (held && !s.slot && !s.processing) {
        const rule = PROCESSES[held.id];
        if (rule && rule.station === 'STOVE') {
          s.startProcessing(held);
          p.held = null;
          this._notif('Cooking… 🔥', '#FF7043', p.cx, p.cy-50);
        } else {
          this._notif("Can't cook that!", '#FF8F00', p.cx, p.cy-50);
        }
      } else if (!held && s.slot && !s.processing) {
        p.held = s.slot; s.slot = null;
        this._notif('Picked up ' + p.held.name, '#4CAF50', p.cx, p.cy-50);
      } else if (s.processing) {
        this._notif('Still cooking…', '#aaa', p.cx, p.cy-50);
      } else if (held && s.slot) {
        this._notif('Station busy!', '#FF8F00', p.cx, p.cy-50);
      }
      return;
    }

    // ── ASSEMBLY TABLE ────────────────────────────────────────────
    if (s.type === 'ASSEMBLY') {
      if (held && held.type === 'dish') {
        this._notif('Take dish to SERVE! 🪟', '#FF8F00', p.cx, p.cy-50);
        return;
      }
      if (s.slot && !held) {
        // Pick up completed dish
        p.held = s.slot; s.slot = null;
        this._notif('Grab the ' + p.held.name + '!', '#FFD700', p.cx, p.cy-50);
        return;
      }
      if (held && (held.type === 'raw' || held.type === 'processed')) {
        // Drop ingredient onto pile
        s.pile.push(held);
        p.held = null;

        // Try to assemble a dish
        const dish = this._tryAssemble(s.pile);
        if (dish) {
          s.pile  = [];
          s.slot  = { ...ITEMS[dish] };
          s.glow  = 2.5;
          this._notif('🎉 ' + ITEMS[dish].name + ' ready!', '#FFD700', p.cx, p.cy-50);
        } else {
          // Show what's needed for partial matches
          const hint = this._assemblyHint(s.pile);
          this._notif(hint, '#CE93D8', p.cx, p.cy-50);
        }
        return;
      }
      if (!held && s.pile.length > 0) {
        // Take last ingredient back
        p.held = s.pile.pop();
        this._notif('Took back ' + p.held.name, '#aaa', p.cx, p.cy-50);
        return;
      }
      this._notif('Bring ingredients here', '#888', p.cx, p.cy-50);
      return;
    }

    // ── SERVING WINDOW ────────────────────────────────────────────
    if (s.type === 'SERVE') {
      if (held && held.type === 'dish') {
        const order = this._matchOrder(held.id);
        if (order) {
          order.state = 'done';
          const speedBonus = Math.round(order.progress * 60);
          const total      = order.recipe.points + speedBonus;
          this.score += total;
          p.held = null;
          this._notif(`+${total} ⭐ (${order.recipe.name})`, '#FFD700', p.cx, p.cy-50);
        } else {
          this._notif('No order for ' + held.name + '!', '#FF5252', p.cx, p.cy-50);
        }
      } else if (held) {
        this._notif('Bring a dish, not an ingredient!', '#FF8F00', p.cx, p.cy-50);
      } else {
        this._notif('Bring a completed dish here', '#888', p.cx, p.cy-50);
      }
      return;
    }
  }

  // Try to match a pile of items to any recipe
  _tryAssemble(pile) {
    for (const r of RECIPES) {
      if (r.ingredients.length !== pile.length) continue;
      const avail = pile.map(i => i.id);
      let ok = true;
      for (const ing of r.ingredients) {
        const idx = avail.indexOf(ing);
        if (idx === -1) { ok = false; break; }
        avail.splice(idx, 1);
      }
      if (ok) return r.id;
    }
    return null;
  }

  // Give a hint about what's on the assembly pile
  _assemblyHint(pile) {
    if (pile.length === 0) return 'Assembly table empty';
    const names = pile.map(i => i.emoji + i.badge).join(' ');
    return 'On table: ' + names;
  }

  // Find an active order matching a dish id
  _matchOrder(dishId) {
    return this.orders.find(o => o.state === 'active' && o.recipe.id === dishId) || null;
  }

  _notif(text, color, x, y) {
    this.notifs.push(new Notif(text, color, x, y));
  }

  // ── HUD update ────────────────────────────────────────────────────
  _updateHUD() {
    document.getElementById('score').textContent = this.score;

    const m = Math.floor(this.timeLeft / 60);
    const s = Math.floor(this.timeLeft % 60);
    const timerEl = document.getElementById('timer');
    timerEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
    document.getElementById('timerBox').classList.toggle('warning', this.timeLeft < 30);

    // Held item
    const h = this.player.held;
    document.getElementById('heldItemDisplay').textContent =
      h ? (h.emoji + h.badge + '  ' + h.name) : '— nothing —';

    // Orders
    const list = document.getElementById('ordersList');
    list.innerHTML = '';
    for (const o of this.orders) {
      const card = document.createElement('div');
      const cls  = ['order-card'];
      if (o.isUrgent && o.state === 'active') cls.push('urgent');
      if (o.state === 'done') cls.push('done');
      card.className = cls.join(' ');
      if (o.state !== 'active') card.style.opacity = Math.max(0, 1 - o.fadeT);

      const pct   = clamp(o.progress * 100, 0, 100);
      const tLeft = Math.ceil(o.timeLeft);
      const ings  = o.recipe.ingredients.map(ingDisplay).join('  ');

      card.innerHTML = `
        <div class="order-emoji-big">${o.state === 'done' ? '✅' : o.recipe.emoji}</div>
        <div class="order-name">${o.recipe.name}</div>
        <div class="order-ingredients">${ings}</div>
        <div class="order-pts">${o.recipe.points}+ pts</div>
        <div class="order-time">${o.state === 'active' ? tLeft + 's' : (o.state === 'done' ? 'Served!' : 'Expired')}</div>
        <div class="order-bar-wrap">
          <div class="order-bar" style="width:${pct}%;background:${o.barColor()}"></div>
        </div>`;
      list.appendChild(card);
    }
  }

  // ── End game ──────────────────────────────────────────────────────
  _endGame() {
    this.state = 'gameover';
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('finalScore').textContent = this.score;

    let rating = '👨‍🍳 Keep Practicing!';
    if (this.score >= 800)      rating = '🏆 Legendary Chef!';
    else if (this.score >= 600) rating = '⭐⭐⭐ Master Chef!';
    else if (this.score >= 400) rating = '⭐⭐ Great Cook!';
    else if (this.score >= 200) rating = '⭐ Not Bad!';
    document.getElementById('finalRating').textContent = rating;
  }

  // ── Render ────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW, CH);
    if (this.state !== 'playing') return;

    this._drawFloor(ctx);
    this._drawWalls(ctx);
    this.stations.forEach(s => s.draw(ctx));
    this.player.draw(ctx);
    this._drawNotifs(ctx);
    this._drawInteractHint(ctx);
  }

  _drawFloor(ctx) {
    const ts = 44;
    for (let x = 0; x < CW; x += ts) {
      for (let y = 0; y < CH; y += ts) {
        ctx.fillStyle = ((x/ts + y/ts) % 2 === 0) ? '#181828' : '#14141f';
        ctx.fillRect(x, y, ts, ts);
      }
    }
  }

  _drawWalls(ctx) {
    // Top counter backing
    ctx.fillStyle = '#1c1c30';
    ctx.fillRect(0, 0, 460, 92);
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 460, 92);

    // Left counter backing
    ctx.fillRect(0, 92, 92, CH - 92 - 82);
    ctx.strokeRect(0, 92, 92, CH - 92 - 82);

    // Bottom counter backing
    ctx.fillRect(80, CH - 84, 360, 84);
    ctx.strokeRect(80, CH - 84, 360, 84);

    // Assembly island backdrop
    ctx.fillStyle = '#12122a';
    roundRect(ctx, 610, 190, 160, 130, 14);
    ctx.fill();
    ctx.strokeStyle = '#22224a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrow guides (faint)
    this._drawArrow(ctx, 240, 96, 240, 140, 'rgba(255,255,255,0.06)');
    this._drawArrow(ctx, 96, 196, 200, 280, 'rgba(255,255,255,0.06)');
    this._drawArrow(ctx, 200, 330, 615, 255, 'rgba(255,255,255,0.06)');
    this._drawArrow(ctx, 690, 320, 240, CH - 92, 'rgba(255,255,255,0.06)');
  }

  _drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 12]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawNotifs(ctx) {
    for (const n of this.notifs) {
      ctx.save();
      ctx.globalAlpha = n.alpha;
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      // Outline
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
      ctx.restore();
    }
  }

  _drawInteractHint(ctx) {
    let best = null, bestD = Infinity;
    for (const s of this.stations) {
      if (!s.isNear(this.player.x, this.player.y, this.player.w, this.player.h)) continue;
      const dx = this.player.cx - s.cx, dy = this.player.cy - s.cy;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return;

    const hx = best.cx;
    const hy = best.y - 6;

    ctx.save();
    ctx.font      = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Pill background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, hx - 22, hy - 22, 44, 20, 5);
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    ctx.fillText('[E]', hx, hy - 2);
    ctx.restore();
  }
}

// ── Boot ──────────────────────────────────────────────────────────────
window.addEventListener('load', () => new KitchenRushGame());
