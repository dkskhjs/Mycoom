// 1. Firebase 콘솔 설정 값 (본인 프로젝트 설정 유지)
const firebaseConfig = {
  apiKey: "AIzaSyBLhpQ15lUNgBGtEq3zvhxpCVdkopwEWao",
  authDomain: "steam-and-beans.firebaseapp.com",
  projectId: "steam-and-beans",
  storageBucket: "steam-and-beans.firebasestorage.app",
  messagingSenderId: "565801098189",
  appId: "1:565801098189:web:13087cdd3b8a2091078284",
  measurementId: "G-HQEG7QHHK8"
};

// 2. Firebase 앱 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 3. 세션 유지 설정 (LOCAL: 브라우저를 닫아도 로그인 유지)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((error) => {
    console.error("세션 유지 설정 실패:", error);
  });

let currentUser = null;

// 4. 로그인 상태 감지 및 UI / 세이브 로드 동기화
auth.onAuthStateChanged((user) => {
  const modal = document.getElementById("modal");
  const authBtn = document.getElementById("authBtn");
  const userEmail = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");

  // 페이지 진입 시 모달 창 숨김 유지 (투명 오버레이 방지)
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }

  if (user) {
    currentUser = user;
    console.log("🟢 기존 로그인 세션 유지됨:", user.email);

    // 로그인된 상태 상단 UI 전환
    if (authBtn) authBtn.style.display = "none";
    if (userEmail) {
      userEmail.textContent = user.email;
      userEmail.style.display = "inline";
    }
    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    // 백그라운드에서 클라우드 데이터 불러오기
    loadFromCloud();

  } else {
    currentUser = null;
    console.log("⚪ 로그인되지 않은 상태 (로컬 스토리지 데이터 사용)");

    // 비로그인 상태 상단 UI 전환
    if (authBtn) authBtn.style.display = "inline-flex";
    if (userEmail) userEmail.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
});

// 5. 회원가입 처리 함수
async function registerAccount(email, password) {
  try {
    const res = await auth.createUserWithEmailAndPassword(email, password);
    alert("회원가입이 완료되었습니다!");
    closeAuthModal();
    return res.user;
  } catch (err) {
    alert("회원가입 실패: " + err.message);
  }
}

// 6. 로그인 처리 함수
async function loginAccount(email, password) {
  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    alert("로그인되었습니다!");
    closeAuthModal();
    return res.user;
  } catch (err) {
    alert("로그인 실패: " + err.message);
  }
}

// 7. 로그아웃 함수
function logoutAccount() {
  auth.signOut().then(() => alert("로그아웃 되었습니다."));
}

// 8. 클라우드 세이브 파일 저장 함수
async function saveToCloud(saveDataObj) {
  if (!currentUser) {
    console.warn("로그인 상태가 아니므로 로컬 저장소에만 저장됩니다.");
    return;
  }

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

// 9. 클라우드 세이브 파일 불러오기 함수
async function loadFromCloud() {
  if (!currentUser) return null;

  try {
    const doc = await db.collection("saves").doc(currentUser.uid).get();
    if (doc.exists) {
      const saveData = doc.data().data;
      console.log("☁️ 클라우드 데이터 로드 성공:", saveData);
      
      // Game 객체의 applyCloudSave에 세이브 데이터 적용
      if (typeof Game !== "undefined" && typeof Game.applyCloudSave === "function") {
        Game.applyCloudSave(saveData);
      } else if (typeof applyCloudSave === "function") {
        applyCloudSave(saveData);
      }
      
      return saveData;
    } else {
      console.log("새로운 계정입니다. 저장된 클라우드 데이터가 없습니다.");
    }
  } catch (err) {
    console.error("클라우드 데이터 불러오기 실패:", err);
  }
}

// 10. 모달 닫기 및 입력값 초기화 전역 함수 (HTML onclick="closeAuthModal()" 연결용)
function closeAuthModal() {
  const modal = document.getElementById("modal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  
  const emailInput = document.getElementById("authEmail");
  const passInput = document.getElementById("authPassword");
  if (emailInput) emailInput.value = "";
  if (passInput) passInput.value = "";
}

// 11. 로그인 버튼 클릭 시 모달 열기 함수 (전역)
function openAuthModal() {
  const modal = document.getElementById("modal");
  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}
