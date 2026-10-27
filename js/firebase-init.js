// 1. Firebase 콘솔 설정 값
const firebaseConfig = {
  apiKey: "AIzaSyBLhpQ15lUNgBGtEq3zvhxpCVdkopwEWao",
  authDomain: "steam-and-beans.firebaseapp.com",
  projectId: "steam-and-beans",
  storageBucket: "steam-and-beans.firebasestorage.app",
  messagingSenderId: "565801098189",
  appId: "1:565801098189:web:13087cdd3b8a2091078284",
  measurementId: "G-HQEG7QHHK8"
};

// 2. Firebase 초기화 — SDK 를 못 불러오면(오프라인·차단) 계정 기능만 끄고 게임은 그대로
const FB_OK = typeof firebase !== 'undefined';
let auth = null, db = null, currentUser = null;
if (FB_OK) {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
}

// 3. 클라우드 세이브
// 핵심 규칙: 로그인한 뒤 "클라우드 진행 / 이 기기 진행" 중 무엇을 쓸지 정하기 전에는 절대 올리지 않는다.
// (새 브라우저에서 새 게임을 먼저 시작했다가 로그인하면 빈 진행이 예전 세이브를 덮어쓰던 문제 방지)
const Cloud = {
  ok: FB_OK,
  ready: false,          // true 가 되어야 save() 가 클라우드로 올라감
  syncedAt: null,        // 이 기기가 마지막으로 클라우드와 맞춘 세이브 시각 (다른 기기가 그 뒤에 저장했는지 판단)
  conflict: false,
  state: 'off',          // off(비로그인) · loading · done · error
  save: null,            // { json, savedAt, summary } 또는 null(클라우드에 없음)
  listeners: [],
  user() { return currentUser; },
  on(f) { this.listeners.push(f); },
  emit() { for (const f of this.listeners) try { f(); } catch (e) { console.error(e); } },

  // 세이브 요약 (일차·돈·레벨·저장 시각)
  summarize(json, savedAt) {
    try {
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      const plot = typeof DATA !== 'undefined' && DATA.plots ? DATA.plots.find(p => p.id === d.plotId) : null;
      return { day: d.day, money: Math.floor(d.money), level: d.level, plot: plot ? plot.name : '', savedAt: d.savedAt || savedAt || 0 };
    } catch (e) { return null; }
  },
  async fetch() {
    if (!currentUser || !db) return null;
    this.state = 'loading'; this.emit();
    try {
      const doc = await db.collection('saves').doc(currentUser.uid).get();
      if (doc.exists && doc.data().data) {
        const json = doc.data().data, sum = this.summarize(json, doc.data().savedAt);
        this.save = sum ? { json, savedAt: sum.savedAt, summary: sum } : null;
      } else this.save = null;
      this.state = 'done';
    } catch (err) {
      console.error('클라우드 세이브 읽기 실패:', err);
      this.save = null; this.state = 'error';
    }
    this.emit();
    return this.save;
  },
  // 이 기기 진행을 클라우드 기준으로 쓰기로 정함 → 지금 바로 올리고 이후 자동 저장
  useLocal() { this.syncedAt = this.save ? this.save.savedAt : null; this.ready = true; if (typeof Game !== 'undefined' && Game.s) { Game.save(); this.flush(); } },
  // 클라우드 진행을 이 기기에 내려받음 (로컬 저장을 덮고 다시 시작)
  useCloud() {
    if (!this.save) return false;
    try { localStorage.setItem('steamcafe_save_v1', this.save.json); } catch (e) { return false; }
    this.markSync(this.save.savedAt);
    this.ready = true;
    return true;
  },
  // 이 기기 세이브가 이 계정 클라우드와 마지막으로 맞춰진 시각을 기억해 둔다
  markSync(savedAt) { this.syncedAt = savedAt; try { localStorage.setItem('steamcafe_sync', JSON.stringify({ uid: currentUser && currentUser.uid, savedAt })); } catch (e) {} },
  // 이 기기 진행이 클라우드 진행을 이어서 한 것인지 (같은 계정에서 마지막 동기화 이후 이 기기에서만 진행)
  localContinuesCloud() {
    if (!this.save || !currentUser) return false;
    try {
      const sync = JSON.parse(localStorage.getItem('steamcafe_sync') || 'null'), l = JSON.parse(localStorage.getItem('steamcafe_save_v1'));
      return !!sync && !!l && sync.uid === currentUser.uid && sync.savedAt === this.save.savedAt && (l.savedAt || 0) >= this.save.savedAt;
    } catch (e) { return false; }
  },
  // 같은 세이브인지 (저장 시각이 같거나, 이 기기가 클라우드를 이어서 진행한 것)
  sameAsLocal() {
    if (this.localContinuesCloud()) return true;
    if (!this.save) return false;
    try { const l = JSON.parse(localStorage.getItem('steamcafe_save_v1')); return !!l && (l.savedAt || 0) === this.save.savedAt; } catch (e) { return false; }
  },

  async login(email, pass) {
    try { await auth.signInWithEmailAndPassword(email, pass); return { ok: true }; }
    catch (err) { return { ok: false, msg: this.errMsg(err) }; }
  },
  async register(email, pass) {
    try { await auth.createUserWithEmailAndPassword(email, pass); return { ok: true }; }
    catch (err) { return { ok: false, msg: this.errMsg(err) }; }
  },
  async resetPassword(email) {
    try { await auth.sendPasswordResetEmail(email); return { ok: true }; }
    catch (err) { return { ok: false, msg: this.errMsg(err) }; }
  },
  async logout() {
    if (!auth) return;
    await this.flushNow();
    await auth.signOut();
  },
  errMsg(err) {
    const m = {
      'auth/invalid-email': '이메일 형식이 올바르지 않아요',
      'auth/user-not-found': '가입된 계정이 없어요 — 회원가입을 눌러 주세요',
      'auth/wrong-password': '비밀번호가 틀렸어요',
      'auth/invalid-credential': '이메일 또는 비밀번호가 틀렸어요',
      'auth/invalid-login-credentials': '이메일 또는 비밀번호가 틀렸어요',
      'auth/email-already-in-use': '이미 가입된 이메일이에요 — 로그인을 눌러 주세요',
      'auth/weak-password': '비밀번호는 6자 이상으로 해 주세요',
      'auth/missing-password': '비밀번호를 입력해 주세요',
      'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤 다시 해 주세요',
      'auth/network-request-failed': '네트워크에 연결할 수 없어요',
    };
    return m[err && err.code] || ('오류: ' + (err && err.message || err));
  },

  // 저장 묶어 보내기 (3초에 한 번)
  _timer: null, _pending: null,
  queue(state) {
    if (!currentUser || !db || !this.ready) return;
    this._pending = JSON.stringify(state);
    if (this._timer) return;
    this._timer = setTimeout(() => this.flushNow(), 3000);
  },
  flush() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } return this.flushNow(); },
  async flushNow() {
    this._timer = null;
    const data = this._pending; this._pending = null;
    if (!data || !currentUser || !db || !this.ready) return;
    try {
      const ref = db.collection('saves').doc(currentUser.uid);
      // 다른 기기가 그사이 더 저장했으면 덮어쓰지 않고 멈춘 뒤 어느 쪽을 쓸지 묻는다
      const cur = await ref.get();
      if (cur.exists && (cur.data().savedAt || 0) !== (this.syncedAt ?? null)) {
        const json = cur.data().data, sum = this.summarize(json, cur.data().savedAt);
        this.save = sum ? { json, savedAt: sum.savedAt, summary: sum } : null;
        this.ready = false; this.conflict = true; this.emit();
        return;
      }
      const savedAt = JSON.parse(data).savedAt || Date.now();
      await ref.set({ data, savedAt, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      this.save = { json: data, savedAt, summary: this.summarize(data, savedAt) };
      this.markSync(savedAt);
    } catch (err) { console.error('클라우드 저장 실패:', err); }
  },
};

// game.js 의 save() 가 부른다
function saveToCloud(state) { Cloud.queue(state); }

// 4. 로그인 상태가 바뀌면: 클라우드 세이브를 읽고 화면(UI)에 알린다. 어느 쪽을 쓸지는 UI 가 사용자에게 묻는다.
if (FB_OK) auth.onAuthStateChanged(async user => {
  currentUser = user;
  Cloud.ready = false; Cloud.save = null; Cloud.conflict = false;
  try { const sync = JSON.parse(localStorage.getItem('steamcafe_sync') || 'null'); Cloud.syncedAt = sync && user && sync.uid === user.uid ? sync.savedAt : null; } catch (e) { Cloud.syncedAt = null; }
  Cloud.state = user ? 'loading' : 'off';
  Cloud.emit();
  if (user) await Cloud.fetch();
});
window.addEventListener('beforeunload', () => { if (Cloud._pending) Cloud.flushNow(); });
