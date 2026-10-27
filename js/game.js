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
  sfx(name) { this.emit('sfx', name); },

  // ───────── 생성 / 저장 ─────────
  newGame(plotId, hero = 'hero_m') {
    const plot = DATA.plots.find(p => p.id === plotId);
    const W = plot.w, H = plot.h, N = W * H;
    this.s = {
      v: 1, plotId, hero, W, H, doorX: Math.floor(W / 2), inletY: 2, expansions: 0,
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
      cats: [],
      stains: [],
      loans: [], loanSeq: 1,
      difficulty: 'easy', auto: false, crew: [], loanV: 2,
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
    this.rt = { customers: [], floats: [], particles: [], reacts: [], nets: null, dirty: true, lastHour: -1, cid: 1, passerT: 0, staff: null, serveQ: [], cats: [], crew: [] };
    this.recompute();
  },

  resetToday() {
    this.s.today = { served: 0, angry: 0, revenue: 0, tips: 0, spent: 0, coalUsed: 0, startMoney: this.s.money };
  },

  rollWeather() {
    const total = WEATHERS.reduce((a, w) => a + w.w, 0);
    let r = Math.random() * total;
    for (const w of WEATHERS) { r -= w.w; if (r <= 0) { this.s.weather = w.id; break; } }
    // 밤새 쌓이거나 녹은 눈 (0~1)
    const sn = this.s.snow || 0;
    this.s.snow = this.s.weather === 'snow' ? Math.max(sn, 0.45 + Math.random() * 0.3) : this.s.weather === 'sunny' ? sn * 0.3 : sn * 0.6;
  },

  save() {
    if (!this.s) return;
    
    this.s.savedAt = Date.now();
    // 1. 로컬 저장
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* 저장 불가 환경 */ }
    // 2. 로그인했으면 클라우드에도 (firebase-init.js 가 몰아서 보냄)
    if (typeof saveToCloud === 'function') saveToCloud(this.s);
  },

  hasSave() { 
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } 
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.s = JSON.parse(raw);
      // 영업 중 저장됐으면 그날 아침으로
      if (this.s.open) { this.s.open = false; this.s.min = OPEN_HOUR * 60; this.s.events = []; }
      const st = this.s;
      st.doorX ??= Math.floor(st.W / 2); st.inletY ??= 2; st.expansions ??= 0; st.cats ??= []; st.stains ??= []; st.loans ??= []; st.loanSeq ??= 1; st.difficulty ??= 'easy'; st.auto ??= false; st.crew ??= [];
      // 이자 인하 전 대출은 남은 원리금을 새 이자율(난이도 반영)로 다시 계산
      if (!st.loanV) {
        const old = { small: 0.08, mid: 0.12, big: 0.18 }, mul = (DATA.difficulty[st.difficulty] || DATA.difficulty.easy).loanRate;
        for (const l of st.loans) { const d = DATA.loans.find(q => q.id === l.id); if (!d || !old[l.id]) continue; const k = (1 + d.rate * mul) / (1 + old[l.id]); l.balance = Math.ceil(l.balance * k); l.perDay = Math.ceil(l.perDay * k); }
        st.loanV = 2;
      }
      this.initRuntime();
      return true;
    } catch (e) { return false; }
  },

  // 클라우드 세이브 적용: 로컬보다 새것이면 로컬에 덮어쓰고, 진행 중이면 다시 그리고, 타이틀이면 "이어하기"가 보이게
  applyCloudSave(cloud) {
    if (!cloud) return false;
    try {
      const data = typeof cloud === 'string' ? JSON.parse(cloud) : cloud;
      if (!data || !data.W || !data.floor) return false;
      const local = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } })();
      if (local && (local.savedAt || 0) > (data.savedAt || 0)) return false;   // 로컬이 더 새것
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) {}
      if (typeof App !== 'undefined' && App.started) {
        this.load();
        Render.resize(document.getElementById('canvasWrap'));
        UI.refresh();
        this.toast('☁️ 클라우드 세이브를 불러왔습니다', 'good');
      } else if (typeof UI !== 'undefined' && App.onTitle) UI.showTitle();
      return true;
    } catch (e) {
      console.error('클라우드 세이브 적용 중 오류:', e);
      return false;
    }
  },

  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },

  // ───────── 격자 ─────────
  get plot() { return DATA.plots.find(p => p.id === this.s.plotId); },
  idx(x, y) { return y * this.s.W + x; },
  inGrid(x, y) { return x >= 0 && y >= 0 && x < this.s.W && y < this.s.H; },
  isWall(x, y) { const { W, H } = this.s; return this.inGrid(x, y) && (x === 0 || y === 0 || x === W - 1 || y === H - 1); },
  isInterior(x, y) { const { W, H } = this.s; return x > 0 && y > 0 && x < W - 1 && y < H - 1; },
  get door() { return { x: this.s.doorX ?? Math.floor(this.s.W / 2), y: this.s.H - 1 }; },
  get inlet() { return { x: 0, y: this.s.inletY ?? 2 }; },
  isDoor(x, y) { const d = this.door; return x === d.x && y === d.y; },
  isEntrance(x, y) { const d = this.door; return x === d.x && y === d.y - 1; },
  // 거리는 마을 여백까지 이어진다
  isStreet(x, y) { return y >= this.s.H && y < this.s.H + STREET_ROWS && x >= this.streetX0() && x <= this.streetX1(); },
  streetX0() { return -TOWN.mx; },
  streetX1() { return this.s.W + TOWN.mx - 1; },
  // 손님은 가게 근처에서 나타나고, 행인은 마을 끝에서 끝까지 걷는다
  sideX(side, far) { return side ? (far ? this.streetX1() : this.s.W + 4) : (far ? this.streetX0() : -5); },

  weather() {
    const w = WEATHERS.find(w => w.id === this.s.weather);
    return w;
  },
  hasEvent(id) { return this.s.events.some(e => e.id === id); },
  outdoorTemp() { return this.hasEvent('blizzard') ? -16 : this.weather().temp; },

  // ───────── 네트워크 / 캐시 재계산 ─────────
  objDef(o) { return DATA.objects[o.id]; },
  // 회전(rot 1)한 직사각형 오브젝트는 가로·세로가 바뀐다
  dims(id, rot = 0) { const d = DATA.objects[id]; return (rot & 1) && d.w !== d.h ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; },
  footprint(o) {
    const { w, h } = this.dims(o.id, o.rot), out = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([o.x + i, o.y + j]);
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
    appeal += (s.cats || []).length * DATA.catAppeal;
    appeal -= (s.stains || []).length * DATA.stain.appeal;
    // 조명이 닿는 실내 칸
    const lit = new Set();
    for (const o of s.objects) {
      const r = this.objDef(o).light; if (!r) continue;
      const cx = o.x + 0.5, cy = o.y + 0.5;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (this.isInterior(x, y) && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) lit.add(this.idx(x, y));
    }
    this.rt.nets = { lit, floorOcc, ceilOcc, cold, hot, heat, conn, boilerFed, heatCover, seats, appeal, interior, density: appeal / interior };
    // 사라진 좌석의 손님은 떠난다
    for (const c of this.rt.customers) if (c.seat && !seats.some(st => st.x === c.seat.x && st.y === c.seat.y) && c.state !== 'leaving') this.customerLeave(c, false);
    this.placeStaff();
    this.syncCrew();
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
  // 내부 발열 합계 (W) — 사람, 바리스타, 고양이, 식물, 조리, 증기 누수
  internalGains() {
    const T = DATA.thermal, s = this.s, rt = this.rt;
    const g = { sens: 0, lat: 0, people: 0, cats: 0, rows: [] };
    const add = (label, n, sens, lat) => { if (!n) return; g.sens += sens * n; g.lat += lat * n; g.rows.push({ label, n, sens: sens * n, lat: lat * n }); };
    const people = rt.customers.filter(c => c.state !== 'pass' && this.isInterior(Math.round(c.x), Math.round(c.y))).length;
    g.people = people;
    add('손님', people, T.person.sens, T.person.lat);
    if (rt.staff && s.open) add('바리스타', 1, T.barista.sens, T.barista.lat);
    if (s.open) add('직원', rt.crew.filter(e => !this.isRobot(e.ref.kind)).length, T.barista.sens, T.barista.lat);
    add('증기 로봇', rt.crew.filter(e => this.isRobot(e.ref.kind)).length * (this.boilerRunning() ? 1 : 0), 90, 25);
    for (const cat of s.cats) { const k = DATA.cats.find(c => c.id === cat.kind); add(`${cat.name}(${k.name})`, 1, k.sens, k.lat); g.cats++; }
    add('식물 (증산)', s.objects.filter(o => DATA.plantObjects.includes(o.id)).length, T.plant.sens, T.plant.lat);
    for (const o of s.objects) if (o.cook && !o.cook.done && this.working(o)) { const [a, b] = T.cooking[o.id] || [0, 0]; add(`${DATA.objects[o.id].name} 조리`, 1, a, b); }
    add('증기 누수', s.leaks.filter(l => l.type !== 'cold').length, T.steamLeak.sens, T.steamLeak.lat);
    return g;
  },
  // 열평형: 손실 UA·(T실내 − T기준) = 보일러 공급 + 현열 발열
  // 보일러는 목표온도까지만 공급(온도조절) → 내부 발열만큼 난방부하가 줄어든다
  thermal() {
    const T = DATA.thermal, n = this.rt.nets;
    const base = this.outdoorTemp() + 4;          // 외피만 있을 때 실내
    const UA = n.interior * T.uaPerTile;
    const cap = this.boilerRunning() ? n.heatCover.size * T.heatPerTile : 0;
    const gains = this.internalGains();
    const demand = Math.max(0, UA * (T.target - base));   // 발열 없을 때 필요한 난방
    const load = Math.max(0, demand - gains.sens);         // 실제 난방부하
    const supply = Math.min(cap, load);
    const temp = base + (supply + gains.sens) / UA;
    // 상대습도: 날씨 기준 − 난방 건조 + 잠열 가습
    const baseRH = { sunny: 40, cloudy: 50, rain: 68, snow: 45 }[this.s.weather] - (this.hasEvent('blizzard') ? 10 : 0);
    const rh = Math.max(10, Math.min(95, baseRH - (temp - this.outdoorTemp()) * 0.8 + gains.lat / n.interior * 1.5));
    return { base, UA, cap, gains, demand, load, supply, temp, rh, saved: Math.min(demand, gains.sens) };
  },
  indoorTemp() { return this.thermal().temp; },
  humidity() { return this.thermal().rh; },

  // ───────── 건설 ─────────
  spend(n) {
    if (this.s.money < n) { this.toast(`돈이 부족합니다 (${Math.ceil(n - this.s.money)} 부족) — 상점 탭 증기 은행에서 대출할 수 있어요`, 'bad'); return false; }
    this.s.money -= n; this.s.today.spent += n; return true;
  },
  paint(layer, x, y, id) {
    const s = this.s, i = this.idx(x, y);
    if (layer === 'floor' || layer === 'ceil') { if (!this.isInterior(x, y)) return false; }
    if (layer === 'wall') { if (!this.isWall(x, y) || this.isDoor(x, y)) return false; }
    if (s[layer][i] === id) return false;
    const table = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[layer];
    if (!this.spend(table[id].cost)) return false;
    s[layer][i] = id; this.rt.dirty = true; this.sfx('brush'); return true;
  },
  placePipe(type, x, y) {
    if (!this.isInterior(x, y) || this.s.pipe[type][this.idx(x, y)]) return false;
    if (!this.spend(DATA.pipes[type].cost)) return false;
    this.s.pipe[type][this.idx(x, y)] = 1; this.rt.dirty = true; return true;
  },
  // 여러 칸을 한 번에 (✓ 확정): 돈이 모자라면 하나도 깔지 않는다
  placePipes(type, cells) {
    const s = this.s, ok = cells.filter(i => { const x = i % s.W, y = (i / s.W) | 0; return this.isInterior(x, y) && !s.pipe[type][i]; });
    if (!ok.length) return true;
    if (!this.spend(ok.length * DATA.pipes[type].cost)) return false;
    for (const i of ok) s.pipe[type][i] = 1;
    this.rt.dirty = true; this.emit('built', type); this.sfx('pipe');
    return true;
  },
  erasePipe(x, y, type) {
    if (!this.isInterior(x, y)) return false;
    const i = this.idx(x, y); let any = false;
    for (const t of type ? [type] : ['cold', 'hot', 'heat']) if (this.s.pipe[t][i]) { this.s.pipe[t][i] = 0; any = true; }
    this.s.leaks = this.s.leaks.filter(l => !(l.i === i && (!type || l.type === type)));
    if (any) { this.rt.dirty = true; this.sfx('remove'); } return any;
  },
  canPlace(id, x, y, ignoreUid = 0, rot = 0) {
    const d = DATA.objects[id], s = this.s, dm = this.dims(id, rot);
    if (d.lv > s.level) return { ok: false, why: `Lv.${d.lv} 필요` };
    if (d.unique && s.objects.some(o => o.id === id && o.uid !== ignoreUid)) return { ok: false, why: '하나만 설치 가능' };
    for (let j = 0; j < dm.h; j++) for (let i = 0; i < dm.w; i++) {
      const tx = x + i, ty = y + j;
      if (!this.isInterior(tx, ty)) return { ok: false, why: '실내에만 설치' };
      if (d.layer !== 'ceil' && this.isEntrance(tx, ty)) return { ok: false, why: '입구를 막을 수 없음' };
      const there = this.objAt(tx, ty, d.layer === 'ceil' ? 'ceil' : 'floor');
      if (there && there.uid !== ignoreUid) return { ok: false, why: '이미 무언가 있음' };
      if (d.layer !== 'ceil' && id !== 'boiler' && s.floor[this.idx(tx, ty)] === 'dirt') return { ok: false, why: '바닥재를 먼저 깔아야 함' };
      if (d.layer !== 'ceil' && this.rt.customers.some(c => Math.round(c.x) === tx && Math.round(c.y) === ty)) return { ok: false, why: '손님이 있음' };
    }
    return { ok: true };
  },
  placeObject(id, x, y, rot = 0) {
    const c = this.canPlace(id, x, y, 0, rot);
    if (!c.ok) { this.toast(c.why, 'bad'); return false; }
    if (!this.spend(DATA.objects[id].cost)) return false;
    this.s.objects.push({ uid: this.s.nextUid++, id, x, y, rot: rot & 1, cook: null });
    this.recompute(); this.emit('built', id); this.sfx(id === 'boiler' ? 'heavy' : 'place');
    return true;
  },
  nightLevel() { return Math.max(0, Math.min(1, (this.s.min - 16.5 * 60) / 150)); },
  // 실내에서 조명이 닿는 비율 (0~1)
  lightCoverage() { const n = this.rt.nets; return n.lit.size / Math.max(1, n.interior); },
  // 좌석 중 조명이 닿는 비율
  litSeats() { const n = this.rt.nets; if (!n.seats.length) return 1; return n.seats.filter(st => n.lit.has(this.idx(st.x, st.y))).length / n.seats.length; },

  // ───────── 편집: 이동·뒤집기·일괄 칠하기 ─────────
  moveObject(o, x, y, rot = o.rot || 0) {
    if (o.x === x && o.y === y && (o.rot || 0) === (rot & 1)) return true;
    const c = this.canPlace(o.id, x, y, o.uid, rot);
    if (!c.ok) { this.toast(c.why, 'bad'); return false; }
    o.x = x; o.y = y; o.rot = rot & 1; this.sfx('place');
    this.recompute(); this.save();
    this.toast(`${this.objDef(o).name} 이동`);
    return true;
  },
  flipObject(o) { o.flip = !o.flip; this.save(); },
  // 제자리 회전: 정사각형은 좌우 뒤집기, 직사각형은 90° (자리가 안 되면 알려 줌)
  rotateObject(o) {
    const d = this.objDef(o);
    if (d.w === d.h) { this.flipObject(o); return true; }
    const r = (o.rot || 0) ^ 1, c = this.canPlace(o.id, o.x, o.y, o.uid, r);
    if (!c.ok) { this.toast(`회전할 자리가 없어요 (${c.why}) — 옮기기로 들어서 R 로 돌려 보세요`, 'bad'); return false; }
    o.rot = r; this.recompute(); this.save();
    return true;
  },
  canRotate(id) { const d = DATA.objects[id]; return d.w !== d.h; },
  // 실내 바닥/천장 전체, 또는 바깥 벽 전체를 한 번에 칠한다 (같은 재질인 칸은 건너뜀)
  paintAllInfo(layer, id) {
    const s = this.s, table = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[layer];
    let n = 0;
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
      const ok = layer === 'wall' ? (this.isWall(x, y) && !this.isDoor(x, y)) : this.isInterior(x, y);
      if (ok && s[layer][this.idx(x, y)] !== id) n++;
    }
    return { n, cost: n * table[id].cost };
  },
  paintAll(layer, id) {
    const inf = this.paintAllInfo(layer, id);
    if (!inf.n) { this.toast('이미 전부 이 재질입니다'); return false; }
    if (!this.spend(inf.cost)) return false;
    const s = this.s;
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
      const ok = layer === 'wall' ? (this.isWall(x, y) && !this.isDoor(x, y)) : this.isInterior(x, y);
      if (ok) s[layer][this.idx(x, y)] = id;
    }
    this.recompute(); this.save();
    this.toast(`${inf.n}칸 일괄 적용 (−${inf.cost.toLocaleString()})`, 'good');
    return true;
  },

  removeObject(o) {
    this.s.objects = this.s.objects.filter(q => q !== o);
    const refund = Math.floor(this.objDef(o).cost / 2);
    this.s.money += refund;
    this.toast(`${this.objDef(o).name} 철거 (+${refund} 환급)`);
    this.recompute(); this.sfx('remove');
  },


  // ───────── 공간 확장 ─────────
  // dir: 'east' (오른쪽으로 2열) | 'north' (위로 2행 — 기존 것은 모두 아래로 밀린다)
  expandInfo(dir) {
    const s = this.s, plot = this.plot, n = s.expansions, step = DATA.expandStep;
    const cost = Math.round(plot.expandBase * (1 + 0.75 * n) / 100) * 100;
    const lv = 2 + n;
    const room = dir === 'east' ? plot.maxW - s.W : plot.maxH - s.H;
    let why = null;
    if (room < step) why = '최대 크기';
    else if (s.open) why = '영업 중에는 공사 불가';
    else if (s.level < lv) why = `Lv.${lv} 필요`;
    else if (s.money < cost) why = '돈 부족';
    return { cost, lv, why, room, step, newW: s.W + (dir === 'east' ? step : 0), newH: s.H + (dir === 'north' ? step : 0) };
  },
  expand(dir) {
    const info = this.expandInfo(dir);
    if (info.why) { this.toast(info.why, 'bad'); return false; }
    if (!this.spend(info.cost)) return false;
    const s = this.s, oW = s.W, oH = s.H, W = info.newW, H = info.newH;
    const dy = dir === 'north' ? info.step : 0;
    const N = W * H, ni = (x, y) => y * W + x, oi = (x, y) => y * oW + x;
    const nf = new Array(N).fill('dirt'), nw = new Array(N).fill('rawbrick'), nc = new Array(N).fill('beams');
    const np = { cold: new Array(N).fill(0), hot: new Array(N).fill(0), heat: new Array(N).fill(0) };
    for (let y = 0; y < oH; y++) for (let x = 0; x < oW; x++) {
      const i = oi(x, y), j = ni(x, y + dy);
      nf[j] = s.floor[i]; nw[j] = s.wall[i]; nc[j] = s.ceil[i];
      for (const t of ['cold', 'hot', 'heat']) np[t][j] = s.pipe[t][i];
    }
    // 새 벽은 원래 그 자리에 있던 벽 마감을 이어받는다
    if (dir === 'east') {
      for (let y = 0; y < H; y++) {
        const src = nw[ni(oW - 1, y)];
        for (let x = oW; x < W; x++) nw[ni(x, y)] = (y === 0 || y === H - 1) ? nw[ni(oW - 2, y)] : src;
        if (y > 0 && y < H - 1) { nf[ni(oW - 1, y)] = 'dirt'; nc[ni(oW - 1, y)] = 'beams'; }
      }
    } else {
      for (let x = 0; x < W; x++) {
        const src = nw[ni(x, dy)];
        nw[ni(x, 0)] = src;
        for (let y = 1; y <= dy; y++) nw[ni(x, y)] = (x === 0 || x === W - 1) ? nw[ni(x, dy + 1)] : src;
        if (x > 0 && x < W - 1) { nf[ni(x, dy)] = 'dirt'; nc[ni(x, dy)] = 'beams'; }
      }
    }
    s.leaks = s.leaks.map(l => ({ type: l.type, i: ni(l.i % oW, ((l.i / oW) | 0) + dy) }));
    for (const st of s.stains) st.y += dy;
    for (const o of s.objects) o.y += dy;
    s.W = W; s.H = H; s.floor = nf; s.wall = nw; s.ceil = nc; s.pipe = np;
    s.inletY = (s.inletY ?? 2) + dy;
    s.expansions++;
    // 거리 행인·바리스타 위치 초기화
    this.rt.customers = []; this.rt.staff = null; this.rt.serveQ = []; this.rt.cats = []; this.rt.crew = [];
    this.recompute(); this.save();
    this.toast(`🏗 ${dir === 'east' ? '동쪽' : '북쪽'}으로 확장 완료! ${W - 2}×${H - 2}칸`, 'good');
    this.emit('expanded');
    return true;
  },


  // ───────── 고양이 ─────────
  adoptCat(kind) {
    const s = this.s, k = DATA.cats.find(c => c.id === kind);
    if (s.cats.length >= DATA.catMax) { this.toast(`고양이는 ${DATA.catMax}마리까지`, 'bad'); return false; }
    if (k.lv > s.level) { this.toast(`Lv.${k.lv} 필요`, 'bad'); return false; }
    if (!this.spend(k.cost)) return false;
    const names = ['보일러', '톱니', '구리', '석탄', '라떼', '스콘', '밸브', '증기', '모카', '나사'];
    const used = new Set(s.cats.map(c => c.name));
    const name = names.find(n => !used.has(n)) || '냥' + (s.cats.length + 1);
    s.cats.push({ kind, name });
    this.recompute(); this.save();
    this.toast(`🐈 ${name}(${k.name})를 입양했어요! 따뜻한 바닥을 좋아합니다.`, 'good');
    return true;
  },
  // 실내에서 걸을 수 있는 칸 (heat=true 면 난방 칸만)
  catSpots(heat) {
    const s = this.s, out = [], hc = this.rt.nets.heatCover, run = this.boilerRunning();
    for (let y = 1; y < s.H - 1; y++) for (let x = 1; x < s.W - 1; x++) {
      if (!this.walkable(x, y) || this.isEntrance(x, y)) continue;
      if (heat && !(run && hc.has(this.idx(x, y)))) continue;
      out.push([x, y]);
    }
    return out;
  },
  updateCats(gm) {
    const s = this.s, rt = this.rt;
    // 저장된 고양이와 화면 고양이 맞추기
    while (rt.cats.length < s.cats.length) {
      const spots = this.catSpots(false); if (!spots.length) break;
      const [x, y] = spots[Math.floor(Math.random() * spots.length)];
      rt.cats.push({ ref: s.cats[rt.cats.length], x, y, path: [], state: 'sit', timer: 5, dir: 1, step: 0 });
    }
    rt.cats.length = Math.min(rt.cats.length, s.cats.length);
    for (const c of rt.cats) {
      if (c.path.length) {
        const [tx, ty] = c.path[0];
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), step = 0.45 * gm;
        if (Math.abs(dx) > 0.01) c.dir = dx > 0 ? 1 : -1;
        if (d <= step) { c.x = tx; c.y = ty; c.path.shift(); } else { c.x += dx / d * step; c.y += dy / d * step; }
        c.step += gm;
        if (!c.path.length) { c.state = c.goal; c.timer = c.goal === 'nap' ? 60 + Math.random() * 90 : 10 + Math.random() * 25; }
        continue;
      }
      // 서 있는 칸이 막혔으면(가구 설치) 옮긴다
      if (!this.walkable(Math.round(c.x), Math.round(c.y))) { const sp = this.catSpots(false); if (sp.length) [c.x, c.y] = sp[Math.floor(Math.random() * sp.length)]; }
      c.timer -= gm;
      if (c.timer > 0) continue;
      // 다음 행동: 난방 칸이 있으면 대체로 거기서 낮잠
      const warm = this.catSpots(true), goNap = warm.length && Math.random() < 0.65;
      const pool = goNap ? warm : this.catSpots(false);
      if (!pool.length) { c.timer = 20; continue; }
      const near = pool.filter(([x, y]) => Math.abs(x - c.x) + Math.abs(y - c.y) <= 8);
      const [gx, gy] = (near.length ? near : pool)[Math.floor(Math.random() * (near.length || pool.length))];
      const p = this.findPath(Math.round(c.x), Math.round(c.y), gx, gy);
      if (!p || !p.length) { c.state = goNap ? 'nap' : 'sit'; c.timer = 30; continue; }
      c.path = p; c.state = 'walk'; c.goal = goNap ? 'nap' : 'sit';
    }
  },
  catAt(x, y) { return this.rt.cats.find(c => Math.round(c.x) === x && Math.round(c.y) === y); },

  // ───────── 증기 은행 ─────────
  debt() { return this.s.loans.reduce((a, l) => a + l.balance, 0); },
  loanLimit() { return Math.round((4000 + this.s.level * 3000 + this.s.rep * 60) / 100) * 100; },
  loanInfo(id) {
    const d = DATA.loans.find(l => l.id === id), s = this.s;
    const rate = d.rate * (this.diff().loanRate ?? 1);
    const total = Math.round(d.amount * (1 + rate)), perDay = Math.ceil(total / d.days);
    let why = null;
    if (d.lv > s.level) why = `Lv.${d.lv} 필요`;
    else if (this.debt() + total > this.loanLimit()) why = '한도 초과';
    return { ...d, rate, total, perDay, why };
  },
  takeLoan(id) {
    const inf = this.loanInfo(id), s = this.s;
    if (inf.why) { this.toast(inf.why, 'bad'); return false; }
    s.money += inf.amount;
    s.loans.push({ uid: s.loanSeq++, id, name: inf.name, balance: inf.total, perDay: inf.perDay, missed: 0 });
    this.toast(`🏦 ${inf.name} ${inf.amount.toLocaleString()} 입금! 매일 마감 때 ${inf.perDay.toLocaleString()}씩 ${inf.days}일 상환`, 'good');
    this.save();
    return true;
  },
  repayLoan(uid, amount) {
    const s = this.s, l = s.loans.find(q => q.uid === uid);
    if (!l) return;
    const pay = Math.min(amount ?? l.balance, l.balance, Math.floor(s.money));
    if (pay <= 0) { this.toast('갚을 돈이 없습니다', 'bad'); return; }
    s.money -= pay; l.balance -= pay;
    if (l.balance <= 0) { s.loans = s.loans.filter(q => q !== l); this.toast(`🏦 ${l.name} 완납!`, 'good'); }
    else this.toast(`🏦 ${pay.toLocaleString()} 상환 (남은 ${l.balance.toLocaleString()})`);
    this.save();
  },
  // 영업 마감 때 자동 상환. 못 내면 연체료 + 평판 하락
  payLoans() {
    const s = this.s; let paid = 0;
    for (const l of [...s.loans]) {
      const due = Math.min(l.perDay, l.balance);
      if (s.money >= due) { s.money -= due; l.balance -= due; paid += due; }
      else {
        const fee = Math.ceil(due * DATA.loanLateFee * (this.diff().lateFee ?? 1));
        l.balance += fee; l.missed++;
        this.changeRep(-3);
        this.toast(`🏦 ${l.name} 상환금 ${due.toLocaleString()}을 못 냈습니다${fee ? ` — 연체료 ${fee} 추가` : ' — 내일 다시 갚아요'}`, 'bad');
      }
      if (l.balance <= 0) { s.loans = s.loans.filter(q => q !== l); this.toast(`🏦 ${l.name} 완납!`, 'good'); }
    }
    return paid;
  },

  // ───────── 난이도 ─────────
  diff() { return DATA.difficulty[this.s.difficulty] || DATA.difficulty.easy; },
  setDifficulty(k) { this.s.difficulty = k; this.save(); this.toast(`난이도: ${this.diff().name}`, 'good'); },
  // 평판 변화는 모두 여기로: 떨어질 때만 난이도 배율 (쉬움은 0 → 안 떨어짐)
  changeRep(delta) {
    if (delta < 0) delta *= this.diff().repLoss;
    this.s.rep = Math.max(0, Math.min(100, this.s.rep + delta));
  },
  patience(c) { return c.type.patience * this.diff().patience; },
  coalPrice() { return Math.round(DATA.coal.price * this.s.coalPriceMul * this.diff().coalMul); },

  // ───────── 자동 운영 ─────────
  // 켜 두면 게임 3분마다: 완성품 수거, 진열이 적은 메뉴부터 조리, 재료·석탄 보충, 압력·누수·얼룩 처리, 아침 개점
  setAuto(on) { this.s.auto = !!on; this.save(); this.toast(on ? '🤖 자동 운영 켬 — 조리·수거·재료 구매·사고 처리를 알아서 합니다' : '🤖 자동 운영 끔', on ? 'good' : 'info'); },
  autoTick(gm) {
    const s = this.s, rt = this.rt;
    if (!s.auto) return;
    rt.autoT = (rt.autoT || 0) + gm;
    if (rt.autoT < 3) return;
    rt.autoT = 0;
    // 아침: 정산 화면을 닫았으면 바로 개점
    const modalOpen = typeof document !== 'undefined' && document.getElementById('modal') && !document.getElementById('modal').hidden;
    if (!s.open) { if (!modalOpen && this.canOpen()) this.openCafe(); return; }
    // 사고 처리
    if (s.boiler.pressure > 70) this.ventValve();
    if (s.boiler.broken && s.money >= 800) this.repairBoiler();
    for (const l of [...s.leaks]) if (s.money >= 40) this.repairLeak(l.type, l.i);
    for (const st of [...s.stains]) this.wipeStain(st);
    // 수거 + 조리
    for (const o of s.objects) {
      const d = this.objDef(o); if (!d.cook) continue;
      if (o.cook && o.cook.done) { this.collect(o); continue; }
      if (o.cook || !this.working(o)) continue;
      const opts = Object.entries(DATA.recipes).filter(([rid, r]) => r.eq === o.id && !this.canCook(o, rid) && (s.counter[rid] || 0) < 12)
        .sort((a, b) => (s.counter[a[0]] || 0) - (s.counter[b[0]] || 0));
      if (opts.length) this.startCook(o, opts[0][0]);
    }
    // 재료 보충: 지금 만들 수 있는 메뉴에 쓰는 재료가 3개 미만이면 (돈이 넉넉할 때만)
    const eqs = new Set(s.objects.filter(o => this.objDef(o).cook).map(o => o.id)), need = new Set();
    for (const r of Object.values(DATA.recipes)) if (r.lv <= s.level && eqs.has(r.eq)) Object.keys(r.use).forEach(k => need.add(k));
    for (const k of need) if ((s.stock[k] || 0) < 3 && s.money >= DATA.ingredients[k].price * 3) this.buy(k);
    if (s.coal < 25 && !this.hasEvent('coalStrike') && s.money >= this.coalPrice() * 3) this.buy('coal');
  },

  // ───────── 커피 얼룩 ─────────
  // 좌석 옆 바닥(걸을 수 있는 칸)에 쏟는다. 칸 안 위치·크기는 무작위.
  spill(sx, sy) {
    const s = this.s;
    if (s.stains.length >= DATA.stain.max) return;
    const cands = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [sx + dx, sy + dy])
      .filter(([x, y]) => this.isInterior(x, y) && this.walkable(x, y) && !s.stains.some(st => st.x === x && st.y === y));
    if (!cands.length) return;
    const [x, y] = cands[Math.floor(Math.random() * cands.length)];
    s.stains.push({ x, y, ox: 3 + Math.floor(Math.random() * 8), oy: 4 + Math.floor(Math.random() * 7), r: 2 + Math.floor(Math.random() * 2), seed: Math.floor(Math.random() * 999) });
    this.rt.dirty = true;
    if (!s.stainHint) { s.stainHint = true; this.toast('☕ 손님이 커피를 쏟았어요! 얼룩을 클릭해서 닦으세요 (분위기·만족도 감소)', 'warn'); }
  },
  stainAt(x, y) { return this.s.stains.find(st => st.x === x && st.y === y); },
  wipeStain(st) {
    this.s.stains = this.s.stains.filter(q => q !== st);
    for (let i = 0; i < 6; i++) this.rt.particles.push({ x: st.x * 16 + st.ox + (Math.random() - 0.5) * 8, y: st.y * 16 + st.oy, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 8, life: 0.7, max: 1, color: i % 2 ? '#ffffff' : '#bfe6ff', size: 1 });
    this.float(st.x + 0.5, st.y, '반짝!', '#bfe6ff'); this.sfx('wipe');
    this.addXp(1);
    this.rt.dirty = true;
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
    this.sfx('cook_' + r.eq);
    return true;
  },
  collect(o) {
    if (!o.cook || !o.cook.done) return false;
    if (!this.s.objects.some(q => q.id === 'counter')) { this.toast('서빙 카운터가 필요합니다', 'bad'); return false; }
    const r = DATA.recipes[o.cook.rid];
    this.s.counter[o.cook.rid] = (this.s.counter[o.cook.rid] || 0) + r.yield;
    this.float(o.x + 0.5, o.y, `+${r.yield} ${r.name}`, '#ffe9a8'); this.sfx('clink');
    o.cook = null;
    return true;
  },

  // ───────── 상점 ─────────
  // 묶음 단위로 qty 개 한꺼번에 (상점 확인창에서 개수 조절)
  buy(kind, qty = 1) {
    qty = Math.max(1, Math.floor(qty));
    if (kind === 'coal') {
      if (this.hasEvent('coalStrike')) { this.toast('석탄 배달부 파업 중!', 'bad'); return false; }
      if (!this.spend(this.coalPrice() * qty)) return false;
      this.s.coal += DATA.coal.pack * qty; this.sfx('coal');
      return true;
    }
    const ing = DATA.ingredients[kind];
    if (!this.spend(ing.price * qty)) return false;
    this.s.stock[kind] += ing.pack * qty; this.sfx('buy');
    return true;
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
    this.toast(`☕ ${this.s.day}일차 영업 시작! 날씨: ${this.weather().name}`); this.sfx('open');
    this.emit('opened');
  },
  closeCafe() {
    const s = this.s;
    s.open = false;
    for (const c of this.rt.customers) if (c.state === 'eating') this.payCustomer(c);
    this.rt.customers = []; this.rt.serveQ = [];
    if (this.rt.staff) { this.rt.staff.path = []; this.rt.staff.carry = null; this.rt.staff.target = null; }
    for (const r of this.s.objects) if (r.cook && !r.cook.done) r.cook = null;
    const loanPaid = this.payLoans();
    const food = s.cats.length * DATA.catFoodPerDay;
    if (food) { s.money -= food; s.today.spent += food; }
    const wages = this.wages();
    if (wages) { s.money -= wages; s.today.spent += wages; }
    const robotCoal = Math.min(s.coal, this.robotCoal());
    s.coal -= robotCoal;
    for (const e of this.rt.crew) { e.path = []; e.task = null; e.carry = null; }
    const summary = { ...s.today, day: s.day, endMoney: s.money, catFood: food, wages, robotCoal, loanPaid, debt: this.debt() };
    s.events = []; s.coalPriceMul = 1; s.boiler.pressure = Math.min(s.boiler.pressure, 50);
    s.day++; s.min = OPEN_HOUR * 60;
    this.rollWeather();
    this.resetToday();
    this.recompute();
    this.save();
    this.sfx('close'); this.emit('dayEnd', summary);
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
    const s = this.s, side = Math.random() < 0.5 ? 0 : 1, sx = this.sideX(side, false);
    const type = this.pickType(forceVip);
    const c = { id: this.rt.cid++, type, x: sx, y: s.H + 1 + (Math.random() < 0.5 ? 1 : 0), path: [], state: 'pass', seat: null, order: null, wait: 0, timer: 0, frame: 0, step: 0, sat: 0 };
    const seats = this.reachableSeats();
    if (seats.length) {
      const st = seats[Math.floor(Math.random() * seats.length)];
      const p = this.findPath(c.x, c.y, st.x, st.y);
      if (p) { c.seat = st; c.path = p; c.state = 'toSeat'; this.sfx('bell'); }
    }
    if (c.state === 'pass') c.path = this.findPath(c.x, c.y, this.sideX(1 - side, true), c.y) || [];
    this.rt.customers.push(c);
    return c;
  },
  spawnPasser() {
    const s = this.s, side = Math.random() < 0.5 ? 0 : 1, row = s.H + 1 + (Math.random() < 0.5 ? 0 : 1), sx = this.sideX(side, true);
    const c = { id: this.rt.cid++, type: this.pickType(), x: sx, y: row, path: [], state: 'pass', frame: 0, step: 0 };
    c.path = this.findPath(sx, row, this.sideX(1 - side, true), row) || [];
    this.rt.customers.push(c);
  },

  customerLeave(c, angry) {
    const s = this.s;
    if (angry) {
      s.today.angry++;
      this.changeRep(-(c.type.vip ? 4 : 1.2));
      this.float(c.x + 0.5, c.y - 0.5, DATA.byeLines[Math.floor(Math.random() * DATA.byeLines.length)], '#e8dcc0');
    }
    c.state = 'leaving'; c.order = null;
    const sx = Math.round(c.x), sy = Math.round(c.y);
    c.path = this.findPath(sx, sy, this.sideX(Math.random() < 0.5 ? 0 : 1, true), s.H + 1 + (Math.random() < 0.5 ? 1 : 0)) || [];
    c.seat = null;
  },

  satisfaction(c) {
    const n = this.rt.nets, th = this.thermal(), t = th.temp, rh = th.rh;
    let sat = 55 + Math.min(30, n.density * 4) - c.type.picky;
    sat += t >= 27 ? -6 : t >= 20 ? 12 : t >= 18 ? 5 : t >= 14 ? -8 : -25;
    sat += rh < 25 ? -5 : rh < 35 ? 0 : rh <= 60 ? 3 : rh <= 70 ? -2 : -6;
    if (c.seat && this.rt.cats.some(k => Math.abs(k.x - c.seat.x) + Math.abs(k.y - c.seat.y) <= 2)) sat += 6;
    if (c.seat && this.s.stains.some(st => Math.abs(st.x - c.seat.x) + Math.abs(st.y - c.seat.y) <= 1)) sat -= DATA.stain.nearSat;
    if (c.seat && this.nightLevel() > 0.35 && !this.rt.nets.lit.has(this.idx(c.seat.x, c.seat.y))) sat -= DATA.darkSeatPenalty;
    sat -= (c.wait / this.patience(c)) * 25;
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
    this.changeRep((sat - 55) / 45 * (c.type.vip ? 2.4 : 1.0));
    this.addXp(c.type.vip ? 12 : 4);
    // 손님은 늘 좋은 말을 하고 나간다 (만족도는 팁·하트 크기로만 드러남)
    const line = sat >= 55 || Math.random() < 0.6 ? DATA.happyLines[Math.floor(Math.random() * DATA.happyLines.length)] : '';
    this.float(c.x + 0.5, c.y - 0.6, `+${base + tipAmt}${tipAmt ? ' (팁)' : ''} ${line}`, '#ffd76a');
    this.rt.reacts.push({ x: c.x, y: c.y, kind: sat >= 55 ? 'heart' : 'heartHalf', life: 1.6 });
    this.sfx(tipAmt ? 'coinTip' : 'coin');
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
      this.emit('levelUp'); this.sfx('levelup');
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
        const s = g.s, ok = s.boiler.pressure < 80 && !s.leaks.length && s.stains.length <= 5 && s.objects.some(o => o.id === 'sink' && g.working(o));
        if (ok) { s.money += 300; g.changeRep(3); g.toast('🔍 증기 안전 감독관 점검 통과! 포상금 300, 평판 상승', 'good'); }
        else { s.money -= 250; g.toast('🔍 감독관 점검 불합격 (압력/누수/위생 문제) — 벌금 250', 'bad'); }
      }, instant: true },
  },

  triggerEvent(id) {
    const ev = this.EVENTS[id];
    if (!ev) return;
    if (!ev.instant) this.s.events.push({ id, until: ev.dur ? this.s.min + ev.dur : Infinity });
    ev.start(this);
    this.emit('event', id); this.sfx('whistle');
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
    b.pressure = Math.max(0, b.pressure - 22); this.sfx('vent');
    const boiler = this.s.objects.find(o => o.id === 'boiler');
    if (boiler) this.puff(boiler.x * 16 + 24, boiler.y * 16 - 2, 'rgba(255,255,255,0.9)', 14, 8);
    if (b.pressure < 60) this.s.events = this.s.events.filter(e => e.id !== 'pressure');
  },
  repairBoiler() {
    if (!this.s.boiler.broken) return;
    if (!this.spend(800)) return;
    this.s.boiler.broken = false; this.s.boiler.pressure = 40;
    this.toast('🔧 보일러 수리 완료 (-800)', 'good'); this.sfx('repair');
  },
  repairLeak(type, i) {
    if (!this.spend(40)) return;
    this.s.leaks = this.s.leaks.filter(l => !(l.type === type && l.i === i));
    this.recompute();
    this.toast('🔧 누수 수리 완료'); this.sfx('repair');
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
      this.updateCrew(dt * MIN_PER_SEC);
      this.updateCats(dt * MIN_PER_SEC);
      this.autoTick(dt * MIN_PER_SEC);
      return;
    }

    s.min += gm;
    // 해 질 무렵 조명 안내 (하루 한 번)
    if (s.min >= 16 * 60 && !s.today.lightHint) {
      s.today.lightHint = true;
      const cov = this.litSeats();
      if (cov < 0.8) this.toast(`🌙 곧 해가 집니다. 조명이 안 닿는 좌석이 ${Math.round((1 - cov) * 100)}% 예요 — 인테리어 › 조명에서 가스등을 달면 밤 손님 만족도가 올라요`, 'warn');
    }
    // 눈 쌓임: 눈 오는 날 천천히, 눈보라면 빠르게. 맑으면 녹는다
    const snowRate = this.hasEvent('blizzard') ? 0.5 : s.weather === 'snow' ? 0.12 : s.weather === 'sunny' ? -0.15 : s.weather === 'rain' ? -0.25 : -0.03;
    s.snow = Math.max(0, Math.min(1, (s.snow || 0) + snowRate * gm / 60));

    // 석탄 소비
    if (running) {
      const cooking = s.objects.filter(o => o.cook && !o.cook.done).length;
      const th = this.thermal();
      let use = (0.03 + th.supply / DATA.thermal.heatPerTile * 0.0015 + cooking * 0.01) * gm;
      s.coal = Math.max(0, s.coal - use); s.today.coalUsed += use;
      if (s.coal <= 0) this.toast('⚫ 석탄이 떨어져 보일러가 꺼졌습니다! 상점에서 구매하세요.', 'bad');
    }
    // 압력
    const b = s.boiler;
    if (running) {
      if (this.hasEvent('pressure')) b.pressure += 0.9 * gm;
      else b.pressure += (52 - b.pressure) * Math.min(1, 0.05 * gm);
      if (b.pressure >= 100) {
        b.broken = true; b.pressure = 0; this.sfx('boom');
        s.events = s.events.filter(e => e.id !== 'pressure');
        this.changeRep(-4);
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
        if (o.cook.t >= o.cook.total) { o.cook.done = true; this.sfx('ding'); if (hasAuto) this.collect(o); }
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
    this.updateCrew(gm);
    this.updateCats(gm);
    this.autoTick(gm);

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
        if (!c.assigned && (s.counter[c.order] || 0) > 0) { s.counter[c.order]--; c.assigned = true; c.timer = 4; if (this.hasServer()) rt.serveQ.push(c); }
        if (c.assigned && !this.hasServer()) { c.timer -= gm; if (c.timer <= 0) this.serve(c); }
        else if (c.wait > this.patience(c)) this.customerLeave(c, true);
        continue;
      }
      if (c.state === 'eating') {
        c.timer -= gm;
        if (c.timer <= 0) {
          this.payCustomer(c);
          if (c.seat && Math.random() < DATA.stain.chance) this.spill(c.seat.x, c.seat.y);
          this.customerLeave(c, false);
        }
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
    c.state = 'eating'; c.timer = 30 + Math.random() * 20; this.sfx('serve');
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
        // 가져가는 사이 손님이 떠났으면(seat 가 비었으면) 방향만 건너뛴다
        const seat = st.target.seat;
        if (seat) { st.face = seat.y < st.y ? 'up' : seat.y > st.y ? 'down' : 'side'; if (st.face === 'side') st.dir = seat.x > st.x ? 1 : -1; }
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

  // ───────── 고용 직원 ─────────
  // 서빙 직원은 주인공과 같은 서빙 대기열을 나눠 갖고, 나머지는 각자 할 일을 찾아 걸어가서 처리한다.
  staffCap() { return 2 + Math.floor((this.s.level - 1) / 2); },
  robotCap() { return 1 + Math.floor(this.s.level / 3); },
  role(kind) { return DATA.staff[kind].role || kind; },
  isRobot(kind) { return !!DATA.staff[kind].robot; },
  robotCoal() { return this.s.crew.reduce((a, c) => a + (DATA.staff[c.kind].coal || 0), 0); },
  hasServer() { return !!this.rt.staff || this.rt.crew.some(e => this.role(e.ref.kind) === 'waiter'); },
  wages() { return this.s.crew.reduce((a, c) => a + DATA.staff[c.kind].wage, 0); },
  hireInfo(kind) {
    const d = DATA.staff[kind], s = this.s, n = s.crew.filter(c => c.kind === kind).length;
    const robot = !!d.robot, same = s.crew.filter(c => this.isRobot(c.kind) === robot).length;
    const why = d.lv > s.level ? `Lv.${d.lv}` : n >= d.max ? '최대' : same >= (robot ? this.robotCap() : this.staffCap()) ? '자리 없음' : s.money < d.hire ? '돈 부족' : null;
    return { why, n };
  },
  hire(kind) {
    const d = DATA.staff[kind], inf = this.hireInfo(kind);
    if (inf.why) { this.toast(inf.why === '자리 없음' ? (d.robot ? `지금 레벨에서는 로봇을 ${this.robotCap()}대까지` : `지금 레벨에서는 직원을 ${this.staffCap()}명까지 둘 수 있어요`) : inf.why === '최대' ? `${d.name}은(는) ${d.max}명까지` : inf.why, 'bad'); return false; }
    if (!this.spend(d.hire)) return false;
    const used = new Set(this.s.crew.map(c => c.name)), pool = (d.robot ? DATA.robotNames : DATA.staffNames).filter(n => !used.has(n));
    let name = pool[Math.floor(Math.random() * pool.length)] || '직원';
    if (d.robot) name = `${name}-${10 + Math.floor(Math.random() * 90)}`;
    this.s.crew.push({ uid: this.s.nextUid++, kind, name, char: d.chars ? d.chars[Math.floor(Math.random() * d.chars.length)] : null });
    this.syncCrew(); this.save();
    this.toast(d.robot ? `🤖 ${name} (${d.name}) 가동! 매일 석탄 ${d.coal}` : `${d.icon} ${name} (${d.name}) 고용! 일급 🪙${d.wage}`, 'good'); this.sfx(d.robot ? 'heavy' : 'bell');
    return true;
  },
  fire(uid) {
    const c = this.s.crew.find(c => c.uid === uid); if (!c) return;
    const e = this.rt.crew.find(e => e.ref === c);
    if (e && e.task && e.task.k === 'serve' && e.task.ref.state === 'waiting') this.rt.serveQ.unshift(e.task.ref);   // 들고 있던 서빙은 되돌림
    this.s.crew = this.s.crew.filter(q => q !== c);
    this.syncCrew(); this.save();
    this.toast(this.isRobot(c.kind) ? `🤖 ${c.name}의 증기를 빼고 창고로 보냈어요` : `${c.name}에게 작별 인사를 했어요`);
  },
  crewAt(x, y) { return this.rt.crew.find(e => Math.round(e.x) === x && Math.round(e.y) === y); },
  // 대기 자리: 카운터에서 가까운 빈 칸부터 (주인공 자리·좌석·입구 제외)
  crewHome(i) {
    const s = this.s, counter = s.objects.find(o => o.id === 'counter');
    const cx = counter ? counter.x + 1 : s.W / 2, cy = counter ? counter.y : s.H / 2, hero = this.staffHome(), tiles = [];
    for (let y = 1; y < s.H - 1; y++) for (let x = 1; x < s.W - 1; x++) {
      if (!this.isInterior(x, y) || !this.walkable(x, y) || this.isEntrance(x, y)) continue;
      if (hero && hero[0] === x && hero[1] === y) continue;
      if (this.rt.nets && this.rt.nets.seats.some(st => st.x === x && st.y === y)) continue;
      tiles.push([x, y, Math.abs(x - cx) + Math.abs(y - cy)]);
    }
    tiles.sort((a, b) => a[2] - b[2]);
    const t = tiles[Math.min(tiles.length - 1, 1 + i * 2)];
    return t ? [t[0], t[1]] : null;
  },
  syncCrew() {
    const rt = this.rt;
    rt.crew = rt.crew.filter(e => this.s.crew.includes(e.ref));
    for (const c of this.s.crew) if (!rt.crew.some(e => e.ref === c)) {
      const h = this.crewHome(rt.crew.length) || [this.door.x, this.door.y - 1];
      rt.crew.push({ ref: c, x: h[0], y: h[1], path: [], face: 'down', dir: 1, step: 0, cast: 0, look: 0, task: null, carry: null });
    }
    rt.crew.forEach((e, i) => {
      e.home = this.crewHome(i) || [Math.round(e.x), Math.round(e.y)];
      if (!e.path.length && !this.walkable(Math.round(e.x), Math.round(e.y))) { e.x = e.home[0]; e.y = e.home[1]; }
    });
  },
  walkCrew(e, gm, speed = 0.75) {
    const [tx, ty] = e.path[0];
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), step = speed * gm;
    if (Math.abs(dx) > Math.abs(dy)) { e.face = 'side'; e.dir = dx > 0 ? 1 : -1; } else if (Math.abs(dy) > 0.001) e.face = dy > 0 ? 'down' : 'up';
    if (d <= step) { e.x = tx; e.y = ty; e.path.shift(); } else { e.x += dx / d * step; e.y += dy / d * step; }
    e.step += gm;
    return !e.path.length;
  },
  faceTo(e, x, y) { const dx = x - e.x, dy = y - e.y; if (Math.abs(dx) > Math.abs(dy)) { e.face = 'side'; e.dir = dx > 0 ? 1 : -1; } else e.face = dy < 0 ? 'up' : 'down'; },
  pathToObj(e, o) {
    let best = null; const sx = Math.round(e.x), sy = Math.round(e.y);
    for (const [fx, fy] of this.footprint(o)) { const p = this.pathNextTo(sx, sy, fx, fy); if (p && (!best || p.length < best.length)) best = p; }
    return best;
  },
  // 이 설비로 지금 만들 메뉴: 재료가 있고 진열이 12개 미만인 것 중 가장 적은 것
  pickRecipe(o) {
    const s = this.s;
    const opts = Object.entries(DATA.recipes).filter(([rid, r]) => r.eq === o.id && !this.canCook(o, rid) && (s.counter[rid] || 0) < 12)
      .sort((a, b) => (s.counter[a[0]] || 0) - (s.counter[b[0]] || 0));
    return opts.length ? opts[0][0] : null;
  },
  findJob(e) {
    const s = this.s, rt = this.rt, kind = this.role(e.ref.kind), sx = Math.round(e.x), sy = Math.round(e.y);
    if (this.isRobot(e.ref.kind) && !this.boilerRunning()) return null;   // 로봇은 증기가 있어야 움직인다
    const taken = (k, ref) => rt.crew.some(o => o !== e && o.task && o.task.k === k && o.task.ref === ref);
    if (kind === 'waiter') {
      if (!s.open) return null;
      const q = rt.serveQ; while (q.length && q[0].state !== 'waiting') q.shift();
      const c = q.shift(); if (!c || !c.seat) return null;
      const p = this.pathNextTo(sx, sy, c.seat.x, c.seat.y);
      if (!p) { this.serve(c); return null; }
      return { k: 'serve', ref: c, path: p, carry: c.order, x: c.seat.x, y: c.seat.y, act: () => this.serve(c) };
    }
    if (kind === 'barista') {
      if (!s.open || !s.objects.some(o => o.id === 'counter')) return null;
      const done = s.objects.find(o => o.cook && o.cook.done && !taken('collect', o));
      if (done) { const p = this.pathToObj(e, done); if (p) return { k: 'collect', ref: done, path: p, x: done.x, y: done.y, act: () => this.collect(done) }; }
      for (const o of s.objects) {
        if (!this.objDef(o).cook || o.cook || !this.working(o) || taken('cook', o)) continue;
        const rid = this.pickRecipe(o); if (!rid) continue;
        const p = this.pathToObj(e, o); if (!p) continue;
        return { k: 'cook', ref: o, path: p, x: o.x, y: o.y, act: () => { if (!o.cook && !this.canCook(o, rid)) this.startCook(o, rid); } };
      }
      return null;
    }
    if (kind === 'cleaner') {
      for (const st of s.stains) {
        if (taken('wipe', st)) continue;
        const p = sx === st.x && sy === st.y ? [] : this.walkable(st.x, st.y) ? this.findPath(sx, sy, st.x, st.y) : this.pathNextTo(sx, sy, st.x, st.y);
        if (p) return { k: 'wipe', ref: st, path: p, x: st.x, y: st.y + 1, act: () => { if (s.stains.includes(st)) this.wipeStain(st); } };
      }
      return null;
    }
    if (kind === 'stoker') {
      const b = s.boiler, boiler = s.objects.find(o => o.id === 'boiler');
      if (s.coal < 15 && !this.hasEvent('coalStrike') && s.money >= this.coalPrice() * 3 && this.buy('coal', 2)) this.toast(`🔧 ${e.ref.name}: 석탄 2자루 주문했어요`);
      if (boiler && !taken('boiler', boiler)) {
        const fix = b.broken && s.money >= 1200, vent = !b.broken && b.pressure > 70;
        if (fix || vent) { const p = this.pathToObj(e, boiler); if (p) return { k: 'boiler', ref: boiler, path: p, x: boiler.x, y: boiler.y, act: () => fix ? this.repairBoiler() : this.ventValve() }; }
      }
      for (const lk of s.leaks) {
        if (taken('leak', lk) || s.money < 40) continue;
        const lx = lk.i % s.W, ly = (lk.i / s.W) | 0;
        const p = this.pathNextTo(sx, sy, lx, ly) || (this.walkable(lx, ly) ? this.findPath(sx, sy, lx, ly) : null);
        if (p) return { k: 'leak', ref: lk, path: p, x: lx, y: ly, act: () => { if (s.leaks.includes(lk)) this.repairLeak(lk.type, lk.i); } };
      }
      return null;
    }
    return null;
  },
  updateCrew(gm) {
    for (const e of this.rt.crew) {
      e.cast = Math.max(0, e.cast - gm);
      if (e.cast > 0) continue;
      // 할 일 찾기 (집에 돌아가는 중에도)
      if (!e.task) {
        e.look -= gm;
        if (e.look <= 0) { e.look = 0.6; const job = this.findJob(e); if (job) { e.task = job; e.path = job.path; e.carry = job.carry || null; } }
      }
      const d = DATA.staff[e.ref.kind];
      if (d.robot && !this.boilerRunning()) { e.path = []; e.task = null; e.carry = null; continue; }   // 증기가 끊기면 그 자리에 멈춤
      if (d.robot && e.path.length && Math.random() < gm * 0.4) this.puff(e.x * 16 + 8, e.y * 16 - 6, 'rgba(240,240,240,0.6)');
      if (e.path.length && !this.walkCrew(e, gm, d.speed || 0.75)) continue;
      if (e.task) {
        const t = e.task; e.task = null;
        if (t.x != null) this.faceTo(e, t.x, t.y);
        t.act(); e.cast = 1.5; e.carry = null; e.look = 0;
      } else if (Math.round(e.x) !== e.home[0] || Math.round(e.y) !== e.home[1]) {
        e.path = this.findPath(Math.round(e.x), Math.round(e.y), e.home[0], e.home[1]) || [];
        if (!e.path.length) { e.home = [Math.round(e.x), Math.round(e.y)]; }
      }
    }
  },

  timeStr() {
    const m = Math.floor(this.s.min), h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(Math.floor(mm / 10) * 10).padStart(2, '0')}`;
  },
};
