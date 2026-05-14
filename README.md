# Draw Race 2026 · Frontend

> 프로그래머스 AI 인턴 프로그램 6기 **Team05**  
> 실시간으로 그림을 그리고, AI 채점으로 승부를 가리는 멀티플레이 그림 게임의 **웹 클라이언트**입니다.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## 목차

- [기능 요약](#기능-요약)
- [기술 스택](#기술-스택)
- [시작하기](#시작하기)
- [환경 변수](#환경-변수)
- [스크립트](#스크립트)
- [프로젝트 구조](#프로젝트-구조)
- [백엔드와의 연동](#백엔드와의-연동)
- [관련 링크](#관련-링크)

---

## 기능 요약

- **방** — 목록, 생성, 입장, 실시간 상태·채팅·랭킹
- **게임** — 캔버스 드로잉, 라운드 진행, 제출, 결과 화면
- **계정** — 로그인, 게스트 로그인, 마이페이지
- **실시간** — SockJS + STOMP (`@stomp/stompjs`)

---

## 기술 스택

| 영역        | 사용 기술 |
| ----------- | --------- |
| 프레임워크  | **Next.js** (App Router) |
| UI          | **React 19**, **Tailwind CSS v4** |
| 언어        | **TypeScript** |
| 실시간      | **SockJS**, **STOMP** |
| 코드 품질   | **ESLint**, **Prettier** |

---

## 시작하기

### 요구 사항

- **Node.js** 20 이상 권장 (LTS)
- **npm** (또는 pnpm, yarn, bun)

### 설치 및 실행

```bash
git clone https://github.com/Programmers-Intern-Program/INT1-Project-Team05-FE.git
cd INT1-Project-Team05-FE

npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.

> 로그인·방·게임 API를 쓰려면 [백엔드](https://github.com/Programmers-Intern-Program/INT1-Project-Team05)를 띄운 뒤, 아래 [환경 변수](#환경-변수)를 맞춰 주세요.

---

## 환경 변수

프로젝트 루트에 `.env.local` 파일을 만들고 설정합니다.

| 변수명 | 설명 | 예시 |
| ------ | ---- | ---- |
| `NEXT_PUBLIC_API_BASE_URL` | Spring Boot 백엔드 **오리진** (스킴+호스트+포트, 끝 `/` 없이) | `http://localhost:8080` |

- **REST 호출**은 클라이언트가 `/api/backend/...` 로 요청하고, Next Route Handler(`src/app/api/backend/[...path]/route.ts`)가 위 URL로 **프록시**합니다.
- **WebSocket** 연결 주소도 이 값을 기준으로 잡습니다 (`useRoomStomp` 등).

배포 서버에서는 실제 백엔드 주소로 바꿉니다.

---

## 스크립트

| 명령어 | 설명 |
| ------ | ---- |
| `npm run dev` | 개발 서버 (기본 포트 3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 결과 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run format` | Prettier로 포맷 |
| `npm run format:check` | Prettier 검사만 |

---

## 프로젝트 구조

```
src/
├── app/                 # App Router 페이지·레이아웃
│   ├── api/backend/     # 백엔드 프록시 (catch-all route)
│   ├── login/
│   ├── rooms/
│   └── mypage/
├── components/          # 재사용 UI
├── hooks/               # STOMP 등 커스텀 훅
└── lib/                 # API 클라이언트, 유틸
```

---

## 백엔드와의 연동

| 구분 | 방식 |
| ---- | ---- |
| HTTP | `src/lib/api-client.ts` → `/api/backend` → Spring Boot |
| 실시간 | SockJS 엔드포인트 + STOMP 구독 (방·채팅·랭킹 등) |

자세한 API 명세는 백엔드 저장소의 OpenAPI 문서를 참고하세요.

---

## 관련 링크

| 구분 | URL |
| ---- | ----- |
| **서비스** | [drawrace.site](https://drawrace.site/) |
| **백엔드 저장소** | [INT1-Project-Team05](https://github.com/Programmers-Intern-Program/INT1-Project-Team05) |
| **ORG** | [Programmers-Intern-Program](https://github.com/Programmers-Intern-Program) |

---

## 라이선스

교육·인턴 과제용 프로젝트입니다. 팀 정책에 따릅니다.
