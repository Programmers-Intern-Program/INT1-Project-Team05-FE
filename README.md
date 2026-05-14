<p align="center">
  <img src="public/drawrace-logo.png" alt="DrawRace 로고" width="360" />
</p>

<h1 align="center">Draw Race 2026</h1>

<p align="center">
  <strong>프로그래머스 AI 인턴 프로그램 6기 · Team05</strong><br />
  실시간 그림 대전 · AI 채점 · 멀티플레이 웹 클라이언트
</p>

<p align="center">
  <a href="https://drawrace.site/"><img src="https://img.shields.io/badge/website-drawrace.site-6366f1?style=for-the-badge" alt="Live site" /></a>
  &nbsp;
  <a href="https://github.com/Programmers-Intern-Program/INT1-Project-Team05"><img src="https://img.shields.io/badge/backend-Spring_Boot-6DB33F?style=for-the-badge&logo=spring&logoColor=white" alt="Backend" /></a>
</p>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" /></a>
</p>

---

## 목차

- [소개](#소개)
- [기능 요약](#기능-요약)
- [기술 스택](#기술-스택)
- [시작하기](#시작하기)
- [환경 변수](#환경-변수)
- [스크립트](#스크립트)
- [프로젝트 구조](#프로젝트-구조)
- [백엔드와의 연동](#백엔드와의-연동)
- [브랜드 에셋](#브랜드-에셋)
- [관련 링크](#관련-링크)

---

## 소개

방을 만들거나 참여해 **제시어에 맞는 그림**을 그리고, **AI가 채점**한 점수로 라운드 승부를 겪는 게임입니다.  
**SockJS + STOMP**로 방 상태·채팅·랭킹을 실시간에 가깝게 맞추고, Next.js App Router 기반으로 로그인·마이페이지·게스트 입장까지 한 흐름으로 제공합니다.

---

## 기능 요약

| 영역       | 내용                                        |
| ---------- | ------------------------------------------- |
| **방**     | 목록 · 생성 · 입장, 실시간 상태·채팅·랭킹   |
| **게임**   | 캔버스 드로잉, 라운드 진행, 제출, 결과 화면 |
| **계정**   | 로그인, 게스트 로그인, 마이페이지           |
| **실시간** | `@stomp/stompjs` + SockJS                   |

---

## 기술 스택

| 영역       | 사용 기술                         |
| ---------- | --------------------------------- |
| 프레임워크 | **Next.js** (App Router)          |
| UI         | **React 19**, **Tailwind CSS v4** |
| 언어       | **TypeScript**                    |
| 실시간     | **SockJS**, **STOMP**             |
| 코드 품질  | **ESLint**, **Prettier**          |

---

## 시작하기

### 요구 사항

- **Node.js** 20 이상 (LTS 권장)
- **npm** (또는 pnpm, yarn, bun)

### 설치 및 실행

```bash
git clone https://github.com/Programmers-Intern-Program/INT1-Project-Team05-FE.git
cd INT1-Project-Team05-FE

npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.

> 로그인·방·게임 API를 쓰려면 [백엔드 저장소](https://github.com/Programmers-Intern-Program/INT1-Project-Team05)를 실행한 뒤, [환경 변수](#환경-변수)를 맞춰 주세요.

---

## 환경 변수

프로젝트 루트에 `.env.local` 을 만들고 아래를 설정합니다.

| 변수명                     | 설명                                   | 예시                    |
| -------------------------- | -------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Spring Boot **오리진** (끝에 `/` 없이) | `http://localhost:8080` |

- **REST**: 클라이언트 → `/api/backend/...` → Next Route Handler(`src/app/api/backend/[...path]/route.ts`)가 백엔드로 **프록시**
- **WebSocket**: `NEXT_PUBLIC_API_BASE_URL` 기준으로 연결 (`useRoomStomp` 등)

배포 환경에서는 실제 API 주소로 바꿉니다.

---

## 스크립트

| 명령어                 | 설명                       |
| ---------------------- | -------------------------- |
| `npm run dev`          | 개발 서버 (기본 포트 3000) |
| `npm run build`        | 프로덕션 빌드              |
| `npm run start`        | 빌드 결과 실행             |
| `npm run lint`         | ESLint                     |
| `npm run format`       | Prettier 적용              |
| `npm run format:check` | Prettier 검사만            |

---

## 프로젝트 구조

```
src/
├── app/                 # App Router · 페이지
│   ├── api/backend/     # 백엔드 프록시 (catch-all)
│   ├── login/
│   ├── rooms/
│   └── mypage/
├── components/
├── hooks/
└── lib/
```

---

## 백엔드와의 연동

| 구분   | 방식                                                   |
| ------ | ------------------------------------------------------ |
| HTTP   | `src/lib/api-client.ts` → `/api/backend` → Spring Boot |
| 실시간 | SockJS + STOMP (방 · 채팅 · 랭킹 등)                   |

API 상세는 백엔드 OpenAPI 문서를 참고하세요.

---

## 브랜드 에셋

| 파일                                                   | 용도                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [`public/drawrace-logo.png`](public/drawrace-logo.png) | **DrawRace** 팀 로고 (README·문서·발표 자료 등에 사용 가능) |

---

## 관련 링크

| 구분   | URL                                                                                       |
| ------ | ----------------------------------------------------------------------------------------- |
| 서비스 | [drawrace.site](https://drawrace.site/) · [www.drawrace.site](https://www.drawrace.site/) |
| 백엔드 | [INT1-Project-Team05](https://github.com/Programmers-Intern-Program/INT1-Project-Team05)  |
| ORG    | [Programmers-Intern-Program](https://github.com/Programmers-Intern-Program)               |

---

## 라이선스

교육·인턴 과제용 프로젝트입니다. 팀 정책에 따릅니다.
