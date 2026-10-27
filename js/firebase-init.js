
// 1. Firebase 콘솔에서 발급받은 본인의 설정 값으로 교체하세요
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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// 3. 로그인 상태 감지 (페이지가 열릴 때 로그인 상태를 지속 확인)
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    console.log("🟢 클라우드 로그인 완료:", user.email);
    // 로그인에 성공하면 저장되어 있던 클라우드 세이브 데이터를 로드
    loadFromCloud();
  } else {
    currentUser = null;
    console.log("⚪ 로그인되지 않은 상태 (로컬 저장소 동작)");
  }
});

// 4. 회원가입 함수
async function registerAccount(email, password) {
  try {
    const res = await auth.createUserWithEmailAndPassword(email, password);
    alert("회원가입이 완료되었습니다!");
    return res.user;
  } catch (err) {
    alert("회원가입 실패: " + err.message);
  }
}

// 5. 로그인 함수
async function loginAccount(email, password) {
  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    alert("로그인되었습니다!");
    return res.user;
  } catch (err) {
    alert("로그인 실패: " + err.message);
  }
}

// 6. 로그아웃 함수
function logoutAccount() {
  auth.signOut().then(() => alert("로그아웃 되었습니다."));
}

// 7. 클라우드에 세이브 데이터 저장 함수
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

// 8. 클라우드에서 세이브 데이터 불러오기 함수
async function loadFromCloud() {
  if (!currentUser) return null;

  try {
    const doc = await db.collection("saves").doc(currentUser.uid).get();
    if (doc.exists) {
      const saveData = doc.data().data;
      console.log("☁️ 클라우드 데이터 로드 성공:", saveData);
      
      // 기존 게임 데이터 적용 함수가 있다면 여기에 연결합니다
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
