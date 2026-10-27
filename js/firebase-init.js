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

// 2. Firebase 앱 초기화 (반드시 가장 먼저 실행되어야 함)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 3. 세션 무한 유지 설정 (초기화 직후에 배치)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((error) => {
    console.error("세션 유지 설정 실패:", error);
  });

let currentUser = null;

// 4. 로그인 상태 감지 (페이지 진입 시 자동으로 로그인 유지 및 세이브 로드)
auth.onAuthStateChanged(async (user) => {
  const modal = document.getElementById("modal");
  const authBtn = document.getElementById("authBtn");
  const userEmail = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");

  // 접속 시 모달 창 숨김 유지
  if (modal) modal.hidden = true;

  if (user) {
    currentUser = user;
    console.log("🟢 기존 로그인 세션 유지됨:", user.email);

    // 로그인 상태 UI 전환
    if (authBtn) authBtn.style.display = "none";
    if (userEmail) {
      userEmail.textContent = user.email;
      userEmail.style.display = "inline";
    }
    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    // 🟢 클라우드 데이터 자동 로드
    await loadFromCloud();

  } else {
    currentUser = null;
    console.log("⚪ 로그인되지 않은 상태 (로컬 스토리지 데이터 사용)");

    // 비로그인 상태 UI 전환
    if (authBtn) authBtn.style.display = "inline-flex";
    if (userEmail) userEmail.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
});

// 5. 회원가입 함수
async function registerAccount(email, password) {
  try {
    const res = await auth.createUserWithEmailAndPassword(email, password);
    alert("회원가입이 완료되었습니다!");
