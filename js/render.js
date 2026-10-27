// 렌더러: world(저해상도 도트) + fx(고해상도 텍스트) 2장 캔버스
const Render = {
  world: null, wg: null, fx: null, fg: null, light: null, lg: null,
  scale: 3, t: 0, flakes: [], outsideBlur: true,

  // world = 화면 밖 장면 캔버스(마을 전체, 1px = 도트 1칸), view = 화면에 보이는 캔버스
  view: null, vg: null, cam: null, cw: 0, ch: 0, dpr: 1,

  init(viewCanvas, fxCanvas) {
    this.view = viewCanvas; this.vg = viewCanvas.getContext('2d');
    this.fx = fxCanvas; this.fg = fxCanvas.getContext('2d');
    [this.world, this.wg] = makeCanvas(1, 1);
    [this.light, this.lg] = makeCanvas(1, 1);
  },

  resize(container) {
    const s = Game.s; if (!s) return;
    this.container = container;
    const SW = Town.sceneW(), SH = Town.sceneH();
    const grew = this.world.width !== SW || this.world.height !== SH;
    if (grew) { this.world.width = SW; this.world.height = SH; this.light.width = SW; this.light.height = SH; this.flakes = []; }
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr; this.cw = container.clientWidth; this.ch = container.clientHeight;
    for (const c of [this.view, this.fx]) {
      c.style.width = this.cw + 'px'; c.style.height = this.ch + 'px';
      c.width = Math.round(this.cw * dpr); c.height = Math.round(this.ch * dpr);
    }
    if (!this.cam || grew) this.fitShop(); else this.clampCam();
  },

  // ───────── 카메라 ─────────
  snapZoom(z) { return z >= 2 ? Math.floor(z) : Math.max(0.25, Math.floor(z * 4) / 4); },
  fitRect(x, y, w, h, snap = true) {
    const z = Math.min(this.cw / w, this.ch / h);
    this.cam = { x: x + w / 2, y: y + h / 2, z: snap ? this.snapZoom(z) : z };
    this.clampCam();
  },
  // 가게 + 앞 거리
  fitShop() { const s = Game.s; this.fitRect(Town.ox() - 8, Town.oy() - 20, s.W * TILE + 16, (s.H + STREET_ROWS) * TILE + 24); this.camMode = 'shop'; },
  // 마을 전체
  fitTown() { this.fitRect(0, 0, Town.sceneW(), Town.sceneH(), false); this.cam.z = Math.max(0.25, Math.floor(this.cam.z * 8) / 8); this.camMode = 'town'; },
  minZoom() { return Math.max(0.25, Math.min(this.cw / Town.sceneW(), this.ch / Town.sceneH()) * 0.9); },
  zoomAt(factor, sx = this.cw / 2, sy = this.ch / 2) {
    const c = this.cam, before = this.screenToScene(sx, sy);
    c.z = Math.max(this.minZoom(), Math.min(8, c.z * factor));
    if (c.z > 1.5) c.z = Math.round(c.z * 2) / 2;
    const after = this.screenToScene(sx, sy);
    c.x += before.x - after.x; c.y += before.y - after.y;
    this.camMode = null; this.clampCam();
  },
  pan(dx, dy) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.camMode = null; this.clampCam(); },
  clampCam() {
    const c = this.cam, SW = Town.sceneW(), SH = Town.sceneH(), hw = this.cw / 2 / c.z, hh = this.ch / 2 / c.z;
    c.x = SW <= hw * 2 ? SW / 2 : Math.max(hw, Math.min(SW - hw, c.x));
    c.y = SH <= hh * 2 ? SH / 2 : Math.max(hh, Math.min(SH - hh, c.y));
  },
  viewLeft() { return this.cam.x - this.cw / 2 / this.cam.z; },
  viewTop() { return this.cam.y - this.ch / 2 / this.cam.z; },
  screenToScene(sx, sy) { return { x: this.viewLeft() + sx / this.cam.z, y: this.viewTop() + sy / this.cam.z }; },
  // 게임 좌표(px, 가게 원점) → 화면 CSS px
  toScreen(px, py) { return { x: (px + Town.ox() - this.viewLeft()) * this.cam.z, y: (py + Town.oy() - this.viewTop()) * this.cam.z }; },

  // 화면 좌표 → 타일
  tileAt(clientX, clientY) {
    const r = this.fx.getBoundingClientRect();
    const sc = this.screenToScene(clientX - r.left, clientY - r.top);
    const px = sc.x - Town.ox(), py = sc.y - Town.oy();
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE), px, py };
  },

  draw(ui, dt) {
    const s = Game.s, g = this.wg; if (!s || !this.cam) return;
    this.t += dt;
    g.imageSmoothingEnabled = false;
    const P = pen(g), OX = Town.ox(), OY = Town.oy();
    g.setTransform(1, 0, 0, 1, OX, OY);
    Town.draw(g, P, this.t, dt);
    // 쌓인 눈은 바닥 위, 가게·사람보다 아래 (가게 실내는 덮지 않음)
    this.snowPending = true;
    const { W, H } = s;
    const util = ui.mode === 'utility';
    const ceilView = ui.mode === 'interior' && ui.sub === 'ceil';

    // 1. 타일
    for (let y = 0; y < H + STREET_ROWS; y++) for (let x = 0; x < W; x++) {
      const v = Sprites.variant(x, y);
      if (y >= H) { g.drawImage(Sprites.street(v), x * TILE, y * TILE); continue; }
      const i = Game.idx(x, y);
      if (Game.isWall(x, y)) g.drawImage(Sprites.wall(s.wall[i], v), x * TILE, y * TILE);
      else g.drawImage(Sprites.floor(s.floor[i], v), x * TILE, y * TILE);
    }
    // 연석
    P.r(0, H * TILE, W * TILE, 1, PAL.s3);
    Town.drawSnow(g); Town.drawFront(g);
    this.drawWallCut(g);
    g.drawImage(this.toneOverlay(), 0, 0);   // 넓은 범위 색 얼룩
    this.drawStains(P);
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
      items.push({ z: o.y + Game.dims(o.id, o.rot).h, kind: 'obj', o });
    }
    for (const c of Game.rt.customers) items.push({ z: c.y + 1.02, kind: 'cust', c });
    if (Game.rt.staff) items.push({ z: Game.rt.staff.y + 1.03, kind: 'staff' });
    for (const k of Game.rt.cats) items.push({ z: k.y + 1.01, kind: 'cat', k });
    for (const d of this.streetDecor()) items.push({ z: d.z, kind: 'img', d });
    items.sort((a, b) => a.z - b.z);
    g.globalAlpha = util ? 0.55 : 1;
    for (const it of items) {
      if (it.kind === 'obj') { const lifted = ui.tool && ui.tool.kind === 'move' && ui.tool.uid === it.o.uid; if (lifted) g.globalAlpha = 0.3; this.drawObject(P, it.o); if (lifted) g.globalAlpha = util ? 0.55 : 1; }
      else if (it.kind === 'cust') this.drawCustomer(P, it.c);
      else if (it.kind === 'staff') this.drawStaff(P);
      else if (it.kind === 'cat') this.drawCat(P, it.k);
      else {
        const d = it.d, dx = Math.round(d.x - d.img.width / 2), dy = d.y - d.img.height;
        g.drawImage(d.img, dx, dy);
        if (d.snowCap) {   // 나무 꼭대기에 눈
          const cx = dx + d.img.width / 2, w = d.img.width * 0.42;
          P.ellipse(Math.round(cx), dy + 5, Math.round(w), 3, '#eef3f8'); P.ellipse(Math.round(cx - w * 0.3), dy + 9, Math.round(w * 0.5), 2, '#f6f9fb');
        }
      }
    }
    g.globalAlpha = 1;

    // 4. 배관 (설비 보기)
    if (util) this.drawLanePipes(P);
    this.drawLeaks(P, util);

    // 5. 천장 보기
    if (ceilView) {
      g.globalAlpha = 0.93;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g.drawImage(Sprites.ceil(s.ceil[Game.idx(x, y)], Sprites.variant(x, y)), x * TILE, y * TILE);
      g.drawImage(this.toneOverlay(), 0, 0);
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

    // 튜토리얼: 놓을 곳·이을 곳 깜빡임
    if (typeof Tutorial !== 'undefined' && Game.s.tut && !Game.s.tut.off) {
      const a = 0.35 + Math.sin(this.t * 5) * 0.25;
      for (const [x, y] of Tutorial.targets()) {
        g.fillStyle = `rgba(255,214,90,${(a * 0.45).toFixed(2)})`; g.fillRect(x * TILE, y * TILE, TILE, TILE);
        g.strokeStyle = `rgba(255,236,150,${a.toFixed(2)})`; g.lineWidth = 1; g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    // 7. 파티클
    for (const p of Game.rt.particles) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 1.2));
      g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;

    // 8. 하늘의 비행선, 조명/날씨
    if (!ceilView) { Town.drawSky(P, g, this.t); this.drawLighting(g); Town.drawWindows(P, this.dusk || 0); }
    if (!util && !ceilView) this.drawWarmth(g, P);
    this.drawWeather(g, dt);

    // 9. 커서 미리보기
    this.drawGhost(P, ui);

    // 10. 카메라로 화면에 옮기기
    g.setTransform(1, 0, 0, 1, 0, 0);
    const v = this.vg, z = this.cam.z * this.dpr;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, this.view.width, this.view.height);   // 장면 밖은 CSS 배경(마을 전경 그림)이 보인다
    const dx = Math.round(-this.viewLeft() * z), dy = Math.round(-this.viewTop() * z), dw = Math.round(this.world.width * z), dh = Math.round(this.world.height * z);
    // 건물 밖은 살짝 흐리고 어둡게, 건물 안(외곽선 포함)은 선명하게 한 번 더 그린다
    // 아웃포커싱: 가게를 가까이 볼수록 바깥이 흐리고, 마을 전체 쪽으로 멀어지면 서서히 선명해진다
    const zTown = Math.min(this.cw / Town.sceneW(), this.ch / Town.sceneH());
    const zShop = Math.min(this.cw / ((Game.s.W + 1) * TILE), this.ch / ((Game.s.H + STREET_ROWS + 2) * TILE));
    const f = Math.max(0, Math.min(1, (this.cam.z - zTown * 1.15) / Math.max(0.01, zShop * 0.9 - zTown * 1.15)));
    const ease = f * f * (3 - 2 * f);
    this.focus = ease;   // 1 = 가게 가까이, 0 = 마을 전체 (효과음·환경음 믹스에 씀)
    if (this.outsideBlur && 'filter' in v && ease > 0.02) {
      v.filter = `blur(${(ease * Math.max(1.5, z * 1.1)).toFixed(2)}px) brightness(${(1 - ease * 0.22).toFixed(3)}) saturate(${(1 - ease * 0.25).toFixed(3)})`;
      v.drawImage(this.world, dx, dy, dw, dh);
      v.filter = 'none';
      const bx = dx + Math.round((Town.ox() - 2) * z), by = dy + Math.round((Town.oy() - 2) * z);
      const bw = Math.round((Game.s.W * TILE + 4) * z), bh = Math.round((Game.s.H * TILE + 4) * z);
      v.save(); v.beginPath(); v.rect(bx, by, bw, bh); v.clip();
      v.drawImage(this.world, dx, dy, dw, dh);
      v.restore();
    } else v.drawImage(this.world, dx, dy, dw, dh);

    // 10. fx: 텍스트
    this.drawFx();
  },

  // 온기: 작동 중인 보일러·조리기구·라디에이터 주변 글로우 + 아지랑이, 난방 바닥 은은한 색
  drawWarmth(g, P) {
    const s = Game.s, run = Game.boilerRunning(), t = this.t;
    if (!run) return;
    const W = s.W;
    // 밤일수록 온기가 더 잘 보인다
    const boost = 1 + (this.dusk || 0) * 0.8;
    g.fillStyle = `rgba(255,150,60,${0.06 * boost})`;
    for (const i of Game.rt.nets.heatCover) g.fillRect((i % W) * TILE, ((i / W) | 0) * TILE, TILE, TILE);
    const src = [];
    for (const o of s.objects) {
      const d = DATA.objects[o.id];
      if (o.id === 'boiler') src.push({ x: o.x * TILE + 16, y: o.y * TILE + 14, r: 40, a: 0.34, haze: 4, top: o.y * TILE - 14 });
      else if (d.cook && Game.working(o)) { const hot = o.cook && !o.cook.done; src.push({ x: o.x * TILE + 8, y: o.y * TILE + 6, r: hot ? 26 : 16, a: hot ? 0.3 : 0.12, haze: hot ? 3 : 1, top: o.y * TILE - 8 }); }
      else if (o.id === 'radiator' && Game.working(o)) src.push({ x: o.x * TILE + 8, y: o.y * TILE + 8, r: 26, a: 0.16, haze: 2, top: o.y * TILE - 2 });
    }
    g.save(); g.beginPath(); g.rect(TILE, TILE, (W - 2) * TILE, (s.H - 2) * TILE); g.clip();   // 온기는 실내에만
    g.globalCompositeOperation = 'lighter';
    for (const w of src) {
      const pulse = 1 + Math.sin(t * 2.2 + w.x * 0.1) * 0.15;
      for (let k = 3; k >= 1; k--) {
        g.fillStyle = `rgba(255,${110 + k * 25},50,${(w.a / 3) * pulse * boost})`;
        g.beginPath(); g.arc(w.x, w.y, w.r * k / 3, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    // 아지랑이: 위로 흔들리며 올라가는 옅은 줄
    for (const w of src) for (let j = 0; j < w.haze; j++) {
      for (let k = 0; k < 7; k++) {
        const ph = (t * 0.9 + j * 0.37 + k / 7) % 1, yy = Math.round(w.top - ph * 14), xx = Math.round(w.x - 6 + j * 6 + Math.sin(t * 4 + k + j * 2) * 1.5);
        g.fillStyle = `rgba(255,225,190,${0.38 * (1 - ph)})`; g.fillRect(xx, yy, 1, 2);
      }
    }
  },

  // 건물 단면: 벽 바깥쪽 4px 를 진하게(잘린 벽 두께), 바깥 외곽선 2px, 안쪽 경계선 1px
  drawWallCut(g) {
    const s = Game.s, W = s.W * TILE, H = s.H * TILE, T = 4, d = Game.door;
    g.fillStyle = 'rgba(22,11,5,0.78)';
    g.fillRect(0, 0, W, T);                         // 북
    g.fillRect(0, 0, T, H);                         // 서
    g.fillRect(W - T, 0, T, H);                     // 동
    g.fillRect(0, H - TILE, d.x * TILE, T);         // 남 (문 왼쪽)
    g.fillRect((d.x + 1) * TILE, H - TILE, W - (d.x + 1) * TILE, T);
    g.fillStyle = 'rgba(80,52,34,0.55)';            // 단면 윗면 하이라이트 한 줄
    g.fillRect(T, T, W - T * 2, 1);
    // 바깥 외곽선
    g.fillStyle = '#0c0604';
    g.fillRect(-2, -2, W + 4, 2); g.fillRect(-2, -2, 2, H + 2); g.fillRect(W, -2, 2, H + 2);
    g.fillRect(-2, H - TILE, d.x * TILE + 2, 1); g.fillRect((d.x + 1) * TILE, H - TILE, W - (d.x + 1) * TILE + 2, 1);
    g.fillRect(-2, H, d.x * TILE + 2, 2); g.fillRect((d.x + 1) * TILE, H, W - (d.x + 1) * TILE + 2, 2);
    // 안쪽 경계(벽과 바닥이 만나는 선)
    g.fillStyle = 'rgba(12,6,4,0.7)';
    g.fillRect(TILE - 1, TILE - 1, W - TILE * 2 + 2, 1);
    g.fillRect(TILE - 1, TILE - 1, 1, H - TILE * 2 + 2);
    g.fillRect(W - TILE, TILE - 1, 1, H - TILE * 2 + 2);
    g.fillRect(TILE - 1, H - TILE, d.x * TILE - TILE + 1, 1); g.fillRect((d.x + 1) * TILE, H - TILE, W - (d.x + 2) * TILE + 1, 1);
  },

  // 커피 얼룩: 진한 테두리 링 + 옅은 속 + 튄 방울
  // 커피 얼룩: 진한 테두리 링 + 옅은 속 + 튄 방울 (어두운 바닥에서도 보이게 진하게)
  drawStains(P) {
    for (const st of Game.s.stains) {
      const cx = st.x * TILE + st.ox, cy = st.y * TILE + st.oy, r = st.r + 1;
      P.ellipse(cx, cy, r + 1, r, 'rgba(34,14,4,0.85)');
      P.ellipse(cx, cy, r, Math.max(1, r - 1), 'rgba(110,58,24,0.9)');
      P.ellipse(cx, cy, Math.max(1, r - 1), Math.max(1, r - 2), 'rgba(150,92,48,0.85)');
      P.p(cx - 1, cy - 1, 'rgba(210,160,110,0.8)');
      P.p(cx + r + 2, cy + (st.seed % 3) - 1, 'rgba(34,14,4,0.85)');
      if (st.seed % 2) { P.p(cx - r - 2, cy + 1, 'rgba(34,14,4,0.8)'); P.p(cx - r - 1, cy + 2, 'rgba(110,58,24,0.8)'); }
    }
  },

  // 가게 칸 위에 몇 칸에 걸쳐 은은하게 밝고 어두운 얼룩 (위치로만 정해지므로 크기가 바뀔 때만 다시 만든다)
  toneOverlay() {
    const s = Game.s, key = s.W + 'x' + s.H;
    if (this._tone && this._toneKey === key) return this._tone;
    const [c, g] = makeCanvas(s.W * TILE, s.H * TILE);
    const cell = 40;   // 얼룩 하나 크기(px) ≈ 2.5칸
    const n = (x, y) => {   // 부드러운 값 잡음 0~1
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sm = t => t * t * (3 - 2 * t), a = hash(x0, y0, 17), b = hash(x0 + 1, y0, 17), cc = hash(x0, y0 + 1, 17), d = hash(x0 + 1, y0 + 1, 17);
      return (a + (b - a) * sm(fx)) * (1 - sm(fy)) + (cc + (d - cc) * sm(fx)) * sm(fy);
    };
    for (let y = 0; y < s.H * TILE; y += 2) for (let x = 0; x < s.W * TILE; x += 2) {
      const t = (n(x, y) - 0.5) * 0.9 + (hash(x >> 3, y >> 3, 23) - 0.5) * 0.12;
      g.fillStyle = t > 0 ? `rgba(255,236,205,${(t * 0.22).toFixed(3)})` : `rgba(18,10,6,${(-t * 0.28).toFixed(3)})`;
      g.fillRect(x, y, 2, 2);
    }
    this._tone = c; this._toneKey = key;
    return c;
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
  // 가로등: 가게 양쪽 끝 + 마을 거리를 따라 5칸마다
  // 거리 연석 소품: 가게 양 끝은 가로등, 바깥으로 3칸마다 가로등 → 가로수1 → 가로수2 반복
  curbSlots() {
    const W = Game.s.W, out = [{ x: 0, kind: 'lamp' }, { x: W - 1, kind: 'lamp' }];
    const seq = ['tree1', 'tree2', 'lamp'];
    let i = 0; for (let x = -3; x >= -TOWN.mx; x -= 3) out.push({ x, kind: seq[i++ % 3] });
    i = 0; for (let x = W + 2; x < W + TOWN.mx; x += 3) out.push({ x, kind: seq[i++ % 3] });
    return out;
  },
  lampXs() { return this.curbSlots().filter(c => c.kind === 'lamp').map(c => c.x); },
  // 가게 앞 보도 소품 (NAPLE props): 바닥 기준점 x(중앙), y(발끝)
  streetDecor() {
    const s = Game.s, d = Game.door, y = (s.H + 1) * TILE - 1, out = [];
    if (!Sprites.sheets.props) return out;
    const at = (key, tx, dx = 8) => out.push({ img: Sprites.prop(key), x: tx * TILE + dx, y, z: s.H + 1 });
    // 가로등은 차도 끝 연석에 (보도에 두면 실내를 너무 가린다)
    const snowy = s.weather === 'snow' || Game.hasEvent('blizzard');
    const art = { lamp: 'v_lamp', tree1: 'v_tree_s1', tree2: 'v_tree_e' };
    for (const c of this.curbSlots())
      out.push({ img: Sprites.prop(art[c.kind]), x: c.x * TILE + 8, y: (s.H + STREET_ROWS) * TILE - 1, z: s.H + STREET_ROWS, snowCap: snowy && c.kind !== 'lamp' });
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
    if (o.rot && d.w !== d.h) {   // 세로로 돌린 직사각형: 돌린 그림을 바닥 정렬
      const c = Sprites.objectRot(o.id), dm = Game.dims(o.id, o.rot), g = this.wg;
      const rx = o.x * TILE + Math.round((dm.w * TILE - c.width) / 2), ry = (o.y + dm.h) * TILE - c.height;
      if (o.flip) { g.save(); g.translate(rx * 2 + c.width, 0); g.scale(-1, 1); g.drawImage(c, rx, ry); g.restore(); } else g.drawImage(c, rx, ry);
      return;
    }
    const dx = o.x * TILE + spr.xoff, dy = (o.y + d.h) * TILE - spr.canvas.height;
    if (o.flip) { const g = this.wg; g.save(); g.translate(o.x * TILE * 2 + d.w * TILE, 0); g.scale(-1, 1); g.drawImage(spr.canvas, dx, dy); g.restore(); }
    else this.wg.drawImage(spr.canvas, dx, dy);
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
    } else if (o.id === 'tubeman') {
      // 증기로 부푼 몸통: 마디마다 위상이 밀린 사인파로 흔들린다. 증기가 안 오면 축 늘어짐
      const on = Game.working(o), segs = 9, baseX = x + 8, baseY = y - 0;
      let px = baseX, py = baseY;
      for (let k = 0; k < segs; k++) {
        const up = on ? 3 : 1.2, sway = on ? Math.sin(t * 6 - k * 0.7) * (1 + k * 0.45) : (k * 1.4);
        const nx = baseX + Math.round(sway), ny = Math.round(baseY - (k + 1) * up - (on ? 0 : -k * 0.3));
        P.r(Math.min(px, nx) - 2, Math.min(py, ny), Math.abs(nx - px) + 4, Math.abs(ny - py) + 1, PAL.k);
        P.r(Math.min(px, nx) - 1, Math.min(py, ny), Math.abs(nx - px) + 2, Math.abs(ny - py) + 1, k % 3 === 2 ? PAL.b3 : PAL.red2);
        if (on && k === 4) { const ax = Math.round(Math.sin(t * 9) * 5); P.line(nx - 1, ny, nx - 5, ny - 2 + ax, PAL.red2); P.line(nx + 1, ny, nx + 5, ny - 2 - ax, PAL.red2); }
        px = nx; py = ny;
      }
      P.disc(px, py - 2, 2, PAL.k); P.disc(px, py - 2, 1, PAL.cr2); P.p(px - 1, py - 2, PAL.k); P.p(px + 1, py - 2, PAL.k);
      if (on && Math.random() < 0.05) Game.puff(px, py - 4, 'rgba(240,240,240,0.7)');
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
  drawCat(P, k) {
    const pose = k.path.length ? 'walk' : k.state === 'nap' ? 'nap' : 'sit';
    const img = Sprites.cat(k.ref.kind, pose, Math.floor(k.step / 1.2));
    const x = Math.round(k.x * TILE) + 8 - 8, y = Math.round(k.y * TILE) + 16 - 12;
    this.blitChar(img, x, y, k.dir === -1);
    if (pose === 'nap') {   // Zz
      const ph = (this.t * 0.8 + k.x) % 2;
      if (ph < 1.4) { const zx = x + 13, zy = y - 2 - Math.floor(ph * 4); P.r(zx, zy, 3, 1, PAL.cr2); P.p(zx + 1, zy + 1, PAL.cr2); P.r(zx, zy + 2, 3, 1, PAL.cr2); }
    }
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
    const angry = c.wait > Game.patience(c) * 0.66;
    this.bubble(P, x, y, 13, 13, angry ? '#ffd6cc' : PAL.wh);
    this.wg.drawImage(Sprites.icon(c.order), x + 2, y + 2);
    // 인내심 바
    const pct = c.assigned ? 1 : Math.max(0, 1 - c.wait / Game.patience(c));
    P.r(x, y - 3, 13, 2, PAL.k);
    P.r(x, y - 3, Math.max(1, Math.round(13 * pct)), 2, pct > 0.5 ? PAL.g3 : pct > 0.25 ? PAL.glow2 : PAL.red3);
    if (c.type.vip) { P.p(x + 11, y + 1, PAL.b3); P.p(x + 10, y + 2, PAL.b3); }
  },

  drawObjStatus(P, o, util) {
    const d = DATA.objects[o.id], spr = Sprites.object(o.id);
    const dmo = Game.dims(o.id, o.rot), cx = o.x * TILE + (dmo.w * TILE) / 2, top = o.y * TILE - spr.tall;
    if (d.needs && d.needs.length && !Game.working(o)) {
      if (util || d.cook || o.id === 'sink' || o.id === 'boiler') {
        if (Math.floor(this.t * 2) % 2 === 0 || util) {
          const x = cx - 3, y = top - 9;
          P.r(x, y, 7, 8, PAL.k); P.r(x + 1, y + 1, 5, 6, PAL.red2); P.r(x + 3, y + 2, 1, 3, PAL.wh); P.p(x + 3, y + 6, PAL.wh);
        }
      }
    }
    if (o.cook && !o.cook.done) {
      const x = o.x * TILE + 2, y = top - 4, w = dmo.w * TILE - 4;
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
    const dusk = Math.max(0, Math.min(1, (m - 16.5 * 60) / 150));
    this.dusk = dusk;
    let dark = dusk * 0.62;
    if (s.weather === 'rain' || s.weather === 'cloudy') dark += 0.06;
    if (Game.hasEvent('blizzard')) dark += 0.12;
    if (dark <= 0.01) return;
    const L = this.lg, w = this.light.width, h = this.light.height, OX = Town.ox(), OY = Town.oy();
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, w, h);
    L.fillStyle = `rgba(12,14,36,${dark})`; L.fillRect(0, 0, w, h);
    L.setTransform(1, 0, 0, 1, OX, OY);
    L.globalCompositeOperation = 'destination-out';
    const lights = [];
    for (const o of s.objects) {
      const d = DATA.objects[o.id];
      if (d.light) lights.push([o.x * TILE + 8, o.y * TILE + 8, d.light * TILE]);
      if (o.id === 'boiler' && Game.boilerRunning()) lights.push([o.x * TILE + 20, o.y * TILE + 14, 1.6 * TILE]);
      if (o.id === 'oven') lights.push([o.x * TILE + 8, o.y * TILE + 6, 1.0 * TILE]);
    }
    for (const [wx, wy, ww, wh] of Town.windows) lights.push([wx + ww / 2, wy + wh / 2, 14]);
    for (const x of this.lampXs()) lights.push([x * TILE + 8, (s.H + STREET_ROWS) * TILE - 54, 2.4 * TILE]);
    for (const [x, y, r] of lights) {
      for (let k = 4; k >= 1; k--) {
        L.fillStyle = `rgba(0,0,0,${0.28})`;
        L.beginPath(); L.arc(x, y, r * k / 4, 0, Math.PI * 2); L.fill();
      }
    }
    g.drawImage(this.light, -OX, -OY);
    // 따뜻한 빛
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of lights) { g.fillStyle = `rgba(255,150,50,${0.06 * dusk})`; g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  },

  drawWeather(g, dt) {
    const s = Game.s, ww = this.world.width, wh = this.world.height, OX = Town.ox(), OY = Town.oy();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bl = Game.hasEvent('blizzard'), snow = s.weather === 'snow' || bl, rain = s.weather === 'rain' && !bl;
    // 돌풍: 바람 세기가 천천히 오르내린다
    const gust = Math.max(0, Math.sin(this.t * 0.45) + Math.sin(this.t * 1.3) * 0.5);
    const wind = bl ? 70 + gust * 60 : snow ? 14 + gust * 34 : 10;
    const want = Math.round((bl ? 420 : snow ? 170 : rain ? 110 : 0) * ww / 600);
    while (this.flakes.length < want) this.flakes.push({ x: Math.random() * ww, y: Math.random() * wh, s: Math.random() });
    if (this.flakes.length > want) this.flakes.length = want;
    for (const f of this.flakes) {
      if (rain) { f.y += (140 + f.s * 60) * dt; f.x += wind * dt; }
      else {
        // 큰 눈송이(가까운 것)는 빠르고 크게
        const near = f.s > 0.8;
        f.y += (bl ? 46 : 12 + f.s * 12) * (near ? 1.5 : 1) * dt;
        f.x += (wind * (0.6 + f.s * 0.8) + Math.sin(this.t * 2 + f.s * 9) * 8) * dt;
      }
      if (f.y > wh) { f.y = -2; f.x = Math.random() * ww; }
      if (f.x > ww) f.x -= ww;
      const tx = Math.floor((f.x - OX) / TILE), ty = Math.floor((f.y - OY) / TILE);
      g.globalAlpha = Game.isInterior(tx, ty) ? 0.1 : 0.9;
      if (rain) { g.fillStyle = '#9ab8d8'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 3); }
      else {
        const sz = f.s > 0.92 ? 3 : f.s > 0.7 ? 2 : 1;
        g.fillStyle = f.s > 0.5 ? '#ffffff' : '#dfe8f2';
        g.fillRect(Math.round(f.x), Math.round(f.y), sz, sz);
        // 바람이 세면 꼬리가 생긴다
        if (wind > 40 && sz > 1) { g.globalAlpha *= 0.4; g.fillRect(Math.round(f.x) - 3, Math.round(f.y), 3, 1); }
      }
    }
    g.globalAlpha = 1;
    if (snow) {
      // 바람결: 길게 쓸려가는 흰 줄
      const n = bl ? 14 : Math.round(gust * 6);
      for (let i = 0; i < n; i++) {
        const y = (hash(i, 3, 5) * wh + this.t * 6 * (i % 3)) % wh, len = 24 + hash(i, 9, 2) * 50;
        const x = ((hash(i, 7, 1) * ww + this.t * (120 + i * 13) * (bl ? 1.6 : 1)) % (ww + len)) - len;
        g.fillStyle = `rgba(240,246,255,${bl ? 0.28 : 0.16})`; g.fillRect(Math.round(x), Math.round(y), Math.round(len), 1);
      }
      // 땅을 스치는 눈가루 (쌓인 눈이 있을 때)
      if ((s.snow || 0) > 0.15 && wind > 25) {
        const rows = [s.H, s.H + 1, s.H + 2], m = Math.round((bl ? 40 : 18) * (s.snow || 0) * (wind / 60));
        for (let i = 0; i < m; i++) {
          const ty = rows[i % 3], y = OY + ty * TILE + 2 + hash(i, ty, 4) * 12 + Math.sin(this.t * 3 + i) * 2;
          const x = ((hash(i, 11, 6) * ww + this.t * wind * 1.8) % ww);
          g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(Math.round(x), Math.round(y), 2 + (i % 3), 1);
        }
      }
    }
    if (bl) { g.fillStyle = `rgba(220,230,255,${0.1 + gust * 0.05})`; g.fillRect(0, 0, ww, wh); }
    else if (snow) { g.fillStyle = `rgba(220,230,255,${0.03 + gust * 0.02})`; g.fillRect(0, 0, ww, wh); }
    g.setTransform(1, 0, 0, 1, OX, OY);
  },

  drawGhost(P, ui) {
    const t = ui.tool; if (!t) return;
    const g = this.wg, h = ui.hover;
    if (t.kind === 'object' || t.kind === 'move') {
      // 미확정 자리가 있으면 거기, 없으면 마우스 위치에 미리보기
      const pend = t.px != null, pos = pend ? { x: t.px, y: t.py } : h;
      if (!pos || !Game.inGrid(pos.x, pos.y)) return;
      const d = DATA.objects[t.id], spr = Sprites.object(t.id);
      const ok = Game.canPlace(t.id, pos.x, pos.y, t.uid || 0, t.rot || 0).ok;
      if (d.light) {   // 조명이 닿는 범위 미리보기
        g.fillStyle = 'rgba(255,214,120,0.16)'; g.beginPath(); g.arc(pos.x * TILE + 8, pos.y * TILE + 8, d.light * TILE, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,214,120,0.6)'; g.lineWidth = 1; g.stroke();
      }
      const rot = t.rot || 0, dm = Game.dims(t.id, rot);
      g.globalAlpha = pend ? 0.85 : 0.6;
      if (rot && d.w !== d.h) { const c = Sprites.objectRot(t.id); g.drawImage(c, pos.x * TILE + Math.round((dm.w * TILE - c.width) / 2), (pos.y + dm.h) * TILE - c.height); }
      else g.drawImage(spr.canvas, pos.x * TILE + spr.xoff, (pos.y + d.h) * TILE - spr.canvas.height);
      g.globalAlpha = 0.3;
      g.fillStyle = ok ? '#6aff8a' : '#ff5a4a';
      g.fillRect(pos.x * TILE, pos.y * TILE, dm.w * TILE, dm.h * TILE);
      g.globalAlpha = 1;
      if (pend) {   // 깜빡이는 테두리 = 아직 확정 안 됨
        const c = ok ? (Math.floor(this.t * 3) % 2 ? '#c8ffb0' : '#6aff8a') : '#ff5a4a', x = pos.x * TILE, y = pos.y * TILE, w = dm.w * TILE, hh = dm.h * TILE;
        P.r(x, y, w, 1, c); P.r(x, y + hh - 1, w, 1, c); P.r(x, y, 1, hh, c); P.r(x + w - 1, y, 1, hh, c);
      }
      return;
    }
    if (t.cells && t.cells.size) {
      const W = Game.s.W, blink = 0.55 + 0.25 * Math.sin(this.t * 6);
      for (const i of t.cells) {
        const x = (i % W) * TILE, y = ((i / W) | 0) * TILE;
        if (t.kind === 'pipe') {
          const col = DATA.pipes[t.type].color, L = t.type === 'cold' ? 4 : t.type === 'hot' ? 10 : 7;
          const has = (dx, dy) => t.cells.has(i + dx + dy * W) && (dx === 0 || ((i % W) + dx >= 0 && (i % W) + dx < W));
          g.globalAlpha = blink; g.fillStyle = col;
          g.fillRect(x + L - 1, y + L - 1, 4, 4);
          if (has(-1, 0)) g.fillRect(x, y + L - 1, L, 4);
          if (has(1, 0)) g.fillRect(x + L, y + L - 1, 16 - L, 4);
          if (has(0, -1)) g.fillRect(x + L - 1, y, 4, L);
          if (has(0, 1)) g.fillRect(x + L - 1, y + L, 4, 16 - L);
          g.globalAlpha = 0.18; g.fillRect(x, y, 16, 16);
        } else {
          g.globalAlpha = blink; g.fillStyle = '#ff5a4a';
          for (let k = 2; k < 14; k++) { g.fillRect(x + k, y + k, 1, 1); g.fillRect(x + 15 - k, y + k, 1, 1); }
          g.globalAlpha = 0.2; g.fillRect(x, y, 16, 16);
        }
      }
      g.globalAlpha = 1;
    }
    if (!h || !Game.inGrid(h.x, h.y)) return;
    const c = t.kind === 'erase' || t.kind === 'remove' ? '#ff5a4a' : '#fff2a0';
    P.r(h.x * TILE, h.y * TILE, 16, 1, c); P.r(h.x * TILE, h.y * TILE + 15, 16, 1, c);
    P.r(h.x * TILE, h.y * TILE, 1, 16, c); P.r(h.x * TILE + 15, h.y * TILE, 1, 16, c);
  },

  drawFx() {
    const g = this.fg, k = this.cam.z * this.dpr, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.fx.width, this.fx.height);
    const fs = Math.max(11 * d, Math.min(16 * d, Math.round(5.5 * k)));
    g.font = `${fs}px Galmuri11, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const f of Game.rt.floats) {
      const sp = this.toScreen(f.x * TILE, f.y * TILE), x = sp.x * d, y = sp.y * d;
      g.globalAlpha = Math.min(1, f.life);
      g.lineWidth = Math.max(3, fs / 4); g.strokeStyle = '#1a100a'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
    }
    g.globalAlpha = 1;
  },
};
