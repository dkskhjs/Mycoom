# 웹 포털 출시 가이드 (Poki · CrazyGames · GameDistribution · Newgrounds)

도메인 없이, 게임 포털이 게임을 호스팅하고 광고를 붙여 수익을 나눠 주는 방식.
포털에 올라가는 건 `tools/build_portal.py` 로 만든 **포털 빌드**이고, GitHub Pages 의 일반 버전은 그대로 둔다.

## 포털 빌드 만들기
```sh
python3 tools/build_portal.py            # dist/steambeans-<포털>.zip 네 개
GD_GAME_ID=<게임 ID> python3 tools/build_portal.py gamedistribution   # GD 는 대시보드의 Game ID 를 넣어 다시 빌드
```
포털 빌드에서 바뀌는 것
- 로그인·클라우드 저장(Firebase), 서비스 워커, 홈 화면 앱 설정, 개인정보처리방침 링크, 전체화면 버튼을 뺀다
  (포털은 외부 서버 요청·외부 링크를 막고, 전체화면·저장은 포털이 맡는다. 진행은 기기 브라우저에 저장)
- 포털 SDK 를 넣고 `js/portal.js` 가 신호를 보낸다
  - 로딩 끝: 그림·글꼴을 다 받으면
  - 플레이 시작/멈춤: 게임 화면이면 시작, 메뉴·정산·타이틀 같은 창이 뜨면 멈춤
  - **전면 광고**: 정산 화면에서 [☀ 다음 날로]를 누를 때 (포털이 횟수를 알아서 조절)
  - **보상형 광고**: 정산 화면 [📺 광고 보고 보너스 받기] — 하루 한 번, 🪙(150 + 일차×30, 최대 1,500)
  - 광고 중에는 음악·효과음을 끄고 게임을 멈춤
- 크기: 전체 약 14.6MB (배경음악 11.7MB 는 장면마다 필요할 때 받음), 첫 로딩 약 3MB, 파일 54개

## CrazyGames (먼저 추천 — 누구나 올릴 수 있음)
1. https://developer.crazygames.com 에서 가입 (구글 계정 가능)
2. **Upload game** → HTML5 → `dist/steambeans-crazygames.zip` 업로드 (zip 맨 위에 index.html)
3. 정보 입력
   - 제목: Steam & Beans (스팀 & 빈즈) · 카테고리: Simulation / Management · 태그: tycoon, cafe, pixel, steampunk, management, casual
   - 조작: 마우스 / 터치 (모바일 지원)
   - 설명·조작·태그: `store/listing-en.md` (영어, 그대로 복사) · 한국어는 `store/listing-ko.md`
   - 커버 이미지: `store/portal/cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png`
4. 사이트 안의 미리보기(QA 도구)에서 광고 흐름 확인: 정산 → 보너스 광고 → 다음 날로
5. 심사 → **Basic Launch**(일부 사용자에게 노출) → 플레이 시간·재방문 지표가 좋으면 **Full Launch**(SDK 광고 수익 분배).
   SDK 는 이미 넣어 두어서 Full Launch 때 따로 할 일이 없다.
6. 정산 정보(계좌·세금 정보)는 개발자 포털에서 입력

## Poki (선별 심사)
1. https://developers.poki.com 의 제출 양식으로 게임 링크를 보낸다
   - 링크는 지금 GitHub Pages 주소(https://dkskhjs.github.io/Mycoom/)를 써도 됨 (심사용으로 플레이만 되면 됨)
2. 승인되면 Poki for Developers 대시보드에 `dist/steambeans-poki.zip` 업로드
3. Poki Inspector(https://inspector.poki.io)로 광고 신호 확인 → 플레이어 테스트 → 출시
- Poki 는 16:9 화면(640×360, 836×470, 1031×580)에 맞춘다 — 게임은 이 크기에서 모바일형 배치로 바뀌며 확인함
- Poki 는 외부 요청을 기본으로 막는다 — 포털 빌드는 SDK 외 외부 요청이 없음(확인함)

## GameDistribution (올리면 여러 웹게임 사이트에 배포, 광고 수익 분배)
1. https://developer.gamedistribution.com 가입 → **Upload new game** → 제목·설명(`store/listing-en.md`)·이미지(`store/portal/en/`) 입력
2. 대시보드에 나오는 **Game ID** 로 빌드: `GD_GAME_ID=<ID> python3 tools/build_portal.py gamedistribution` → `dist/steambeans-gamedistribution.zip` 업로드
   (ID 없이 만든 zip 에는 자리표시가 들어 있어 광고가 나오지 않는다)
3. 게임 설정에서 **Rewarded Ads** 를 켠다 (안 켜면 보너스 광고가 안 나옴)
4. 대시보드의 미리보기에서 첫 광고(pre-roll)를 한 번 끝까지 보면 연동이 확인된다 → 심사(최대 2주)
- 광고 위치: 게임 시작 버튼 뒤 1회(pre-roll, GD 필수) · 정산 [☀ 다음 날로] · 정산 [📺 보너스] (보상형)
- 광고 중에는 소리·게임을 멈춘다 (SDK_GAME_PAUSE / SDK_GAME_START)

## Newgrounds (심사 없이 바로 공개)
1. https://www.newgrounds.com/projects/games → 새 프로젝트 → `dist/steambeans-newgrounds.zip` 업로드 (zip 맨 위에 index.html)
2. 화면 크기 960×540 정도, **Touchscreen friendly** 체크, 아이콘·썸네일은 `store/portal/en/` 에서
3. 설명·태그: `store/listing-en.md`
- 광고 SDK 없음 (Newgrounds 가 사이트에 광고를 붙이고 수익 일부를 나눔). 진행은 브라우저에 저장

## 영어 커버 이미지 (`store/portal/en/`)
1920×1080, 1280×720, 1280×550, 800×1200, 800×800, 512×512, 512×384, 512×340, 400×300 — 포털이 요구하는 크기를 골라 쓴다

## 출시 전에 하면 좋은 것
- **영어 지원**: 완료 — 브라우저 언어가 한국어가 아니면 영어로 시작, 타이틀·메뉴의 🌐 버튼으로 전환. 포털 설명·제목도 영어로 넣을 것
- 첫 5분 경험: 포털은 '처음 몇 분 동안 계속 하는지'로 평가한다. 튜토리얼이 짧고 바로 재미가 오는지 점검
- 저사양: 4GB 크롬북에서도 부드러워야 함 (마을 전체 보기가 가장 무거움)
