// 렌더러: world(저해상도 도트) + fx(고해상도 텍스트) 2장 캔버스
const Render = {
  world: null, wg: null, fx: null, fg: null, light: null, lg: null,
  scale: 3, t: 0, flakes: [],

  init(worldCanvas, fxCanvas) {
    this.world = worldCanvas; this.wg = worldCanvas.getContext('2d');
    this.fx = fxCanvas; this.fg = fxCanvas.getContext('2d');
    [this.light, this.lg] = makeCanvas(1, 1);
  },

  resize(container) {
    const s = Game.s; if (!s) return;
    const ww = s.W * TILE, wh = (s.H + STREET_ROWS) * TILE;
    this.world.width = ww; this.world.height = wh;
    this.light.width = ww; this.light.height = wh;
    const availW = container.clientWidth, availH = container.clientHeight;
    let sc = Math.min(availW / ww, availH / wh);
    sc = sc >= 2 ? Math.floor(sc) : Math.max(1, Math.floor(sc * 2) / 2);
    this.scale = sc;
    const cw = Math.round(ww * sc), ch = Math.round(wh * sc);
    for (const c of [this.world, this.fx]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    const dpr = window.devicePixelRatio || 1;
    this.fx.width = Math.round(cw * dpr); this.fx.height = Math.round(ch * dpr);
    this.dpr = dpr;
  },

  // 화면 좌표 → 타일
  tileAt(clientX, clientY) {
    const r = this.fx.getBoundingClientRect();
    const px = (clientX - r.left) / r.width * this.world.width, py = (clientY - r.top) / r.height * this.world.height;
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE), px, py };
  },

  draw(ui, dt) {
    const s = Game.s, g = this.wg; if (!s) return;
    this.t += dt;
    g.imageSmoothingEnabled = false;
    const P = pen(g);
    const { W, H } = s;
    const util = ui.mode === 'utility';
    const ceilView = ui.mode === 'interior' && ui.sub === 'ceil';

    // 1. 타일
    for (let y = 0; y < H + STREET_ROWS; y++) for (let x = 0; x < W; x++) {
      const v = Math.floor(hash(x, y, 1) * 2);
      if (y >= H) { g.drawImage(Sprites.street(v), x * TILE, y * TILE); continue; }
      const i = Game.idx(x, y);
      if (Game.isWall(x, y)) g.drawImage(Sprites.wall(s.wall[i], v), x * TILE, y * TILE);
      else g.drawImage(Sprites.floor(s.floor[i], v), x * TILE, y * TILE);
    }
    // 연석
    P.r(0, H * TILE, W * TILE, 1, PAL.s3);
    this.drawDoor(P); this.drawInlet(P);
    P.r(0, (H + 1) * TILE, W * TILE, 1, PAL.s1); // 보도/차도 경계

    // 2. 설비 보기: 바닥 어둡게 + 난방 범위
    const n = Game.rt.nets, running = Game.boilerRunning();
    if (util) {
      g.fillStyle = 'rgba(8,10,16,0.45)'; g.fillRect(TILE, TILE, (W - 2) * TILE, (H - 2) * TILE);
      if (running) {
        g.fillStyle = 'rgba(255,140,40,0.16)';
        for (const i of n.heatCover) g.fillRect((i % W) * TILE, ((i / W) | 0) * TILE, TILE, TILE);
      }
      this.drawHeatPipes(P);
    }

    // 3. 오브젝트 + 손님 (깊이 정렬)
    const items = [];
    for (const o of s.objects) {
      const d = DATA.objects[o.id];
      if (d.layer === 'ceil') continue;
      items.push({ z: o.y + d.h, kind: 'obj', o });
    }
    for (const c of Game.rt.customers) items.push({ z: c.y + 1.02, kind: 'cust', c });
    if (Game.rt.staff) items.push({ z: Game.rt.staff.y + 1.03, kind: 'staff' });
    for (const d of this.streetDecor()) items.push({ z: d.z, kind: 'img', d });
    items.sort((a, b) => a.z - b.z);
    g.globalAlpha = util ? 0.55 : 1;
    for (const it of items) {
      if (it.kind === 'obj') this.drawObject(P, it.o);
      else if (it.kind === 'cust') this.drawCustomer(P, it.c);
      else if (it.kind === 'staff') this.drawStaff(P);
      else g.drawImage(it.d.img, Math.round(it.d.x - it.d.img.width / 2), it.d.y - it.d.img.height);
    }
    g.globalAlpha = 1;

    // 4. 배관 (설비 보기)
    if (util) this.drawLanePipes(P);
    this.drawLeaks(P, util);

    // 5. 천장 보기
    if (ceilView) {
      g.globalAlpha = 0.93;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g.drawImage(Sprites.ceil(s.ceil[Game.idx(x, y)]), x * TILE, y * TILE);
      for (const o of s.objects) if (DATA.objects[o.id].layer === 'ceil') g.drawImage(Sprites.object(o.id).canvas, o.x * TILE, o.y * TILE);
      g.globalAlpha = 1;
    }

    // 6. 상태 표시(말풍선 등)
    if (!ceilView) {
      for (const o of s.objects) this.drawObjStatus(P, o, util);
      for (const c of Game.rt.customers) this.drawCustBubble(P, c);
      this.drawStaffCarry(P);
      for (const r of Game.rt.reacts) { g.globalAlpha = Math.min(1, r.life * 1.5); g.drawImage(Sprites.kenney(r.kind), Math.round(r.x * TILE) - 1, Math.round(r.y * TILE) - 34); }
      g.globalAlpha = 1;
    }

    // 7. 파티클
    for (const p of Game.rt.particles) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 1.2));
      g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;

    // 8. 조명/날씨
    if (!ceilView) this.drawLighting(g);
    this.drawWeather(g, dt);

    // 9. 커서 미리보기
    this.drawGhost(P, ui);

    // 10. fx: 텍스트
    this.drawFx();
  },

  drawDoor(P) {
    const d = Game.door, x = d.x * TILE, y = d.y * TILE;
    P.r(x, y, 16, 16, PAL.k);
    P.r(x + 2, y + 1, 12, 15, PAL.w1); P.r(x + 3, y + 2, 4, 13, PAL.w2); P.r(x + 9, y + 2, 4, 13, PAL.w2);
    P.r(x + 4, y + 3, 2, 4, PAL.bl3); P.r(x + 10, y + 3, 2, 4, PAL.bl3);
    P.p(x + 8, y + 9, PAL.b3); P.r(x, y + 15, 16, 1, PAL.s3);
  },
  drawInlet(P) {
    const l = Game.inlet, x = l.x * TILE, y = l.y * TILE;
    P.box(x + 3, y + 4, 10, 10, PAL.bl1);
    P.ring(x + 8, y + 9, 3, PAL.bl3); P.p(x + 8, y + 9, PAL.b3);
    P.r(x + 12, y + 8, 4, 3, PAL.i2);
  },
  lampXs() { return [0, Game.s.W - 1]; },
  // 가게 앞 보도 소품 (NAPLE props): 바닥 기준점 x(중앙), y(발끝)
  streetDecor() {
    const s = Game.s, d = Game.door, y = (s.H + 1) * TILE - 1, out = [];
    if (!Sprites.sheets.props) return out;
    const at = (key, tx, dx = 8) => out.push({ img: Sprites.prop(key), x: tx * TILE + dx, y, z: s.H + 1 });
    // 가로등은 차도 끝 연석에 (보도에 두면 실내를 너무 가린다)
    for (const x of this.lampXs()) out.push({ img: Sprites.prop('v_lamp'), x: x * TILE + 8, y: (s.H + STREET_ROWS) * TILE - 1, z: s.H + STREET_ROWS });
    at('v_sign_leaf', d.x - 1, 6);
    if (d.x - 4 >= 2) at('v_bench', d.x - 4, 16);
    if (d.x + 2 < s.W - 2) at('v_bush_a', d.x + 2);
    if (d.x + 4 < s.W - 2) at('v_flower_r', d.x + 4);
    if (d.x - 2 >= 2) at('v_flower_y', d.x - 2);
    if ((s.weather === 'snow' || Game.hasEvent('blizzard')) && Sprites.sheets.kenney) out.push({ img: Sprites.kenney('snowman'), x: (s.W - 3) * TILE + 8, y, z: s.H + 1 });
    return out;
  },

  drawObject(P, o) {
    const spr = Sprites.object(o.id), d = DATA.objects[o.id];
    this.wg.drawImage(spr.canvas, o.x * TILE + spr.xoff, (o.y + d.h) * TILE - spr.canvas.height);
    // 애니메이션
    const t = this.t, x = o.x * TILE, y = o.y * TILE;
    if (o.id === 'boiler') {
      const run = Game.boilerRunning(), T = 14, oy = y - T;
      if (run) {
        const f = Math.floor(t * 8) % 3;
        P.r(x + 17, oy + 25, 7, 5, [PAL.glow0, PAL.glow1, PAL.glow0][f]);
        P.r(x + 18 + f, oy + 27, 2, 2, PAL.glow2);
        [18, 20, 22].forEach(gx => P.r(x + gx, oy + 25, 1, 5, PAL.i0));
      }
      // 압력계 바늘
      const pr = Game.s.boiler.pressure / 100, ang = Math.PI * (0.75 + pr * 1.5);
      const nx = Math.round(Math.cos(ang) * 2), ny = Math.round(Math.sin(ang) * 2);
      P.p(x + 9, oy + 25, PAL.k); P.p(x + 9 + nx, oy + 25 + ny, pr > 0.8 ? PAL.red2 : PAL.k);
      if (Game.s.boiler.broken) { P.r(x + 6, oy + 14, 20, 2, PAL.k); P.line(x + 8, oy + 12, x + 24, oy + 36, PAL.k); }
    } else if (o.id === 'gramophone' && Game.s.open) {
      const k = Math.floor(t * 2) % 4; P.p(x + 13 + (k % 2), y - 10 - k * 2, PAL.cr2); P.p(x + 14 + (k % 2), y - 11 - k * 2, PAL.cr2);
    } else if (o.id === 'fountain') {
      const k = Math.floor(t * 6) % 4;
      for (let i = 0; i < 6; i++) P.p(x + 6 + ((i * 5 + k) % 20), y + 16 + ((i * 3 + k) % 6), PAL.bl3);
    } else if (o.id === 'clock') {
      const sw = Math.round(Math.sin(t * 3) * 2); P.r(x + 7, y - 4, 2, 7, PAL.i0); P.line(x + 8, y - 4, x + 8 + sw, y + 2, PAL.b2); P.p(x + 8 + sw, y + 3, PAL.b3);
    } else if (o.id === 'automaton' && Game.working(o)) {
      if (Math.floor(t * 2) % 6 === 0) { P.r(x + 5, y - 5, 2, 1, PAL.b2); P.r(x + 9, y - 5, 2, 1, PAL.b2); }
    }
  },

  custFoot(c) {
    const sitting = c.state === 'waiting' || c.state === 'eating';
    return { x: Math.round(c.x * TILE) + 8, y: Math.round(c.y * TILE) + (sitting ? 12 : 15), sitting };
  },
  // 앉은 손님은 붙어 있는 테이블 쪽을 본다
  seatFace(c) {
    const x = Math.round(c.x), y = Math.round(c.y);
    const isT = (tx, ty) => { const o = Game.objAt(tx, ty); return o && DATA.objects[o.id].table; };
    if (isT(x, y + 1)) return { face: 'down', dir: 1 };
    if (isT(x, y - 1)) return { face: 'up', dir: 1 };
    if (isT(x + 1, y)) return { face: 'side', dir: 1 };
    if (isT(x - 1, y)) return { face: 'side', dir: -1 };
    return { face: 'down', dir: 1 };
  },
  // 시트 프레임을 그리되, 옆모습 + 왼쪽이면 좌우 반전
  blitChar(img, x, y, flip) {
    const g = this.wg;
    if (flip) { g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
    else g.drawImage(img, x, y);
  },
  drawCustomer(P, c) {
    const f = this.custFoot(c);
    const moving = c.path && c.path.length;
    const sf = f.sitting ? this.seatFace(c) : { face: c.face || 'down', dir: c.dir || 1 };
    const state = c.state === 'eating' ? 'act' : f.sitting ? 'sit' : moving ? 'walk' : 'idle';
    const spr = Sprites.customer(c.type, state, c.frame || Math.floor(this.t * 2), sf.face);
    const x = f.x - spr.ax, y = f.y - spr.ay + 1;
    const flip = spr.sheet ? (sf.face === 'side' && sf.dir === -1) : (!f.sitting && sf.dir === -1);
    this.blitChar(spr.canvas, x, y, flip);
    if (c.state === 'eating' && !spr.sheet) this.wg.drawImage(Sprites.icon(c.order), f.x - 4, f.y - 10);
  },
  drawStaff(P) {
    const st = Game.rt.staff, t = this.t, hero = Game.s.hero || 'hero_m';
    const fx = Math.round(st.x * TILE) + 8, fy = Math.round(st.y * TILE) + 15;
    if (Sprites.hasChar(hero)) {
      const face = st.face || 'down';
      const col = st.cast > 0 ? 7 : st.path.length ? 2 + Math.floor(st.step / 1.2) % 4 : Math.floor(t * 2) % 2;
      this.blitChar(Sprites.charFrame(hero, face, col), fx - 16, fy - 31, face === 'side' && st.dir === -1);
      return;
    }
    // 주인공 시트가 오기 전까지 NAPLE 마법사가 대신 일한다
    const fr = st.cast > 0 ? 6 + Math.min(2, Math.floor((3 - st.cast) * 1.2)) : st.path.length ? 2 + Math.floor(st.step / 1.2) % 4 : Math.floor(t * 2) % 2;
    this.blitChar(Sprites.playerFrame(fr), fx - 14, fy - 31, st.dir === -1);
  },
  drawStaffCarry(P) {
    const st = Game.rt.staff; if (!st || !st.carry) return;
    const x = Math.round(st.x * TILE) + 4, y = Math.round(st.y * TILE) - 22;
    P.r(x - 1, y + 9, 11, 1, PAL.i3);
    this.wg.drawImage(Sprites.icon(st.carry), x, y);
  },

  bubble(P, x, y, w = 13, h = 13, fill = PAL.wh) {
    P.r(x + 1, y, w - 2, h, PAL.k); P.r(x, y + 1, w, h - 2, PAL.k);
    P.r(x + 1, y + 1, w - 2, h - 2, fill);
    P.r(x + 5, y + h, 3, 1, PAL.k); P.p(x + 6, y + h + 1, PAL.k); P.p(x + 6, y + h - 1, fill);
  },

  drawCustBubble(P, c) {
    if (c.state !== 'waiting' || !c.order) return;
    const f = this.custFoot(c), headH = Sprites.hasChar(c.type.id) ? 27 : c.type.small ? 19 : 23;
    const x = f.x - 7, y = f.y - headH - 16;
    const angry = c.wait > c.type.patience * 0.66;
    this.bubble(P, x, y, 13, 13, angry ? '#ffd6cc' : PAL.wh);
    this.wg.drawImage(Sprites.icon(c.order), x + 2, y + 2);
    // 인내심 바
    const pct = c.assigned ? 1 : Math.max(0, 1 - c.wait / c.type.patience);
    P.r(x, y - 3, 13, 2, PAL.k);
    P.r(x, y - 3, Math.max(1, Math.round(13 * pct)), 2, pct > 0.5 ? PAL.g3 : pct > 0.25 ? PAL.glow2 : PAL.red3);
    if (c.type.vip) { P.p(x + 11, y + 1, PAL.b3); P.p(x + 10, y + 2, PAL.b3); }
  },

  drawObjStatus(P, o, util) {
    const d = DATA.objects[o.id], spr = Sprites.object(o.id);
    const cx = o.x * TILE + (d.w * TILE) / 2, top = o.y * TILE - spr.tall;
    if (d.needs && d.needs.length && !Game.working(o)) {
      if (util || d.cook || o.id === 'sink' || o.id === 'boiler') {
        if (Math.floor(this.t * 2) % 2 === 0 || util) {
          const x = cx - 3, y = top - 9;
          P.r(x, y, 7, 8, PAL.k); P.r(x + 1, y + 1, 5, 6, PAL.red2); P.r(x + 3, y + 2, 1, 3, PAL.wh); P.p(x + 3, y + 6, PAL.wh);
        }
      }
    }
    if (o.cook && !o.cook.done) {
      const x = o.x * TILE + 2, y = top - 4, w = d.w * TILE - 4;
      P.r(x, y, w, 3, PAL.k); P.r(x + 1, y + 1, Math.round((w - 2) * Math.min(1, o.cook.t / o.cook.total)), 1, PAL.glow2);
    } else if (o.cook && o.cook.done) {
      const bob = Math.round(Math.sin(this.t * 5) * 1.5);
      const x = Math.round(cx) - 7, y = top - 16 + bob;
      this.bubble(P, x, y, 13, 13, '#fff3c8');
      this.wg.drawImage(Sprites.icon(o.cook.rid), x + 2, y + 2);
    }
  },

  // 바닥 온수난방관: 지그재그
  drawHeatPipes(P) {
    const s = Game.s, n = Game.rt.nets, run = Game.boilerRunning(), W = s.W;
    for (let i = 0; i < s.pipe.heat.length; i++) {
      if (!s.pipe.heat[i]) continue;
      const x = (i % W) * TILE, y = ((i / W) | 0) * TILE;
      const on = n.heat.has(i) && run;
      const c = on ? PAL.glow1 : '#7a5a3a', c2 = on ? PAL.glow2 : '#9a7a5a';
      const tx = i % W, ty = (i / W) | 0;
      const has = (dx, dy) => Game.isInterior(tx + dx, ty + dy) && s.pipe.heat[Game.idx(tx + dx, ty + dy)];
      // 3줄 지그재그 + 이웃 연결
      [2, 7, 12].forEach((yy, k) => P.r(x + 1, y + yy, 14, 1, c));
      P.r(x + 14, y + 2, 1, 6, c); P.r(x + 1, y + 7, 1, 6, c);
      if (has(-1, 0)) P.r(x, y + 2, 2, 1, c);
      if (has(1, 0)) P.r(x + 14, y + 12, 2, 1, c);
      if (has(0, -1)) P.r(x + 1, y, 1, 3, c);
      if (has(0, 1)) P.r(x + 14, y + 12, 1, 4, c);
      if (on) { const k = Math.floor(this.t * 10 + i) % 14; P.p(x + 1 + k, y + 7, c2); }
    }
  },

  // 급수/급탕관: 각자 차선(cold=5, hot=10)에 2px 배관, 이웃과 자동 연결
  drawLanePipes(P) {
    const s = Game.s, n = Game.rt.nets, run = Game.boilerRunning(), W = s.W;
    const lanes = { cold: 4, hot: 10 };
    for (const type of ['cold', 'hot']) {
      const L = lanes[type], arr = s.pipe[type], set = n[type];
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]) continue;
        const tx = i % W, ty = (i / W) | 0, x = tx * TILE, y = ty * TILE;
        const live = set.has(i) && (type === 'cold' || run);
        const body = type === 'cold' ? (live ? PAL.bl2 : '#3d5066') : (live ? PAL.red2 : '#5a3a36');
        const hi = type === 'cold' ? (live ? PAL.bl3 : '#56708a') : (live ? PAL.red3 : '#7a524c');
        const has = (dx, dy) => {
          const nx = tx + dx, ny = ty + dy;
          if (Game.isInterior(nx, ny) && arr[Game.idx(nx, ny)]) return true;
          if (type === 'cold') { const l = Game.inlet; if (nx === l.x && ny === l.y) return true; }
          return false;
        };
        const seg = (x0, y0, w, h) => { P.r(x0, y0, w, h, PAL.k); };
        // 외곽선 먼저
        seg(x + L - 1, y + L - 1, 4, 4);
        if (has(-1, 0)) seg(x, y + L - 1, L, 4);
        if (has(1, 0)) seg(x + L, y + L - 1, 16 - L, 4);
        if (has(0, -1)) seg(x + L - 1, y, 4, L);
        if (has(0, 1)) seg(x + L - 1, y + L, 4, 16 - L);
        P.r(x + L, y + L, 2, 2, body);
        if (has(-1, 0)) { P.r(x, y + L, L, 2, body); P.r(x, y + L, L, 1, hi); }
        if (has(1, 0)) { P.r(x + L, y + L, 16 - L, 2, body); P.r(x + L, y + L, 16 - L, 1, hi); }
        if (has(0, -1)) { P.r(x + L, y, 2, L, body); P.r(x + L, y, 1, L, hi); }
        if (has(0, 1)) { P.r(x + L, y + L, 2, 16 - L, body); P.r(x + L, y + L, 1, 16 - L, hi); }
        P.p(x + L, y + L, type === 'cold' ? PAL.b2 : PAL.b3); // 이음쇠
        if (live) { const k = Math.floor(this.t * 8 + i * 3) % 16; if (has(1, 0) || has(-1, 0)) P.p(x + k, y + L + 1, PAL.wh); }
      }
    }
  },

  drawLeaks(P, util) {
    const s = Game.s, W = s.W;
    for (const l of s.leaks) {
      const x = (l.i % W) * TILE, y = ((l.i / W) | 0) * TILE;
      const col = l.type === 'cold' ? PAL.bl3 : 'rgba(255,255,255,0.9)';
      if (Math.random() < 0.6) Game.puff(x + 8, y + 6, col, 1, 4);
      if (Math.floor(this.t * 3) % 2 === 0) { P.r(x + 1, y + 1, 14, 1, PAL.red3); P.r(x + 1, y + 14, 14, 1, PAL.red3); P.r(x + 1, y + 1, 1, 14, PAL.red3); P.r(x + 14, y + 1, 1, 14, PAL.red3); }
      if (l.type === 'cold') { P.ellipse(x + 8, y + 12, 5, 2, 'rgba(90,150,210,0.6)'); }
    }
  },

  drawLighting(g) {
    const s = Game.s, m = s.min;
    const dusk = Math.max(0, Math.min(1, (m - 16.5 * 60) / 210));
    let dark = dusk * 0.5;
    if (s.weather === 'rain' || s.weather === 'cloudy') dark += 0.06;
    if (Game.hasEvent('blizzard')) dark += 0.12;
    if (dark <= 0.01) return;
    const L = this.lg, w = this.light.width, h = this.light.height;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, w, h);
    L.fillStyle = `rgba(12,14,36,${dark})`; L.fillRect(0, 0, w, h);
    L.globalCompositeOperation = 'destination-out';
    const lights = [];
    for (const o of s.objects) {
      const d = DATA.objects[o.id];
      if (d.light) lights.push([o.x * TILE + 8, o.y * TILE + 8, d.light * TILE]);
      if (o.id === 'boiler' && Game.boilerRunning()) lights.push([o.x * TILE + 20, o.y * TILE + 14, 1.6 * TILE]);
      if (o.id === 'oven') lights.push([o.x * TILE + 8, o.y * TILE + 6, 1.0 * TILE]);
    }
    for (const x of this.lampXs()) lights.push([x * TILE + 8, (s.H + STREET_ROWS) * TILE - 54, 2.4 * TILE]);
    for (const [x, y, r] of lights) {
      for (let k = 4; k >= 1; k--) {
        L.fillStyle = `rgba(0,0,0,${0.28})`;
        L.beginPath(); L.arc(x, y, r * k / 4, 0, Math.PI * 2); L.fill();
      }
    }
    g.drawImage(this.light, 0, 0);
    // 따뜻한 빛
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of lights) { g.fillStyle = `rgba(255,150,50,${0.06 * dusk})`; g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  },

  drawWeather(g, dt) {
    const s = Game.s, ww = this.world.width, wh = this.world.height;
    const bl = Game.hasEvent('blizzard'), snow = s.weather === 'snow' || bl, rain = s.weather === 'rain' && !bl;
    const want = bl ? 260 : snow ? 70 : rain ? 90 : 0;
    while (this.flakes.length < want) this.flakes.push({ x: Math.random() * ww, y: Math.random() * wh, s: Math.random() });
    if (this.flakes.length > want) this.flakes.length = want;
    const wind = bl ? 60 : snow ? 6 : 10;
    for (const f of this.flakes) {
      if (rain) { f.y += (140 + f.s * 60) * dt; f.x += wind * dt; }
      else { f.y += (bl ? 50 : 14 + f.s * 10) * dt; f.x += (wind + Math.sin(this.t * 2 + f.s * 9) * 8) * dt; }
      if (f.y > wh) { f.y = -2; f.x = Math.random() * ww; }
      if (f.x > ww) f.x -= ww;
      const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE);
      const inside = Game.isInterior(tx, ty);
      g.globalAlpha = inside ? 0.18 : 0.85;
      if (rain) { g.fillStyle = '#9ab8d8'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 3); }
      else { g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x), Math.round(f.y), f.s > 0.7 ? 2 : 1, f.s > 0.7 ? 2 : 1); }
    }
    g.globalAlpha = 1;
    if (bl) { g.fillStyle = `rgba(220,230,255,${0.08 + Math.sin(this.t * 1.7) * 0.04})`; g.fillRect(0, 0, ww, wh); }
  },

  drawGhost(P, ui) {
    const h = ui.hover; if (!h || !ui.tool) return;
    const g = this.wg, t = ui.tool;
    if (!Game.inGrid(h.x, h.y)) return;
    if (t.kind === 'object') {
      const d = DATA.objects[t.id], spr = Sprites.object(t.id);
      const ok = Game.canPlace(t.id, h.x, h.y).ok;
      g.globalAlpha = 0.65;
      g.drawImage(spr.canvas, h.x * TILE + spr.xoff, (h.y + d.h) * TILE - spr.canvas.height);
      g.globalAlpha = 0.35;
      g.fillStyle = ok ? '#6aff8a' : '#ff5a4a';
      g.fillRect(h.x * TILE, h.y * TILE, d.w * TILE, d.h * TILE);
      g.globalAlpha = 1;
    } else {
      const c = t.kind === 'erase' || t.kind === 'remove' ? '#ff5a4a' : '#fff2a0';
      P.r(h.x * TILE, h.y * TILE, 16, 1, c); P.r(h.x * TILE, h.y * TILE + 15, 16, 1, c);
      P.r(h.x * TILE, h.y * TILE, 1, 16, c); P.r(h.x * TILE + 15, h.y * TILE, 1, 16, c);
    }
  },

  drawFx() {
    const g = this.fg, k = this.scale * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.fx.width, this.fx.height);
    const fs = Math.max(11, Math.round(5.5 * k));
    g.font = `${fs}px Galmuri11, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const f of Game.rt.floats) {
      const x = f.x * TILE * k, y = f.y * TILE * k;
      g.globalAlpha = Math.min(1, f.life);
      g.lineWidth = Math.max(3, fs / 4); g.strokeStyle = '#1a100a'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
    }
    g.globalAlpha = 1;
  },
};
