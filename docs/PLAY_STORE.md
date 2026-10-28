# 로그인 점검 결과 + Google Play 출시 가이드

## 1. 로그인·클라우드 저장 점검 (2026-10-28)

### 구조
- 로그인: Firebase Authentication (이메일/비밀번호)
- 저장: Cloud Firestore `saves/{uid}` 문서 하나에 세이브 JSON 문자열(`data`) + `savedAt` + `updatedAt`
- 코드: `js/firebase-init.js` (`Cloud`), 화면: `js/ui.js` (`showTitle`, `showLogin`, `resolveCloud`, `showDeleteAccount`)

### 안전성
| 항목 | 상태 |
|---|---|
| 웹 apiKey 노출 | 정상. Firebase 웹 apiKey 는 원래 공개되는 식별자이고, 보안은 **Firestore 규칙**이 지킨다 |
| Firestore 규칙 | `firestore.rules` 새로 작성. 본인 문서만 읽기·쓰기·삭제, 필드 3개만 허용, 세이브 500KB 미만, `updatedAt` 은 서버 시각만, 같은 문서 2초 안 재저장 차단, 나머지 경로 전부 차단. **Firebase 에뮬레이터로 14개 경우 모두 통과** |
| 비밀번호 | 게임은 비밀번호를 저장하지 않음 (Firebase 가 처리) |
| 화면 출력 | 이메일·세이브 내용은 모두 textContent 로 출력 (innerHTML 미사용) → 스크립트 주입(XSS) 경로 없음 |
| 다른 기기 덮어쓰기 | 올리기 전에 클라우드의 마지막 저장 시각을 확인, 다른 기기가 그사이 저장했으면 멈추고 선택 창 |
| 계정 삭제 | 앱 안에서 가능 (메뉴 › 계정 › 계정 삭제, 비밀번호 재확인 후 세이브 문서와 계정 삭제) — Play 정책 필수 항목 |
| 디버그 메뉴 | 주소에 `?debug` 가 있을 때만 보임 |

### ⚠ 직접 해야 하는 설정 (Firebase / Google Cloud 콘솔)
1. **Firestore 규칙 게시**: Firebase 콘솔 › Firestore Database › 규칙 → `firestore.rules` 내용을 붙여넣고 [게시]
   (지금 콘솔 규칙이 '테스트 모드'(누구나 읽기/쓰기, 30일 만료)라면 **반드시** 바꿔야 함)
2. **승인된 도메인**: Authentication › 설정 › 승인된 도메인에 `dkskhjs.github.io` 가 있는지 확인
3. **이메일 열거 보호**: Authentication › 설정 › 사용자 작업 › '이메일 열거 보호' 켜기
4. **API 키 제한** (선택, 권장): Google Cloud 콘솔 › API 및 서비스 › 사용자 인증 정보 › Browser key ›
   애플리케이션 제한 = HTTP 리퍼러 `https://dkskhjs.github.io/*`, `https://steam-and-beans.firebaseapp.com/*`
5. **App Check** (선택): 봇이 Firebase 를 직접 두드리는 것을 막음. 사용자가 많아지면 reCAPTCHA Enterprise 로 켜기
6. **예산 알림**: Blaze 요금제로 올리면 Google Cloud › 결제 › 예산 및 알림에서 월 예산 알림을 꼭 걸 것

### 트래픽이 몰리면 — 어디까지 버티나
- **Firestore**: 사용자마다 문서 하나만 쓰고, 실시간 연결(리스너)을 쓰지 않아 동시 접속 수 자체는 문제가 되지 않는다.
  문서 하나에 초당 1회 쓰기 제한도 게임은 10초에 한 번 묶어 보내므로 여유롭다.
- 이번에 줄인 것: 저장을 **10초에 한 번**으로 묶고, **내용이 바뀌지 않았으면 올리지 않음**
  (예전엔 영업 전·정산 중 20초 자동 저장이 같은 내용을 계속 올렸음). 앱을 닫거나 백그라운드로 갈 때 밀린 저장을 바로 보냄.
- 실측: 세이브 크기 7KB(초반) ~ 약 42KB(최대 확장), 영업 중 저장 약 1회/분.
- 한 번 올릴 때 = 읽기 1 + 쓰기 1. 활발히 꾸밀 때 최대 10초에 한 번 → 시간당 최대 약 360회, 보통은 그보다 훨씬 적음.
- **무료(Spark) 한도**: 하루 쓰기 2만·읽기 5만 → 대략 **하루 수백 명(1인 30분 플레이)** 까지 무료.
  그 이상은 Blaze(종량제)로 올리면 되고, 1,000명/일 규모여도 하루 몇십 원~몇백 원 수준 (정확한 단가는 콘솔 가격표 확인).
- **Firebase Auth (이메일)**: 사실상 무료이며 수만 명 규모까지 문제없음. 가입 시도는 IP 당 제한이 있어 봇 대량 가입을 어느 정도 막아 줌.
- **진짜 병목은 호스팅 대역폭**: GitHub Pages 는 월 100GB 소프트 한도.
  첫 접속에 게임 파일 약 3MB + 배경음악(곡당 약 2MB, 장면마다 하나씩)을 받으므로 대략 **월 1~2만 명의 첫 접속**까지.
  이번에 넣은 서비스 워커(`sw.js`)가 다시 열 때는 기기에 담아 둔 파일을 써서 재방문 트래픽은 거의 없음.
  사용자가 더 늘면 Firebase Hosting(무료 10GB/월, 이후 종량제) 또는 Cloudflare Pages(대역폭 무제한)로 옮기는 것을 권장.

## 2. Google Play 출시 준비

이 게임은 웹 게임이라, **TWA(Trusted Web Activity)** 로 감싸 안드로이드 앱으로 올린다.
앱은 크롬 엔진으로 배포된 사이트(https://dkskhjs.github.io/Mycoom/)를 주소창 없이 전체화면으로 연다.
게임을 고치면 사이트만 다시 배포하면 되고, 앱을 다시 올릴 필요가 없다(아이콘·이름 등을 바꿀 때만 새 버전).

### 이번에 준비한 것
| 파일 | 용도 |
|---|---|
| `manifest.webmanifest` | 앱 이름·아이콘(일반 + 마스커블)·전체화면·시작 주소 |
| `assets/icon-maskable-512.png` | 안드로이드가 동그랗게 잘라도 안전한 아이콘 |
| `sw.js` | 서비스 워커: 빠른 재실행·오프라인 실행 (TWA 품질 기준) |
| `privacy.html` | 개인정보처리방침 + 계정 삭제 안내(`#delete`) — **[이름]·[연락처 이메일] 을 채울 것** |
| `firestore.rules`, `firebase.json` | Firestore 보안 규칙 |
| `store/listing-ko.md` | 스토어 이름·간단한 설명·자세한 설명 |
| `store/data-safety.md` | 데이터 보안·콘텐츠 등급·타겟층·광고 답변 메모 |
| `store/feature-graphic-1024x500.png` | 그래픽 이미지(대표 이미지) |
| `store/screen-*.png` | 휴대전화 스크린샷 1080×1920 (5장) |
| `store/twa-manifest.json` | Bubblewrap(앱 빌드 도구) 설정 |
| `store/assetlinks.json` | 앱 ↔ 사이트 연결 파일 템플릿 |

### 출시 순서
1. **사이트 배포 확인**: GitHub 저장소 › Settings › Pages 에서 `main` 브랜치 배포. https://dkskhjs.github.io/Mycoom/ 가 열리는지 확인
2. **`privacy.html` 의 [이름], [연락처 이메일] 채우기** (스토어에 공개되는 연락처와 같은 것)
3. **Firestore 규칙 게시** (위 1번 섹션)
4. **Play Console 개발자 계정** 만들기 ($25, 본인 인증). 2023년 11월 이후 만든 **개인 계정은 프로덕션 출시 전에
   '비공개 테스트'에 테스터 12명 이상이 14일 연속 참여**해야 한다 (지인·커뮤니티로 테스터 모집 필요)
5. **앱 빌드 (AAB)** — 둘 중 하나
   - 쉬운 방법: https://www.pwabuilder.com 에 사이트 주소 입력 → Package For Stores › Android →
     Package ID `com.dkskhjs.steambeans`, 앱 이름 `스팀 & 빈즈`, Display `fullscreen` → 다운로드한 zip 안의
     `.aab`(업로드용), `signing.keystore`+암호(**절대 잃어버리지 말 것**), `assetlinks.json` 을 보관
   - 직접 빌드: `npm i -g @bubblewrap/cli` → `bubblewrap init --manifest https://dkskhjs.github.io/Mycoom/manifest.webmanifest`
     (값은 `store/twa-manifest.json` 참고) → `bubblewrap build`
6. **Play Console › 앱 만들기** → 앱 이름·기본 언어(한국어)·게임·무료
7. **앱 서명**: 'Play 앱 서명' 사용(기본). 내부 테스트 트랙에 `.aab` 업로드 → 설정 › 앱 서명에서
   **앱 서명 키 인증서 SHA-256 지문**을 복사
8. **assetlinks.json 게시** (이게 없으면 앱 위에 주소창이 보인다)
   - `store/assetlinks.json` 의 지문 자리에 7번 값을 넣는다 (업로드 키 지문도 같이 넣어 두면 테스트 빌드도 주소창 없이 열림)
   - 이 파일은 **도메인 최상위** `https://dkskhjs.github.io/.well-known/assetlinks.json` 에 있어야 한다.
     지금 사이트는 `/Mycoom/` 아래라서 이 저장소로는 안 되고, 둘 중 하나가 필요:
     - (가) GitHub 에 `dkskhjs.github.io` 라는 이름의 저장소를 하나 더 만들고 `.well-known/assetlinks.json` 과 빈 `.nojekyll` 파일을 올림
     - (나) 개인 도메인을 사서 이 저장소에 연결 (그러면 이 저장소에 `.well-known/assetlinks.json` 을 두면 됨, `twa-manifest.json` 의 host·주소도 새 도메인으로)
   - 확인: https://developers.google.com/digital-asset-links/tools/generator
9. **스토어 등록정보**: `store/listing-ko.md` 내용, 아이콘 `assets/icon-512.png`, 그래픽 이미지, 스크린샷 업로드
10. **앱 콘텐츠** (Play Console › 정책 › 앱 콘텐츠): `store/data-safety.md` 대로
    - 개인정보처리방침 URL: https://dkskhjs.github.io/Mycoom/privacy.html
    - 앱 액세스: 로그인 없이 모든 기능 사용 가능
    - 광고: 없음 / 콘텐츠 등급: IARC 설문 / 타겟층: 13세 이상 권장
    - 데이터 보안: 이메일(선택, 계정 관리), 게임 진행(선택, 앱 기능), 전송 중 암호화, 삭제 요청 가능
    - 계정 삭제 URL: https://dkskhjs.github.io/Mycoom/privacy.html#delete
11. **비공개 테스트**(12명 × 14일) → 프로덕션 출시 신청 → 심사(보통 수일)

### 출시 전 확인할 것
- 실제 안드로이드 폰(내부 테스트 설치)에서: 로그인·이어하기, 소리(첫 터치 후), 뒤로가기 버튼, 화면 회전, 오프라인 실행
- 저사양 기기에서 프레임 (줌아웃한 마을 화면이 가장 무거움)
- 앱 버전을 올릴 때는 `twa-manifest.json` 의 `appVersionCode` 를 1씩 올려서 다시 빌드
