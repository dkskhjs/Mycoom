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

// 2. Firebase 초기화
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

let currentUser = null;

// 3. 로그인 상태 감지 (UI 교체만 담당)
auth.onAuthStateChanged((user) => {
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
});

// 4. 모달 열기/닫기 및 회원가입/로그인 처리
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
  if (!email || !pass) return alert("이메일과 비밀번호를 입력해주세요.");

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    alert("로그인되었습니다!");
    closeAuthModal();
  } catch (err) {
    alert("로그인 실패: " + err.message);
  }
}

async function handleRegister() {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;
  if (!email || !pass) return alert("이메일과 비밀번호를 입력해주세요.");

  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    alert("회원가입이 완료되었습니다!");
    closeAuthModal();
  } catch (err) {
    alert("회원가입 실패: " + err.message);
  }
}

function logoutAccount() {
  if (confirm("로그아웃 하시겠습니까?")) {
    auth.signOut().then(() => alert("로그아웃 되었습니다."));
  }
}

// 5. 클라우드 세이브 저장 / 로드
async function saveToCloud(saveDataObj) {
  if (!currentUser) return;
  try {
    await db.collection("saves").doc(currentUser.uid).set({
      data: saveDataObj,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("☁️ 클라우드 세이브 완료!");
  } catch (err) {
    console.error("클라우드 저장 실패:", err);
  }
}

async function loadFromCloud() {
  if (!currentUser) return null;
  try {
    const doc = await db.collection("saves").doc(currentUser.uid).get();
    if (doc.exists) {
      const saveData = doc.data().data;
      if (typeof Game !== "undefined" && typeof Game.applyCloudSave === "function") {
        Game.applyCloudSave(saveData);
      } else if (typeof applyCloudSave === "function") {
        applyCloudSave(saveData);
      }
      return saveData;
    }
  } catch (err) {
    console.error("클라우드 데이터 로드 실패:", err);
  }
}
