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
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
} catch (e) {
  console.error("Firebase 초기화 에러:", e);
}

const auth = firebase.auth();
const db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((error) => console.error("세션 유지 실패:", error));

let currentUser = null;

// 3. 로그인 상태 감지 (안전한 UI 전환)
auth.onAuthStateChanged((user) => {
  const authBtn = document.getElementById("authBtn");
  const userEmail = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");

  closeAuthModal();

  if (user) {
    currentUser = user;
    console.log("🟢 로그인 세션 유지:", user.email);

    if (authBtn) authBtn.style.display = "none";
    if (userEmail) {
      userEmail.textContent = user.email;
      userEmail.style.display = "inline";
    }
    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    // 지연 로딩을 통해 게임 엔진 초기화 완료 후 안전하게 불러오기
    setTimeout(() => {
      loadFromCloud();
    }, 1000);

  } else {
    currentUser = null;
    console.log("⚪ 비로그인 상태");

    if (authBtn) authBtn.style.display = "inline-flex";
    if (userEmail) userEmail.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
});

// 4. 회원가입/로그인/로그아웃 처리
async function registerAccount(email, password) {
  try {
    const res = await auth.createUserWithEmailAndPassword(email, password);
    alert("회원가입 완료!");
    closeAuthModal();
    return res.user;
  } catch (err) {
    alert("회원가입 실패: " + err.message);
  }
}

async function loginAccount(email, password) {
  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    alert("로그인 완료!");
    closeAuthModal();
    return res.user;
  } catch (err) {
    alert("로그인 실패: " + err.message);
  }
}

function logoutAccount() {
  auth.signOut().then(() => alert("로그아웃 되었습니다."));
}

// 5. 세이브 데이터 동기화 (예외 안전 처리)
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
      
      // 게임 객체가 완전히 준비된 경우에만 안전하게 반영
      if (typeof Game !== "undefined" && typeof Game.applyCloudSave === "function") {
        Game.applyCloudSave(saveData);
      } else if (typeof applyCloudSave === "function") {
        applyCloudSave(saveData);
      }
      return saveData;
    }
  } catch (err) {
    console.error("클라우드 로드 실패:", err);
  }
}

// 6. 모달 열기/닫기
function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.style.display = "none";
  }
  const emailInput = document.getElementById("authEmail");
  const passInput = document.getElementById("authPassword");
  if (emailInput) emailInput.value = "";
  if (passInput) passInput.value = "";
}

function openAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.style.display = "block";
  }
}

// 7. 모달 버튼 이벤트 연결
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLoginSubmit")?.addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value;
    const pass = document.getElementById("authPassword").value;
    if (!email || !pass) return alert("이메일과 비밀번호를 입력해 주세요.");
    await loginAccount(email, pass);
  });

  document.getElementById("btnRegisterSubmit")?.addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value;
    const pass = document.getElementById("authPassword").value;
    if (!email || !pass) return alert("이메일과 비밀번호를 입력해 주세요.");
    await registerAccount(email, pass);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      logoutAccount();
    }
  });
});
