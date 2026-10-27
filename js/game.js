// 게임 상태 & 시뮬레이션
const SAVE_KEY = 'steamcafe_save_v1';

const WEATHERS = [
  { id: 'sunny',  name: '맑음', icon: '☀', temp: 12, w: 3 },
  { id: 'cloudy', name: '흐림', icon: '☁', temp: 8,  w: 3 },
  { id: 'rain',   name: '비',   icon: '☂', temp: 6,  w: 2 },
  { id: 'snow',   name: '눈',   icon: '❄', temp: -2, w: 2 },
];

const Game = {
  s: null,
  rt: null,
  speed: 1,
  paused: false,
  listeners: {},

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); },
  toast(msg, kind = 'info') { this.emit('toast', msg, kind); },

  // ───────── 생성 / 저장 ─────────
  newGame(plotId, hero = 'hero_m') {
    const plot = DATA.plots.find(p => p.id === plotId);
    const W = plot.w, H = plot.h, N = W * H;
    this.s = {
      v: 1, plotId, hero, W, H,
      money: DATA.startMoney - plot.price,
      coal: 60, rep: 20, xp: 0, level: 1,
      day: 1, min: OPEN_HOUR * 60, open: false,
      weather: 'sunny',
      floor: new Array(N).fill('dirt'),
      wall: new Array(N).fill('rawbrick'),
      ceil: new Array(N).fill('beams'),
      pipe: { cold: new Array(N).fill(0), hot: new Array(N).fill(0), heat: new Array(N).fill(0) },
      leaks: [],
      objects: [], nextUid: 1,
      stock: { beans: 10, milk: 10, tea: 10, flour: 0, cocoa: 0 },
      counter: {},
      boiler: { pressure: 0, broken: false },
      events: [],
      coalPriceMul: 1,
      today: null,
      tutorialDone: false,
    };
    this.resetToday();
    this.rollWeather();
    this.initRuntime();
    this.save();
  },

  initRuntime() {
    this.rt = { customers: [], floats: [], particles: [], reacts: [], nets: null, dirty: true, lastHour: -1, cid: 1, passerT: 0, staff: null, serveQ: [] };
    this.recompute();
  },

  resetToday() {
    this.s.today = { served: 0, angry: 0, revenue: 0, tips: 0, spent: 0, coalUsed: 0, startMoney: this.s.money };
  },

  rollWeather() {
    const total = WEATHERS.reduce((a, w) => a + w.w, 0);
    let r = Math.random() * total;
    for (const w of WEATHERS) { r -= w.w; if (r <= 0) { this.s.weather = w.id; break; } }
  },

  save() {
    if (!this.s) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* 저장 불가 환경 */ }
  },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.s = JSON.parse(raw);
      // 영업 중 저장됐으면 그날 아침으로
      if (this.s.open) { this.s.open = false; this.s.min = OPEN_HOUR * 60; this.s.events = []; }
      this.initRuntime();
      return true;
    } catch (e) { return false; }
  },
  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },

  // ───────── 격자 ─────────
  get plot() { return DATA.plots.find(p => p.id === this.s.plotId); },
  idx(x, y) { return y * this.s.W + x; },
  inGrid(x, y) { return x >= 0 && y >= 0 && x < this.s.W && y < this.s.H; },
  isWall(x, y) { const { W, H } = this.s; return this.inGrid(x, y) && (x === 0 || y === 0 || x === W - 1 || y === H - 1); },
  isInterior(x, y) { const { W, H } = this.s; return x > 0 && y > 0 && x < W - 1 && y < H - 1; },
  get door() { return { x: Math.floor(this.s.W / 2), y: this.s.H - 1 }; },
  get inlet() { return { x: 0, y: 2 }; },
  isDoor(x, y) { const d = this.door; return x === d.x && y === d.y; },
  isEntrance(x, y) { const d = this.door; return x === d.x && y === d.y - 1; },
  isStreet(x, y) { return y >= this.s.H && y < this.s.H + STREET_ROWS && x >= 0 && x < this.s.W; },

  weather() {
    const w = WEATHERS.find(w => w.id === this.s.weather);
    return w;
  },
  hasEvent(id) { return this.s.events.some(e => e.id === id); },
  outdoorTemp() { return this.hasEvent('blizzard') ? -16 : this.weather().temp; },

  // ───────── 네트워크 / 캐시 재계산 ─────────
  objDef(o) { return DATA.objects[o.id]; },
  footprint(o) {
    const d = this.objDef(o), out = [];
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) out.push([o.x + i, o.y + j]);
    return out;
  },
  objAt(x, y, layer = 'floor') {
    const n = this.rt.nets; if (!n || !this.inGrid(x, y)) return null;
    const uid = (layer === 'ceil' ? n.ceilOcc : n.floorOcc)[this.idx(x, y)];
    return uid ? this.s.objects.find(o => o.uid === uid) : null;
  },
  isLeak(type, i) { return this.s.leaks.some(l => l.type === type && l.i === i); },

  recompute() {
    const s = this.s, { W, H } = s, N = W * H;
    const floorOcc = new Array(N).fill(0), ceilOcc = new Array(N).fill(0);
    for (const o of s.objects) {
      const occ = (this.objDef(o).layer === 'ceil') ? ceilOcc : floorOcc;
      for (const [x, y] of this.footprint(o)) occ[this.idx(x, y)] = o.uid;
    }
    const flood = (type, starts) => {
      const set = new Set(), q = [];
      for (const i of starts) if (s.pipe[type][i] && !this.isLeak(type, i) && !set.has(i)) { set.add(i); q.push(i); }
      while (q.length) {
        const i = q.pop(), x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!this.isInterior(nx, ny)) continue;
          const ni = this.idx(nx, ny);
          if (!set.has(ni) && s.pipe[type][ni] && !this.isLeak(type, ni)) { set.add(ni); q.push(ni); }
        }
      }
      return set;
    };
    const touching = (o) => {
      const res = new Set();
      for (const [x, y] of this.footprint(o)) {
        res.add(this.idx(x, y));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isInterior(x + dx, y + dy)) res.add(this.idx(x + dx, y + dy));
      }
      return res;
    };
    const inl = this.inlet;
    const cold = flood('cold', [this.idx(inl.x + 1, inl.y)]);
    const boiler = s.objects.find(o => o.id === 'boiler');
    let hot = new Set(), heat = new Set(), boilerFed = false;
    if (boiler) {
      const t = [...touching(boiler)];
      boilerFed = t.some(i => cold.has(i));
      hot = flood('hot', t); heat = flood('heat', t);
    }
    const sets = { cold, hot, heat };
    const conn = {};
    for (const o of s.objects) {
      const d = this.objDef(o);
      if (!d.needs || !d.needs.length) continue;
      const t = [...touching(o)];
      conn[o.uid] = {};
      for (const need of d.needs) conn[o.uid][need] = t.some(i => sets[need].has(i));
    }
    // 난방 커버리지: 난방관 깔린 실내 칸 + 연결된 라디에이터 주변 2칸
    const heatCover = new Set([...heat].filter(i => this.isInterior(i % W, (i / W) | 0)));
    for (const o of s.objects) if (o.id === 'radiator' && conn[o.uid] && conn[o.uid].heat) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (this.isInterior(o.x + dx, o.y + dy)) heatCover.add(this.idx(o.x + dx, o.y + dy));
    }
    // 좌석: 테이블과 상하좌우로 붙은 의자 칸
    const isTable = (x, y) => { const u = floorOcc[this.inGrid(x, y) ? this.idx(x, y) : 0]; const o = u && s.objects.find(o => o.uid === u); return o && this.objDef(o).table; };
    const seats = [];
    for (const o of s.objects) {
      if (!this.objDef(o).seat) continue;
      for (const [x, y] of this.footprint(o)) {
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.isInterior(x + dx, y + dy) && isTable(x + dx, y + dy)))
          seats.push({ x, y, uid: o.uid });
      }
    }
    // 분위기 점수
    let appeal = 0, interior = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y);
      if (this.isInterior(x, y)) { interior++; appeal += DATA.floors[s.floor[i]].appeal + DATA.ceilings[s.ceil[i]].appeal; }
      else if (!this.isDoor(x, y)) appeal += DATA.walls[s.wall[i]].appeal * 0.5;
    }
    for (const o of s.objects) appeal += this.objDef(o).appeal;
    this.rt.nets = { floorOcc, ceilOcc, cold, hot, heat, conn, boilerFed, heatCover, seats, appeal, interior, density: appeal / interior };
    // 사라진 좌석의 손님은 떠난다
    for (const c of this.rt.customers) if (c.seat && !seats.some(st => st.x === c.seat.x && st.y === c.seat.y) && c.state !== 'leaving') this.customerLeave(c, false);
    this.placeStaff();
    this.rt.dirty = false;
  },

  boilerRunning() {
    const n = this.rt.nets, s = this.s;
    return !!(s.objects.some(o => o.id === 'boiler') && n.boilerFed && s.coal > 0 && !s.boiler.broken);
  },
  // 장비가 실제로 작동 가능한가
  working(o) {
    const d = this.objDef(o);
    if (!d.needs || !d.needs.length) return true;
    const c = this.rt.nets.conn[o.uid] || {};
    for (const need of d.needs) {
      if (!c[need]) return false;
      if ((need === 'hot' || need === 'heat') && !this.boilerRunning()) return false;
    }
    if (o.id === 'boiler') return this.boilerRunning();
    return true;
  },
  missingNeeds(o) {
    const d = this.objDef(o), c = this.rt.nets.conn[o.uid] || {};
    return (d.needs || []).filter(n => !c[n]);
  },
  heatPower() { return this.boilerRunning() ? Math.min(1, this.rt.nets.heatCover.size / Math.max(1, this.rt.nets.interior)) : 0; },
  indoorTemp() {
    const out = this.outdoorTemp(), base = out + 4;
    return base + (22 - base) * Math.min(1, this.heatPower() * 1.4);
  },

  // ───────── 건설 ─────────
  spend(n) {
    if (this.s.money < n) { this.toast('돈이 부족합니다', 'bad'); return false; }
    this.s.money -= n; this.s.today.spent += n; return true;
  },
  paint(layer, x, y, id) {
    const s = this.s, i = this.idx(x, y);
    if (layer === 'floor' || layer === 'ceil') { if (!this.isInterior(x, y)) return false; }
    if (layer === 'wall') { if (!this.isWall(x, y) || this.isDoor(x, y)) return false; }
    if (s[layer][i] === id) return false;
    const table = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[layer];
    if (!this.spend(table[id].cost)) return false;
    s[layer][i] = id; this.rt.dirty = true; return true;
  },
  placePipe(type, x, y) {
    if (!this.isInterior(x, y) || this.s.pipe[type][this.idx(x, y)]) return false;
    if (!this.spend(DATA.pipes[type].cost)) return false;
    this.s.pipe[type][this.idx(x, y)] = 1; this.rt.dirty = true; return true;
  },
  erasePipe(x, y, type) {
    if (!this.isInterior(x, y)) return false;
    const i = this.idx(x, y); let any = false;
    for (const t of type ? [type] : ['cold', 'hot', 'heat']) if (this.s.pipe[t][i]) { this.s.pipe[t][i] = 0; any = true; }
    this.s.leaks = this.s.leaks.filter(l => !(l.i === i && (!type || l.type === type)));
    if (any) this.rt.dirty = true; return any;
  },
  canPlace(id, x, y) {
    const d = DATA.objects[id], s = this.s;
    if (d.lv > s.level) return { ok: false, why: `Lv.${d.lv} 필요` };
    if (d.unique && s.objects.some(o => o.id === id)) return { ok: false, why: '하나만 설치 가능' };
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
      const tx = x + i, ty = y + j;
      if (!this.isInterior(tx, ty)) return { ok: false, why: '실내에만 설치' };
      if (d.layer !== 'ceil' && this.isEntrance(tx, ty)) return { ok: false, why: '입구를 막을 수 없음' };
      if (this.objAt(tx, ty, d.layer === 'ceil' ? 'ceil' : 'floor')) return { ok: false, why: '이미 무언가 있음' };
      if (d.layer !== 'ceil' && id !== 'boiler' && s.floor[this.idx(tx, ty)] === 'dirt') return { ok: false, why: '바닥재를 먼저 깔아야 함' };
      if (d.layer !== 'ceil' && this.rt.customers.some(c => Math.round(c.x) === tx && Math.round(c.y) === ty)) return { ok: false, why: '손님이 있음' };
    }
    return { ok: true };
  },
  placeObject(id, x, y) {
    const c = this.canPlace(id, x, y);
    if (!c.ok) { this.toast(c.why, 'bad'); return false; }
    if (!this.spend(DATA.objects[id].cost)) return false;
    this.s.objects.push({ uid: this.s.nextUid++, id, x, y, cook: null });
    this.recompute(); this.emit('built', id);
    return true;
  },
  removeObject(o) {
    this.s.objects = this.s.objects.filter(q => q !== o);
    const refund = Math.floor(this.objDef(o).cost / 2);
    this.s.money += refund;
    this.toast(`${this.objDef(o).name} 철거 (+${refund} 환급)`);
    this.recompute();
  },

  // ───────── 요리 ─────────
  menuUnlocked() { return Object.entries(DATA.recipes).filter(([, r]) => r.lv <= this.s.level); },
  menuAvailable() {
    const eqs = new Set(this.s.objects.filter(o => this.objDef(o).cook && this.working(o)).map(o => o.id));
    return this.menuUnlocked().filter(([, r]) => eqs.has(r.eq)).map(([id]) => id);
  },
  canCook(o, rid) {
    const r = DATA.recipes[rid];
    if (r.lv > this.s.level) return `Lv.${r.lv} 필요`;
    if (!this.working(o)) return '설비 미연결/보일러 정지';
    if (o.cook) return '조리 중';
    for (const [k, n] of Object.entries(r.use)) if ((this.s.stock[k] || 0) < n) return `${DATA.ingredients[k].name} 부족`;
    return null;
  },
  startCook(o, rid) {
    const why = this.canCook(o, rid);
    if (why) { this.toast(why, 'bad'); return false; }
    const r = DATA.recipes[rid];
    for (const [k, n] of Object.entries(r.use)) this.s.stock[k] -= n;
    o.cook = { rid, t: 0, total: r.time, done: false };
    return true;
  },
  collect(o) {
    if (!o.cook || !o.cook.done) return false;
    if (!this.s.objects.some(q => q.id === 'counter')) { this.toast('서빙 카운터가 필요합니다', 'bad'); return false; }
    const r = DATA.recipes[o.cook.rid];
    this.s.counter[o.cook.rid] = (this.s.counter[o.cook.rid] || 0) + r.yield;
    this.float(o.x + 0.5, o.y, `+${r.yield} ${r.name}`, '#ffe9a8');
    o.cook = null;
    return true;
  },

  // ───────── 상점 ─────────
  buy(kind) {
    if (kind === 'coal') {
      if (this.hasEvent('coalStrike')) { this.toast('석탄 배달부 파업 중!', 'bad'); return; }
      const p = Math.round(DATA.coal.price * this.s.coalPriceMul);
      if (this.spend(p)) { this.s.coal += DATA.coal.pack; }
      return;
    }
    const ing = DATA.ingredients[kind];
    if (this.spend(ing.price)) this.s.stock[kind] += ing.pack;
  },

  // ───────── 영업 ─────────
  openChecklist() {
    const s = this.s, n = this.rt.nets;
    const has = id => s.objects.some(o => o.id === id);
    const sinkOk = s.objects.some(o => o.id === 'sink' && this.working(o));
    const cookOk = s.objects.some(o => this.objDef(o).cook && this.working(o));
    const reach = this.reachableSeats().length;
    return [
      { ok: has('boiler'), text: '중앙 보일러 설치' },
      { ok: has('boiler') && n.boilerFed, text: '수도 인입구 → 보일러 급수관 연결' },
      { ok: s.coal > 0 && !s.boiler.broken, text: '보일러 연료(석탄) 확보 / 정상 작동' },
      { ok: has('counter'), text: '서빙 카운터 설치' },
      { ok: sinkOk, text: '싱크대에 급수 + 급탕 연결 (위생)' },
      { ok: cookOk, text: '조리 설비 1대 이상 증기 연결' },
      { ok: reach > 0, text: '입구에서 갈 수 있는 테이블+의자 좌석' },
    ];
  },
  canOpen() { return this.openChecklist().every(c => c.ok); },
  openCafe() {
    if (this.s.open) return;
    if (!this.canOpen()) { this.toast('영업 준비가 덜 됐어요 (운영 탭 체크리스트 확인)', 'bad'); return; }
    this.s.open = true; this.s.tutorialDone = true;
    this.rt.lastHour = Math.floor(this.s.min / 60);
    this.toast(`☕ ${this.s.day}일차 영업 시작! 날씨: ${this.weather().name}`);
    this.emit('opened');
  },
  closeCafe() {
    const s = this.s;
    s.open = false;
    for (const c of this.rt.customers) if (c.state === 'eating') this.payCustomer(c);
    this.rt.customers = []; this.rt.serveQ = [];
    if (this.rt.staff) { this.rt.staff.path = []; this.rt.staff.carry = null; this.rt.staff.target = null; }
    for (const r of this.s.objects) if (r.cook && !r.cook.done) r.cook = null;
    const summary = { ...s.today, day: s.day, endMoney: s.money };
    s.events = []; s.coalPriceMul = 1; s.boiler.pressure = Math.min(s.boiler.pressure, 50);
    s.day++; s.min = OPEN_HOUR * 60;
    this.rollWeather();
    this.resetToday();
    this.recompute();
    this.save();
    this.emit('dayEnd', summary);
  },

  reachableSeats() {
    const n = this.rt.nets, s = this.s;
    const d = this.door, taken = new Set(this.rt.customers.filter(c => c.seat).map(c => c.seat.x + ',' + c.seat.y));
    const seatKeys = new Map(n.seats.map(st => [st.x + ',' + st.y, st]));
    const out = [], seen = new Set([d.x + ',' + d.y]), q = [[d.x, d.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || !this.isInterior(nx, ny)) continue;
        seen.add(k);
        if (seatKeys.has(k)) { if (!taken.has(k)) out.push(seatKeys.get(k)); continue; }
        if (this.walkable(nx, ny)) q.push([nx, ny]);
      }
    }
    return out;
  },
  walkable(x, y) {
    if (this.isStreet(x, y)) return true;
    if (this.isDoor(x, y)) return true;
    if (!this.isInterior(x, y)) return false;
    return !this.rt.nets.floorOcc[this.idx(x, y)];
  },
  // BFS 경로 (start 는 막혀 있어도 됨, goal 도 막혀 있어도 됨)
  findPath(sx, sy, gx, gy) {
    const key = (x, y) => x + ',' + y;
    const prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) {
        const path = []; let k = key(x, y), cur = [x, y];
        while (cur) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
        return path.slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k)) continue;
        if (!(nx === gx && ny === gy) && !this.walkable(nx, ny)) continue;
        if (!this.isStreet(nx, ny) && !this.inGrid(nx, ny)) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    return null;
  },

  pickType(forceVip) {
    if (forceVip) return DATA.customerTypes.find(t => t.vip);
    const fest = this.hasEvent('festival');
    const ws = DATA.customerTypes.map(t => t.weight * (fest && t.id.startsWith('aviator') ? 3 : 1) * (t.vip && this.s.level < 3 ? 0.3 : 1));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return DATA.customerTypes[i]; }
    return DATA.customerTypes[0];
  },

  spawnCustomer(forceVip = false) {
    const s = this.s, side = Math.random() < 0.5 ? 0 : s.W - 1;
    const type = this.pickType(forceVip);
    const c = { id: this.rt.cid++, type, x: side, y: s.H + 1 + (Math.random() < 0.5 ? 1 : 0), path: [], state: 'pass', seat: null, order: null, wait: 0, timer: 0, frame: 0, step: 0, sat: 0 };
    const seats = this.reachableSeats();
    if (seats.length) {
      const st = seats[Math.floor(Math.random() * seats.length)];
      const p = this.findPath(c.x, c.y, st.x, st.y);
      if (p) { c.seat = st; c.path = p; c.state = 'toSeat'; }
    }
    if (c.state === 'pass') c.path = this.findPath(c.x, c.y, s.W - 1 - side, c.y) || [];
    this.rt.customers.push(c);
    return c;
  },
  spawnPasser() {
    const s = this.s, side = Math.random() < 0.5 ? 0 : s.W - 1, row = s.H + 1 + (Math.random() < 0.5 ? 0 : 1);
    const c = { id: this.rt.cid++, type: this.pickType(), x: side, y: row, path: [], state: 'pass', frame: 0, step: 0 };
    c.path = this.findPath(side, row, s.W - 1 - side, row) || [];
    this.rt.customers.push(c);
  },

  customerLeave(c, angry) {
    const s = this.s;
    if (angry) {
      s.today.angry++;
      const loss = c.type.vip ? 4 : 1.2;
      s.rep = Math.max(0, s.rep - loss);
      this.float(c.x + 0.5, c.y - 0.5, '화났음! 평판↓', '#ff7a6a');
    }
    c.state = 'leaving'; c.order = null;
    const sx = Math.round(c.x), sy = Math.round(c.y);
    c.path = this.findPath(sx, sy, Math.random() < 0.5 ? 0 : s.W - 1, s.H + 1 + (Math.random() < 0.5 ? 1 : 0)) || [];
    c.seat = null;
  },

  satisfaction(c) {
    const n = this.rt.nets, t = this.indoorTemp();
    let sat = 55 + Math.min(30, n.density * 4) - c.type.picky;
    sat += t >= 20 ? 12 : t >= 18 ? 5 : t >= 14 ? -8 : -25;
    sat -= (c.wait / c.type.patience) * 25;
    return Math.max(0, Math.min(100, sat));
  },
  payCustomer(c) {
    const s = this.s, r = DATA.recipes[c.order];
    if (!r) return;
    const sat = this.satisfaction(c);
    const tip = sat >= 85 ? 0.4 : sat >= 70 ? 0.2 : sat >= 55 ? 0.05 : 0;
    const base = Math.round(r.price * c.type.pay), tipAmt = Math.round(base * tip);
    s.money += base + tipAmt;
    s.today.revenue += base; s.today.tips += tipAmt; s.today.served++;
    s.rep = Math.max(0, Math.min(100, s.rep + (sat - 55) / 45 * (c.type.vip ? 2.4 : 1.0)));
    this.addXp(c.type.vip ? 12 : 4);
    const face = sat >= 85 ? '최고!' : sat >= 70 ? '좋아요' : sat >= 55 ? '' : '별로...';
    this.float(c.x + 0.5, c.y - 0.6, `+${base + tipAmt}${tipAmt ? ' (팁)' : ''} ${face}`, sat >= 55 ? '#ffd76a' : '#ff9a8a');
    this.rt.reacts.push({ x: c.x, y: c.y, kind: sat >= 70 ? 'heart' : sat >= 45 ? 'heartHalf' : 'heartEmpty', life: 1.6 });
  },
  addXp(n) {
    const s = this.s; s.xp += n;
    while (s.level < DATA.levels.length && s.xp >= DATA.levels[s.level]) {
      s.level++;
      const unlocks = [
        ...Object.values(DATA.objects).filter(d => d.lv === s.level).map(d => d.name),
        ...Object.values(DATA.recipes).filter(d => d.lv === s.level).map(d => d.name),
        ...Object.values(DATA.floors).filter(d => d.lv === s.level).map(d => d.name),
        ...Object.values(DATA.walls).filter(d => d.lv === s.level).map(d => d.name),
        ...Object.values(DATA.ceilings).filter(d => d.lv === s.level).map(d => d.name),
      ];
      this.toast(`⬆ 레벨 ${s.level}! 해금: ${unlocks.join(', ') || '없음'}`, 'good');
      this.emit('levelUp');
    }
  },

  float(x, y, text, color) { this.rt.floats.push({ x, y, text, color, life: 2.2 }); },
  puff(px, py, color = 'rgba(235,230,220,0.8)', n = 1, spread = 2) {
    for (let i = 0; i < n; i++) this.rt.particles.push({ x: px + (Math.random() - 0.5) * spread, y: py, vx: (Math.random() - 0.5) * 3, vy: -6 - Math.random() * 6, life: 1 + Math.random(), max: 2, color, size: 1 + (Math.random() < 0.4 ? 1 : 0) });
  },

  // ───────── 이벤트 ─────────
  EVENTS: {
    blizzard: { name: '눈보라', w: 3, dur: 180, can: g => !g.hasEvent('blizzard'),
      start: g => { g.toast('❄ 눈보라가 몰아칩니다! 실내가 따뜻하면 손님이 몰려오고, 추우면 아무도 안 와요. 석탄 소비 증가.', 'warn'); } },
    pressure: { name: '보일러 압력 이상', w: 3, can: g => g.boilerRunning() && !g.hasEvent('pressure'),
      start: g => { g.s.boiler.pressure = Math.max(g.s.boiler.pressure, 70); g.toast('⚠ 보일러 압력이 치솟고 있습니다! 보일러를 눌러 안전밸브를 여세요!', 'warn'); } },
    leak: { name: '배관 누수', w: 3, can: g => ['cold', 'hot', 'heat'].some(t => g.s.pipe[t].some(v => v)),
      start: g => {
        const cands = [];
        for (const t of ['cold', 'hot', 'heat']) g.s.pipe[t].forEach((v, i) => { if (v && !g.isLeak(t, i)) cands.push({ type: t, i }); });
        if (!cands.length) return;
        const l = cands[Math.floor(Math.random() * cands.length)];
        g.s.leaks.push(l); g.recompute();
        g.toast(`💧 ${DATA.pipes[l.type].name} 누수! 설비 탭에서 새는 칸을 클릭해 수리하세요 (40)`, 'warn');
      }, instant: true },
    coalStrike: { name: '석탄 배달부 파업', w: 2, dur: 240, can: g => !g.hasEvent('coalStrike'),
      start: g => g.toast('⛏ 석탄 배달부 파업! 4시간 동안 석탄을 살 수 없습니다.', 'warn') },
    coalPrice: { name: '석탄값 폭등', w: 1, can: g => g.s.coalPriceMul === 1,
      start: g => { g.s.coalPriceMul = 2; g.toast('📈 석탄값이 오늘 하루 2배로 올랐습니다.', 'warn'); }, instant: true },
    festival: { name: '비행선 축제', w: 2, dur: 180, can: g => !g.hasEvent('festival'),
      start: g => g.toast('🎈 비행선 축제! 3시간 동안 손님이 크게 늘어납니다.', 'good') },
    noble: { name: '귀족 방문', w: 2, can: g => true,
      start: g => { g.toast('🎩 귀족 일행이 방문합니다. 분위기 좋은 카페를 기대하고 있어요!', 'good'); g.spawnCustomer(true); g.spawnCustomer(true); }, instant: true },
    inspector: { name: '증기 안전 감독관', w: 1, can: g => g.s.day >= 2,
      start: g => {
        const s = g.s, ok = s.boiler.pressure < 80 && !s.leaks.length && s.objects.some(o => o.id === 'sink' && g.working(o));
        if (ok) { s.money += 300; s.rep = Math.min(100, s.rep + 3); g.toast('🔍 증기 안전 감독관 점검 통과! 포상금 300, 평판 상승', 'good'); }
        else { s.money -= 250; g.toast('🔍 감독관 점검 불합격 (압력/누수/위생 문제) — 벌금 250', 'bad'); }
      }, instant: true },
  },

  triggerEvent(id) {
    const ev = this.EVENTS[id];
    if (!ev) return;
    if (!ev.instant) this.s.events.push({ id, until: ev.dur ? this.s.min + ev.dur : Infinity });
    ev.start(this);
    this.emit('event', id);
  },
  rollEvent() {
    const cands = Object.entries(this.EVENTS).filter(([, e]) => e.can(this));
    if (!cands.length) return;
    const ws = cands.map(([id, e]) => e.w * (id === 'blizzard' && this.s.weather === 'snow' ? 3 : 1));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return this.triggerEvent(cands[i][0]); }
  },

  ventValve() {
    const b = this.s.boiler;
    b.pressure = Math.max(0, b.pressure - 22);
    const boiler = this.s.objects.find(o => o.id === 'boiler');
    if (boiler) this.puff(boiler.x * 16 + 24, boiler.y * 16 - 2, 'rgba(255,255,255,0.9)', 14, 8);
    if (b.pressure < 60) this.s.events = this.s.events.filter(e => e.id !== 'pressure');
  },
  repairBoiler() {
    if (!this.s.boiler.broken) return;
    if (!this.spend(800)) return;
    this.s.boiler.broken = false; this.s.boiler.pressure = 40;
    this.toast('🔧 보일러 수리 완료 (-800)', 'good');
  },
  repairLeak(type, i) {
    if (!this.spend(40)) return;
    this.s.leaks = this.s.leaks.filter(l => !(l.type === type && l.i === i));
    this.recompute();
    this.toast('🔧 누수 수리 완료');
  },

  // ───────── 메인 틱 ─────────
  update(dt) {
    const s = this.s, rt = this.rt;
    if (!s) return;
    if (rt.dirty) this.recompute();
    const animDt = dt;
    // 파티클/플로팅 텍스트는 일시정지와 무관하게 흘러간다
    for (const p of rt.particles) { p.x += p.vx * animDt; p.y += p.vy * animDt; p.life -= animDt; }
    rt.particles = rt.particles.filter(p => p.life > 0);
    for (const f of rt.floats) { f.y -= animDt * 0.5; f.life -= animDt; }
    rt.floats = rt.floats.filter(f => f.life > 0);
    for (const r of rt.reacts) { r.y -= animDt * 0.4; r.life -= animDt; }
    rt.reacts = rt.reacts.filter(r => r.life > 0);

    if (this.paused) return;
    const gm = dt * MIN_PER_SEC * this.speed;   // 이번 틱의 게임 분
    const running = this.boilerRunning();

    // 보일러 연기/압력
    const boiler = s.objects.find(o => o.id === 'boiler');
    if (boiler && running && Math.random() < dt * 4) this.puff(boiler.x * 16 + 23, boiler.y * 16 - 14);

    if (!s.open) {
      // 준비 시간: 거리 행인만 지나다닌다
      rt.passerT -= dt;
      if (rt.passerT <= 0) { rt.passerT = 2 + Math.random() * 4; this.spawnPasser(); }
      this.updateCustomers(dt * MIN_PER_SEC);
      this.updateStaff(dt * MIN_PER_SEC);
      return;
    }

    s.min += gm;

    // 석탄 소비
    if (running) {
      const cooking = s.objects.filter(o => o.cook && !o.cook.done).length;
      let use = (0.03 + rt.nets.heatCover.size * 0.0015 + cooking * 0.01) * gm;
      if (this.hasEvent('blizzard')) use *= 1.6;
      s.coal = Math.max(0, s.coal - use); s.today.coalUsed += use;
      if (s.coal <= 0) this.toast('⚫ 석탄이 떨어져 보일러가 꺼졌습니다! 상점에서 구매하세요.', 'bad');
    }
    // 압력
    const b = s.boiler;
    if (running) {
      if (this.hasEvent('pressure')) b.pressure += 0.9 * gm;
      else b.pressure += (52 - b.pressure) * Math.min(1, 0.05 * gm);
      if (b.pressure >= 100) {
        b.broken = true; b.pressure = 0;
        s.events = s.events.filter(e => e.id !== 'pressure');
        s.rep = Math.max(0, s.rep - 4);
        if (boiler) for (let i = 0; i < 30; i++) this.puff(boiler.x * 16 + 16, boiler.y * 16 + 10, i % 3 ? 'rgba(255,255,255,0.9)' : '#ff8a2a', 1, 24);
        this.toast('💥 보일러 과압 파열! 모든 증기 설비 정지. 보일러를 눌러 수리하세요 (800)', 'bad');
      }
    } else b.pressure = Math.max(0, b.pressure - gm * 2);

    // 요리 진행
    const hasAuto = s.objects.some(o => o.id === 'automaton' && this.working(o));
    for (const o of s.objects) {
      if (!o.cook || o.cook.done) continue;
      if (this.working(o)) {
        o.cook.t += gm;
        if (Math.random() < dt * 2) this.puff(o.x * 16 + 8 + (Math.random() - 0.5) * 6, o.y * 16 - 4, 'rgba(240,240,240,0.7)');
        if (o.cook.t >= o.cook.total) { o.cook.done = true; if (hasAuto) this.collect(o); }
      }
    }

    // 이벤트 만료/발생
    s.events = s.events.filter(e => e.until > s.min || (e.id === 'pressure' && b.pressure >= 60 && running));
    const hour = Math.floor(s.min / 60);
    if (hour !== rt.lastHour) {
      rt.lastHour = hour;
      if (hour > OPEN_HOUR && hour < CLOSE_HOUR && Math.random() < 0.22) this.rollEvent();
    }

    // 손님 생성
    const n = rt.nets;
    let mult = 1;
    if (this.hasEvent('festival')) mult *= 2.2;
    if (this.hasEvent('blizzard')) mult *= this.indoorTemp() >= 18 ? 1.4 : 0.35;
    if (s.weather === 'rain') mult *= 0.85;
    const hr = s.min / 60;
    const curve = (hr >= 12 && hr < 14) ? 1.4 : (hr >= 15 && hr < 17) ? 1.2 : (hr >= 19) ? 0.6 : 1;
    const lambda = 5 * this.plot.traffic * (0.5 + s.rep / 100) * (0.6 + Math.min(n.density, 8) / 10) * mult * curve;
    if (Math.random() < lambda * gm / 60) this.spawnCustomer();
    rt.passerT -= dt;
    if (rt.passerT <= 0) { rt.passerT = 3 + Math.random() * 5; this.spawnPasser(); }

    this.updateCustomers(gm);
    this.updateStaff(gm);

    if (s.min >= CLOSE_HOUR * 60) this.closeCafe();
  },

  updateCustomers(gm) {
    const rt = this.rt, s = this.s;
    const SPEED = 0.38; // 타일/게임분
    for (const c of rt.customers) {
      // 이동
      if (c.path && c.path.length) {
        const [tx, ty] = c.path[0];
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), step = SPEED * gm;
        if (d <= step) { c.x = tx; c.y = ty; c.path.shift(); } else { c.x += dx / d * step; c.y += dy / d * step; }
        c.step += gm; c.frame = Math.floor(c.step / 1.5);
        if (Math.abs(dx) > Math.abs(dy)) { c.face = 'side'; c.dir = dx > 0 ? 1 : -1; } else if (Math.abs(dy) > 0.001) c.face = dy > 0 ? 'down' : 'up';
        continue;
      }
      if (c.state === 'pass' || c.state === 'leaving') { c.state = 'gone'; continue; }
      if (c.state === 'toSeat') {
        c.state = 'waiting'; c.wait = 0;
        const menu = this.menuAvailable();
        if (!menu.length) { this.customerLeave(c, false); continue; }
        const inStock = menu.filter(id => (s.counter[id] || 0) > 0);
        c.order = (inStock.length && Math.random() < 0.75) ? inStock[Math.floor(Math.random() * inStock.length)] : menu[Math.floor(Math.random() * menu.length)];
        continue;
      }
      if (c.state === 'waiting') {
        c.wait += gm;
        if (!c.assigned && (s.counter[c.order] || 0) > 0) { s.counter[c.order]--; c.assigned = true; c.timer = 4; if (rt.staff) rt.serveQ.push(c); }
        if (c.assigned && !rt.staff) { c.timer -= gm; if (c.timer <= 0) this.serve(c); }
        else if (c.wait > c.type.patience) this.customerLeave(c, true);
        continue;
      }
      if (c.state === 'eating') {
        c.timer -= gm;
        if (c.timer <= 0) { this.payCustomer(c); this.customerLeave(c, false); }
      }
    }
    rt.customers = rt.customers.filter(c => c.state !== 'gone');
  },


  // ───────── 바리스타 (NAPLE 마법사 스프라이트) ─────────
  // 카운터 옆 걸을 수 있는 칸이 '자리'. 카운터가 없으면 바리스타도 없다.
  staffHome() {
    const counter = this.s.objects.find(o => o.id === 'counter');
    if (!counter) return null;
    const cands = [];
    for (let i = 0; i < 2; i++) cands.push([counter.x + i, counter.y - 1]);
    cands.push([counter.x - 1, counter.y], [counter.x + 2, counter.y], [counter.x, counter.y + 1], [counter.x + 1, counter.y + 1]);
    return cands.find(([x, y]) => this.isInterior(x, y) && this.walkable(x, y)) || null;
  },
  placeStaff() {
    const home = this.staffHome(), rt = this.rt;
    if (!home) { rt.staff = null; return; }
    if (!rt.staff) rt.staff = { x: home[0], y: home[1], path: [], frame: 0, step: 0, dir: 1, cast: 0, carry: null, target: null };
    rt.staff.home = home;
    // 자리가 막혔으면 순간이동
    if (!rt.staff.path.length && !this.walkable(Math.round(rt.staff.x), Math.round(rt.staff.y))) { rt.staff.x = home[0]; rt.staff.y = home[1]; }
  },
  // 목표 손님 좌석 옆 칸으로 가는 경로
  pathNextTo(sx, sy, tx, ty) {
    let best = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = tx + dx, ny = ty + dy;
      if (!this.isInterior(nx, ny) || !this.walkable(nx, ny)) continue;
      const p = (nx === sx && ny === sy) ? [] : this.findPath(sx, sy, nx, ny);
      if (p && (!best || p.length < best.length)) best = p;
    }
    return best;
  },
  serve(c) {
    if (c.state !== 'waiting') return;
    c.state = 'eating'; c.timer = 30 + Math.random() * 20;
  },
  updateStaff(gm) {
    const st = this.rt.staff; if (!st) return;
    const SPEED = 0.7;
    st.cast = Math.max(0, st.cast - gm);
    if (st.path.length) {
      const [tx, ty] = st.path[0];
      const dx = tx - st.x, dy = ty - st.y, d = Math.hypot(dx, dy), step = SPEED * gm;
      if (Math.abs(dx) > Math.abs(dy)) { st.face = 'side'; st.dir = dx > 0 ? 1 : -1; } else if (Math.abs(dy) > 0.001) st.face = dy > 0 ? 'down' : 'up';
      if (d <= step) { st.x = tx; st.y = ty; st.path.shift(); } else { st.x += dx / d * step; st.y += dy / d * step; }
      st.step += gm;
      if (!st.path.length && st.target) {
        // 도착: 서빙
        st.face = st.target.seat.y < st.y ? 'up' : st.target.seat.y > st.y ? 'down' : 'side'; if (st.face === 'side') st.dir = st.target.seat.x > st.x ? 1 : -1;
        this.serve(st.target); st.target = null; st.carry = null; st.cast = 3;
        st.path = this.findPath(Math.round(st.x), Math.round(st.y), st.home[0], st.home[1]) || [];
      }
      return;
    }
    if (st.cast > 0) return;
    const q = this.rt.serveQ;
    while (q.length && q[0].state !== 'waiting') q.shift();
    if (!q.length) {
      if ((Math.round(st.x) !== st.home[0] || Math.round(st.y) !== st.home[1])) st.path = this.findPath(Math.round(st.x), Math.round(st.y), st.home[0], st.home[1]) || [];
      return;
    }
    const c = q.shift();
    const p = this.pathNextTo(Math.round(st.x), Math.round(st.y), c.seat.x, c.seat.y);
    if (!p) { this.serve(c); return; }
    st.carry = c.order; st.target = c;
    if (!p.length) { this.serve(c); st.target = null; st.carry = null; st.cast = 3; return; }
    st.path = p;
  },

  timeStr() {
    const m = Math.floor(this.s.min), h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(Math.floor(mm / 10) * 10).padStart(2, '0')}`;
  },
};
