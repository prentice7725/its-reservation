# ITS 예약 관리 시스템

숙박 예약을 자동화하고 관리하는 웹 애플리케이션입니다.

## 기능

- ✅ 태스크 생성/편집/삭제
- ✅ HTTP 및 Playwright 방식 예약 지원
- ✅ 실시간 로그 표시 (WebSocket)
- ✅ 장소별 예약 설정
- ✅ 동시 실행 제어
- ✅ 실행 모드 선택 (단일/반복/스케줄)
- ✅ 실행 히스토리 저장
- ✅ Dry-run 예약 검증
- ✅ 스케줄 상태 및 예약 서버 시간 확인

## 기술 스택

### 백엔드
- Node.js + Express 5
- WebSocket (실시간 로그)
- Playwright (브라우저 자동화)
- Axios (HTTP 요청)
- node-schedule (스케줄 실행)
- tough-cookie / http-cookie-agent (HTTP 예약 세션 처리)

### 프론트엔드
- React 18
- Material-UI (MUI v6)
- Vite

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```

이 명령어는 다음을 동시에 실행합니다:
- 백엔드 API 서버 (http://localhost:3001)
- 프론트엔드 개발 서버 (http://localhost:5173)

### 3. 브라우저에서 접속
```
http://localhost:5173
```

## 프로젝트 구조

```
its-reservation/
├── server/                 # 백엔드 서버
│   ├── index.js           # Express 서버 및 API
│   ├── storage.js         # 데이터 저장 (JSON 파일)
│   └── reservation-executor.js  # 예약 실행 엔진
├── src/
│   ├── reservation/       # 예약 로직
│   │   ├── http-reservation.js     # HTTP 방식 예약
│   │   └── playwright-reservation.js  # Playwright 방식 예약
│   └── renderer/          # React 프론트엔드
│       ├── api/
│       │   └── client.js  # API 클라이언트
│       ├── components/    # React 컴포넌트
│       ├── contexts/      # React Context
│       └── App.jsx
├── data/                  # 로컬 데이터 파일
│   ├── tasks.json        # 태스크 저장
│   ├── history.json      # 실행 히스토리
│   └── places.json       # 장소 설정
├── vite.config.js         # Vite 개발 서버 설정
└── index.html            # Vite 진입점
```

## 장소 관리

장소 목록은 `data/places.json` 파일에서 관리됩니다:

```json
{
  "karuizawa": {
    "name": "ホテルハーヴェスト 旧軽井沢",
    "queryString": "..."
  },
  "tateyama": {
    "name": "トスラブ館山 ルアーナ",
    "queryString": "..."
  }
}
```

## API 엔드포인트

### 태스크 관리
- `GET /api/tasks` - 모든 태스크 조회
- `POST /api/tasks` - 태스크 저장
- `DELETE /api/tasks/:id` - 태스크 삭제

### 실행 제어
- `POST /api/execution/start/:taskId` - 태스크 실행
- `POST /api/execution/start-all` - 모든 태스크 실행
- `POST /api/execution/stop/:taskId` - 태스크 중단
- `POST /api/execution/dry-run/:taskId` - 태스크 dry-run 실행

### 장소 관리
- `GET /api/places` - 장소 목록 조회
- `POST /api/places` - 장소 목록 저장

### 히스토리
- `GET /api/history` - 실행 히스토리 조회

### 상태 확인
- `GET /api/schedule/status` - 등록된 스케줄 상태 조회
- `GET /api/reservation/server-time` - 예약 서버 시간 상태 조회

### 실시간 로그
- `ws://localhost:3001` - `execution:log`, `execution:status` 이벤트 수신

## 스크립트

- `npm run server` - 백엔드 서버만 실행
- `npm run client` - 프론트엔드만 실행
- `npm run dev` - 백엔드 + 프론트엔드 동시 실행
- `npm run build` - 프로덕션 빌드

## 로컬 데이터 및 로그

- `data/tasks.json`, `data/history.json`, `data/places.json`는 앱 실행 중 갱신되는 로컬 상태 파일입니다.
- `server.log`, `dev-server.log`, `app.log` 등 로그 파일은 디버깅 용도이며 배포 산출물로 취급하지 않습니다.
- 루트에 남아 있는 `reservation_*.cjs`, `reservation_fast_puppeteer.js` 파일들은 실험/디버깅용 스크립트입니다. 실제 앱 흐름은 `server/reservation-executor.js`와 `src/reservation/` 아래 구현을 사용합니다.

## 라이선스

MIT
