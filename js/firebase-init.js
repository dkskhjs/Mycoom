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

// 2. Firebase 초기화 — SDK 를 못 불러오면(오프라인·차단) 로그인만 끄고 게임은 그대로
const FB_OK = typeof firebase !== 'undefined';
let auth = null, db = null;
if (FB_OK) {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
} else {
  const area = document.getElementById('userAuthArea');
  if (area) area.style.display = 'none';
}
// 브라우저 alert 대신 게임 토스트 (임베드 화면에서도 보이게)
function notify(msg, kind) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg, kind); else alert(msg); }

let currentUser = null;

// 3. 로그인 상태 감지 (화면 렌더링에 영향을 주지 않는 안전한 로직)
if (FB_OK) auth.onAuthStateChanged((user) => {
  const authBtn = document.getElementById("authBtn");
  const userEmail = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");

  closeAuthModal();

  if (user) {
    currentUser = user;
    console.log("🟢 로그인 됨:", user.email);

    if (authBtn) authBtn.style.display = "none";
    if (userEmail) {
      userEmail.textContent = user.email;
      userEmail.style.display = "inline";
    }
    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    loadFromCloud();
  } else {
    currentUser = null;
    console.log("⚪ 비로그인 상태");

    if (authBtn) authBtn.style.display = "inline-flex";
    if (userEmail) userEmail.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }

  // 🟢 핵심 추가: 캔버스 크기 재계산 호출 (렌더링 잘림/검은 화면 방지)
  setTimeout(() => {
    if (typeof Render !== "undefined" && typeof Render.resize === "function") {
      const wrap = document.getElementById("canvasWrap");
      if (wrap) Render.resize(wrap);
    }
  }, 100);
});

// 4. 모달 열기/닫기 및 로그인/회원가입 함수
function openAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.hidden = false;
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.hidden = true;
  
  const emailInput = document.getElementById("authEmail");
  const passInput = document.getElementById("authPassword");
  if (emailInput) emailInput.value = "";
  if (passInput) passInput.value = "";
}

async function handleLogin() {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;
  if (!email || !pass) return notify("이메일과 비밀번호를 입력해주세요.", "bad");

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    notify("로그인되었습니다!", "good");
    closeAuthModal();
  } catch (err) {
    notify("로그인 실패: " + err.message, "bad");
  }
}

async function handleRegister() {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;
  if (!email || !pass) return notify("이메일과 비밀번호를 입력해주세요.", "bad");

  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    notify("회원가입이 완료되었습니다!", "good");
    closeAuthModal();
  } catch (err) {
    notify("회원가입 실패: " + err.message, "bad");
  }
}

function logoutAccount() {
  if (!auth) return;
  auth.signOut().then(() => notify("로그아웃 되었습니다."));
}

// 5. 클라우드 세이브 로드 및 저장
// Firestore 는 배열 안 배열·undefined·Infinity 를 못 담으므로 JSON 문자열로 저장한다.
// 저장은 3초 동안 몰아서 한 번만 보낸다 (칠하기·배치할 때마다 쓰지 않게).
let cloudTimer = null, cloudPending = null;
function saveToCloud(saveDataObj) {
  if (!currentUser || !db) return;
  cloudPending = JSON.stringify(saveDataObj);
  if (cloudTimer) return;
  cloudTimer = setTimeout(async () => {
    cloudTimer = null;
    const data = cloudPending; cloudPending = null;
    try {
      await db.collection("saves").doc(currentUser.uid).set({
        data, savedAt: JSON.parse(data).savedAt || Date.now(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("☁️ 클라우드 세이브 완료!");
    } catch (err) {
      console.error("클라우드 저장 실패:", err);
    }
  }, 3000);
}

async function loadFromCloud() {
  if (!currentUser || !db) return null;
  try {
    const doc = await db.collection("saves").doc(currentUser.uid).get();
    if (!doc.exists) {
      // 클라우드에 아직 없으면 지금 로컬 진행을 올려 둔다
      if (typeof Game !== "undefined" && Game.s) saveToCloud(Game.s);
      return null;
    }
    const saveData = doc.data().data;
    if (typeof Game !== "undefined" && typeof Game.applyCloudSave === "function") Game.applyCloudSave(saveData);
    return saveData;
  } catch (err) {
    console.error("클라우드 데이터 로드 실패:", err);
  }
}
