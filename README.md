# Leaf — 개인용 영어 EPUB 리더

Next.js App Router + TypeScript로 만든 로컬 영어 독서 앱입니다. EPUB.js는 브라우저에서만 초기화하며, 원본은 서버 파일 시스템, 책 정보와 읽기 위치는 SQLite, 미반영 읽기 위치는 IndexedDB에 저장합니다.

## 로컬 설치와 실행

Node.js 24 LTS와 npm을 사용합니다.

```sh
npm ci
npm run dev
```

브라우저에서 http://127.0.0.1:3000 을 열고 EPUB을 업로드하세요. 개발 서버는 로컬 주소에만 바인딩합니다. 로컬에서 프로덕션 모드로 실행하려면 개발 서버를 종료하고 다음을 실행합니다.

```sh
npm run build
npm start
```

`better-sqlite3`는 네이티브 모듈입니다. 시스템에서 npm 설치 스크립트를 차단하는 경우 해당 패키지의 설치 스크립트를 허용한 뒤 `npm rebuild better-sqlite3`를 실행하세요. 사전 빌드 바이너리를 사용할 수 없는 시스템은 C++ 빌드 도구가 필요합니다.

## 기능

- 왼쪽 문장 액션 / 가운데 세로 스크롤 EPUB / 오른쪽 책장. 양쪽 패널을 접을 수 있습니다.
- 본문 선택 문장, 책 ID·제목, 챕터, CFI, 인접 문단 문맥을 메모리에 보존합니다. 빈 선택 이벤트는 기존 문장을 지우지 않습니다. 복사·초기화와 책 변경 시 초기화를 지원합니다.
- 목차, 이전·다음 이동, 글자 크기, 줄 간격, 밝은/어두운 테마. 설정은 localStorage에 보존합니다.
- 책별 CFI 위치 저장·복원. 최초 위치 복원이 끝날 때까지 초기 이벤트의 저장을 차단합니다. 글자 크기가 바뀌면 같은 CFI로 이동합니다.
- 서버 파일 업로드, SHA-256 중복 감지, 50MB 제한, ZIP 압축 해제 크기 제한, EPUB 컨테이너·패키지·spine 파일 검사. 실패한 요청의 파일은 정리하고 SQLite 삽입은 트랜잭션으로 처리합니다.
- 본문 iframe은 `allow-same-origin`만 허용하고 스크립트를 차단합니다. 렌더링 전 스크립트·임베드·이벤트 속성을 제거하고 본문 CSP도 적용합니다.

## 환경변수와 데이터

`.env.example`을 `.env.local`로 복사하면 데이터 경로를 지정할 수 있습니다.

| 변수            | 기본값                   | 설명                                   |
| --------------- | ------------------------ | -------------------------------------- |
| `EPUB_DATA_DIR` | 프로젝트의 `data`        | 절대 경로 또는 프로젝트 기준 상대 경로 |
| `CHROME_PATH`   | macOS Google Chrome 경로 | 브라우저 테스트용 실행 파일 경로       |

데이터 구성:

```text
data/
  library.sqlite
  library.sqlite-wal
  library.sqlite-shm
  books/<서버가 생성한 UUID>.epub
```

파일 경로는 DB에 `books/<UUID>.epub`처럼 상대 경로로 기록합니다. 서버를 종료한 후 데이터 디렉터리 전체를 옮기고 `EPUB_DATA_DIR`를 바꾸면 됩니다. 데이터와 SQLite 부속 파일은 Git에서 제외합니다. 경로를 프로젝트 밖으로 지정한 경우에도 개인 데이터 경로를 별도로 Git에 추가하지 마세요.

DB는 첫 API 접근 시 초기화합니다. `lib/db.ts`에서 SQLite `user_version`을 확인하고 번호가 붙은 스키마 변경을 트랜잭션으로 적용합니다. 향후 변경은 기존 테이블을 지우는 대신 다음 버전 마이그레이션을 추가하세요.

브라우저에는 IndexedDB `epub-reader/positions`와 localStorage `reading-settings`, `last-book`을 사용합니다. 포트·호스트가 바뀌면 브라우저 저장소가 달라집니다. SQLite 기록은 그대로 남습니다. 일반 브라우저 모드에서 저장소를 허용해야 로컬 미반영 위치를 보존할 수 있습니다.

## 위치 동기화

위치는 `bookId`, `cfi`, `updatedAt`(단조 증가 revision으로 사용하는 밀리초), `version: 1`, `synced`를 저장합니다. 서버 반영 여부는 브라우저에만 기록합니다.

로컬 저장은 180ms, 서버 저장은 1.5초 디바운스합니다. 계속 스크롤하는 경우에도 최대 5초 내에 서버 저장을 시도합니다. 실패하면 미반영 상태를 유지하고 5초 주기·온라인 이벤트·책 전환 뒤의 전역 재시도로 다시 반영합니다. 책을 바꾸기 직전 최신 위치를 로컬에 전달합니다. 탭 종료 요청만으로 저장하지 않습니다.

미반영 로컬 기록을 우선 복원하고 서버에 재전송합니다. 그 외에는 서버 기록을 사용하며, 서버 접근에 실패하면 로컬 기록을 사용합니다. 책별 요청을 직렬화하고 IndexedDB 트랜잭션에서 수정 시각을 비교하므로 늦은 응답이 최신 기록을 동기화 완료로 바꾸지 않습니다. SQLite도 오래된 revision의 갱신을 거절합니다.

## 검증

브라우저 테스트용 프로덕션 빌드를 먼저 생성한 뒤:

```sh
npm run typecheck
npm run build
npm test
```

브라우저 테스트는 macOS의 Google Chrome을 사용합니다. 다른 시스템에서는 `CHROME_PATH`를 지정하세요. 테스트는 서버에 세 개의 자체 제작 EPUB을 업로드합니다. Playwright가 3002번 포트에 별도 서버를 자동 실행하고 매 실행마다 운영체제 임시 디렉터리에 독립된 데이터 저장소를 만듭니다. 개인 서버의 `data`와 3000번 포트는 사용하지 않습니다. 테스트 종료 시 별도 서버는 자동 종료되며, 임시 데이터는 개인 책장에 표시되지 않습니다. 테스트 데이터 생성은 `npx tsx tests/fixture.ts`로 실행합니다.

실제 검증 결과: 위치 동기화 단위 테스트 3개와 Chromium 브라우저 통합 테스트 3개 통과, 타입 검사·프로덕션 빌드 성공. 개발 서버 종료 후 프로덕션 서버에서 책 목록과 SQLite 위치를 비교해 재시작 전후 동일함을 확인했습니다.

검증 내용:

- 단위 테스트: 미반영 로컬 우선 복원, 서버 실패 시 로컬 복원, 늦은 응답·오래된 쓰기 차단, 책별 분리, 연속 변경 중 최대 대기 시간, 전환 시 최신 위치 저장.
- 실제 Chromium 브라우저: 업로드·중복, 선택 유지·복사·초기화, 스크립트 차단, 목차 이동, 설정 변경·복원, 글자 변경 시 같은 문단 유지, 새로고침·책 전환 복원, 서버 PUT 503 중 로컬 복원과 연결 복구 후 반영, 오래된 서버 요청 거절, iPad 너비에서 패널 접기, 잘못된 EPUB 오류와 크기 제한.
- 로컬 서버를 종료하고 프로덕션 모드로 재실행한 뒤 책 목록과 서버 위치가 동일한지 별도 확인합니다.

## Docker와 Kubernetes

컨테이너는 Node.js 24 Debian 기반으로 빌드하며 Next.js standalone 서버를
`0.0.0.0:3000`에서 실행합니다. 로컬 개발과 `npm start`의 바인딩은 유지합니다.
SQLite 네이티브 모듈은 이미지 안에서 설치하므로 macOS의 `node_modules`를 복사하지
않습니다. 데이터와 `.env` 파일도 이미지에서 제외합니다.

```sh
docker build -t epub-reader:local .
docker volume create epub-reader-data
docker run --name epub-reader --rm -p 127.0.0.1:3000:3000 \
  --mount source=epub-reader-data,target=/data epub-reader:local
```

컨테이너를 종료하고 같은 명령으로 다시 실행하면 기존 책장과 읽기 위치를 유지합니다.
이 볼륨에는 새로운 책장을 만듭니다. 기존 로컬 `data/`가 자동으로 복사되지는 않습니다.
기존 데이터를 이전할 때는 원본 서버를 정지한 후 데이터 디렉터리 전체를 복사하고,
컨테이너 사용자 UID/GID `1000:1000`이 읽고 쓸 수 있는지 확인하세요.

Kubernetes 배포 YAML은 별도 GitOps 저장소
[`epub-anki-gitops`](../epub-anki-gitops/README.md)에서 관리합니다.
이 앱 저장소는 소스 코드와 Dockerfile을 관리하고, GitOps 저장소는 실행할 이미지와
Deployment·Service·PVC 설정을 관리합니다.

아래의 `YOUR_ACCOUNT`와 `VERSION`을 실제 값으로 바꾸고, 노드 아키텍처에 맞는
이미지를 레지스트리에 먼저 올리세요. 다른 아키텍처나 여러 아키텍처에 배포한다면
`docker buildx build --platform ... --push`를 사용합니다.

```sh
docker tag epub-reader:local ghcr.io/YOUR_ACCOUNT/epub-reader:VERSION
docker push ghcr.io/YOUR_ACCOUNT/epub-reader:VERSION
```

배포 준비와 Argo CD 연결 방법은 GitOps 저장소의 README를 참고하세요.
GitHub Actions가 이미지 발행 후 GitOps 저장소의 이미지 버전을 갱신합니다.
서버의 Argo CD에 GitOps 저장소를 연결하고 첫 배포와 자동 동기화를 구성했습니다.

## GitHub Actions

`.github/workflows/ci.yml`은 `main` push와 `main` 대상 PR에서 Node.js 24로
타입 검사, 프로덕션 빌드, 단위·브라우저 테스트를 ARM64 Ubuntu runner에서 실행합니다.
Ubuntu runner에는
Playwright Chromium과 시스템 의존성을 설치하고 `CHROME_PATH`를 지정합니다.
로컬 Chrome 설정은 그대로 유지합니다.

검사가 성공한 `main` push 또는 `main`에서의 수동 실행은 Docker 이미지를 빌드해
`ghcr.io/<소유자>/<앱 저장소 이름>:<커밋 SHA>`에 등록합니다. 현재 원격 저장소 기준
주소는 `ghcr.io/jungting20/epub-anki-web-app`입니다. PR에서는 이미지를 등록하지
않습니다. Actions의 수동 실행은 `workflow_dispatch`로 제공하며, 기본 브랜치에
워크플로 파일을 push한 뒤 사용할 수 있습니다.

GHCR 로그인에는 자동 제공되는 `GITHUB_TOKEN`을 사용하고 이미지 발행 job에만
`packages: write` 권한을 부여합니다. 별도 업로드용 Secret은 필요하지 않습니다.
저장소 또는 조직 정책에서 Actions와 패키지 발행이 허용되어 있어야 합니다.
같은 이름의 패키지가 이미 있다면 앱 저장소의 쓰기 권한을 확인하세요.

이미지는 서버 아키텍처에 맞춰 `linux/arm64`로 빌드합니다. 검사와 이미지 발행은
`ubuntu-24.04-arm` runner에서 실행하므로 네이티브 SQLite 모듈도 ARM64로 설치합니다.
이미지 등록 후
`update-gitops` job이 `jungting20/epub-anki-gitops`의 `main`을 받아 루트의
`kustomization.yaml`에서 `name: epub-reader` 항목의 `newName`과 `digest`를
갱신하고 `newTag`를 제거합니다. 한글 메시지로 커밋하고 `main`에 직접 push합니다.
동일한 이미지라면 추가 커밋을 만들지 않습니다. 앱의 `main`이 이미 새 커밋으로
바뀌었다면 이전 실행의 GitOps 갱신은 건너뜁니다. GitOps 저장소에 동시 변경이
있으면 최신 커밋에 다시 갱신을 적용해 최대 세 번 push를 시도합니다.

### GitOps 갱신용 Secret

앱 저장소의 기본 `GITHUB_TOKEN`은 다른 저장소에 쓸 수 없으므로 별도 인증이
필요합니다. GitHub에서 다음과 같이 fine-grained personal access token을 만드세요.

1. 계정 Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Resource owner: `jungting20`
3. Repository access: `Only select repositories` → `epub-anki-gitops`만 선택
4. Repository permissions → Contents: `Read and write`
5. 유효기간을 정해 토큰 생성
6. **앱 저장소** Settings → Secrets and variables → Actions → New repository secret
7. 이름 `GITOPS_TOKEN`, 값은 생성한 토큰

토큰은 코드나 커밋에 넣지 않습니다. 토큰을 등록하지 않으면 이미지 발행 후
GitOps 갱신 job이 안내 메시지와 함께 실패합니다. GitOps 저장소의 `main`에
직접 push할 수 있어야 하며, PR 필수 등의 보호 규칙이 있으면 현재 방식은
실패합니다. 토큰 유효기간이 만료되면 Secret을 갱신하세요.

Actions 실행 요약에서 발행한 이미지와 GitOps 갱신 결과를 확인합니다. GitOps
저장소를 별도로 pull하면 자동 생성된 커밋을 볼 수 있습니다. 워크플로는
Kubernetes에 직접 배포하지 않으며, Argo CD를 이 GitOps 저장소에 연결하고 자동
동기화를 활성화해야 실제 배포됩니다. GHCR 패키지의 공개 범위와 비공개 이미지의
Kubernetes pull 인증은 별도로 설정합니다.

## 현재 제약

개인용 단일 사용자이며 문장 번역은 Hermes를 사용합니다. 문장 변형은 포함하지 않습니다. DRM EPUB은 지원하지 않습니다. EPUB 2/3 메타데이터에 지정된 JPEG·PNG·GIF·WebP 표지를 표시하며, 표지가 없거나 형식을 지원하지 않으면 제목 첫 글자를 사용합니다. 일반적인 재배치 가능한 EPUB을 우선하며 고정 레이아웃·복잡한 출판사 CSS는 별도 튜닝이 필요할 수 있습니다. 글자 크기 변경 시 EPUB.js의 줄 경계 계산으로 CFI 문자 오프셋이 조금 달라질 수 있지만 같은 문단 부근을 유지합니다. iPad 화면 너비는 Chromium에서 확인했으며 실제 iPad Safari의 터치 선택은 실기기 검증이 필요합니다. 여러 탭·기기 간 복잡한 병합은 지원하지 않습니다.

## Anki 듣기 카드 등록

문장을 선택한 뒤 왼쪽 사이드바의 **Anki 덱 경로**에 `영어::독서::책 이름`처럼 입력하고
**Anki 카드 생성**을 누릅니다. 덱 경로는 브라우저에 저장됩니다. 없는 덱은 새로 생성합니다.
카드 종류는 `Basic`이며 **Front는 선택 문장의 MP3 음성**, **Back은 선택한 영어 문장과 한글 번역**입니다.
기존 `Basic` 노트 유형이 있으면 사용하고, 없으면 Front·Back 필드와 카드 템플릿 하나를 생성합니다.
등록 후 사용자 Anki에서 동기화해야 카드와 음성이 내려옵니다.

`POST /api/anki/cards` → `scripts/register_anki_card.py` → Hermes 번역(`gpt-6-luna`, `medium`) → ElevenLabs 음성 생성 →
Anki Python 클라이언트에서 노트 생성 → 컬렉션·미디어 동기화 순서로 실행합니다.
API에는 `text`, `deck`, `title`, `chapter`, `context` 문자열을 보냅니다.
`context`는 선택 문장의 주변 문맥이며 번역 참고에만 사용합니다. 제목과 챕터는 요청의 출처 정보이며
이번 카드에는 앞면 음성과 뒷면의 영어 문장·한글 번역을 저장합니다. 요청을 기다리는 동안 등록 버튼을 비활성화합니다.

서버에 다음 환경변수가 필요합니다. 기존 english-study 프로필의 음성 설정과 Anki 동기화
계정을 사용할 수 있으며, 값을 브라우저나 Git에 넣지 마세요.

| 변수                  | 설명                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `ANKI_SYNC_ENDPOINT`  | `/`로 끝나는 동기화 서버 URL. 컨테이너에서 접속 가능한 주소 사용 |
| `ANKI_SYNC_USER`      | 동기화 계정                                                      |
| `ANKI_SYNC_PASSWORD`  | 계정의 원본 비밀번호 (서버의 비밀번호 해시 아님)                 |
| `ELEVENLABS_API_KEY`  | 음성 생성 API 키                                                 |
| `ELEVENLABS_VOICE_ID` | 영어 음성 ID                                                     |
| `ELEVENLABS_MODEL`    | 기본값 `eleven_v4`                                               |
| `ANKI_PYTHON`         | Anki 패키지를 설치한 Python 실행 파일                            |

Docker 이미지는 Python 가상환경(`anki==26.8.1`), ffmpeg, SSH 클라이언트를 포함하며 `ANKI_PYTHON`을
`/opt/anki/bin/python`으로 설정합니다. Kubernetes 배포는 위 접속 정보 5개를 Secret으로
주입하고, 앱의 `/data`를 영속 볼륨으로 유지해야 합니다. 같은 OCI 서버여도 컨테이너의
`localhost`는 호스트를 가리키지 않으므로 Anki 동기화 서비스에 도달하는 주소를 사용하세요.
호스트에서 직접 Next.js를 실행하면 기존 `/home/hermes/anki-sync-server/venv/bin/python`을
사용할 수 있습니다. 별도 환경 설치는 다음과 같습니다.

```sh
python3 -m venv .venv-anki
.venv-anki/bin/pip install -r scripts/requirements-anki.txt
# ffmpeg/ffprobe도 설치하고 ANKI_PYTHON을 이 가상환경의 절대 경로로 지정
```

작업용 컬렉션과 음성 캐시는 `<EPUB_DATA_DIR>/anki/`에 저장합니다. 기존 english-study의
작업용 컬렉션이나 학습 진도 파일을 공유하지 않습니다. 같은 덱·같은 문장은 식별 태그로
재사용하며, 실패한 요청을 같은 문장과 덱으로 다시 실행하면 동기화를 이어갑니다.
한 번에 한 작업만 컬렉션을 수정하도록 파일 잠금을 사용합니다. 기존 카드가 수정됐거나
전체 동기화가 필요하면 자동 덮어쓰기를 중단합니다. 음성 생성은 외부 API를 사용하므로
비용이 발생하며, 응답이 유실된 요청의 재시도는 추가 음성 생성 비용이 발생할 수 있습니다.

개인용 API이므로 외부 공개 시 앱 전체를 기존 인증·접근 제한 뒤에 두세요.
Python 검증은 `python tests/anki_worker_test.py`로 실행하며, 외부 서버나 음성 API 없이
임시 Anki 컬렉션으로 Basic 카드 생성·중복 재시도·실패 후 복구를 검사합니다.

### Hermes 번역 연결

호스트에서 직접 실행할 때는 `HERMES_BIN=/home/hermes/.local/bin/hermes`로 지정합니다.
Next.js 실행 계정에서 Hermes의 `openai-codex` 인증을 사용할 수 있어야 합니다.
모델과 추론 강도는 `gpt-6-luna` / `medium`으로 고정합니다. 선택 문장과 문맥을 JSON으로
전달하고 한국어 번역만 받아, Back에 영어 원문 다음 빈 줄과 번역을 추가합니다.
번역 결과는 `<EPUB_DATA_DIR>/anki/cards/`에 저장하므로 재시도 때 다시 번역하지 않습니다.
번역 실패나 잘못된 응답은 카드 등록 전에 중단하며, 번역을 생략한 카드를 만들지 않습니다.

Docker에서는 호스트의 Hermes 설치·인증을 SSH로 이용할 수 있습니다.

| 변수                          | 설명                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `HERMES_BIN`                  | 호스트의 Hermes CLI 절대 경로. 기본값 `/home/hermes/.local/bin/hermes` |
| `HERMES_SSH_TARGET`           | 컨테이너에서 접속 가능한 `hermes@호스트주소`. 미설정 시 로컬 CLI 사용  |
| `HERMES_SSH_IDENTITY_FILE`    | 컨테이너 안에 마운트한 SSH 개인 키 경로                                |
| `HERMES_SSH_KNOWN_HOSTS_FILE` | 서버 호스트 키를 미리 등록해 마운트한 known_hosts 경로                 |

키·known_hosts는 Secret/볼륨으로 제공하고 앱 실행 사용자(`node`)가 읽을 수 있도록 설정합니다.
SSH 호스트 키 검증은 필수입니다. Hermes CLI·OpenAI 인증은 호스트에서 유지하며 Docker 이미지에
복사하지 않습니다. 프롬프트는 표준입력으로만 전달하고 번역 실행에는 도구를 활성화하지 않습니다.
