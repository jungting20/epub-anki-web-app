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

`deploy/`는 운영 환경 하나를 위한 Kustomize 설정입니다. 단일 Pod와 `Recreate`
전략을 사용하므로 배포 중 짧은 중단이 발생합니다. `/data`에는 5Gi PVC를 연결합니다.
기본 StorageClass가 SQLite WAL에 적합한 블록 스토리지인지 먼저 확인하고,
필요하면 `pvc.yaml`에 `storageClassName`을 지정하세요. NFS는 사용하지 않습니다.
CPU/메모리 값은 초기값이며 최대 50MB EPUB 업로드를 측정해 조정해야 합니다.

아래의 `YOUR_ACCOUNT`와 `VERSION`을 실제 값으로 바꾸고, 노드 아키텍처에 맞는
이미지를 레지스트리에 먼저 올리세요. 다른 아키텍처나 여러 아키텍처에 배포한다면
`docker buildx build --platform ... --push`를 사용합니다.

```sh
docker tag epub-reader:local ghcr.io/YOUR_ACCOUNT/epub-reader:VERSION
docker push ghcr.io/YOUR_ACCOUNT/epub-reader:VERSION
```

`deploy/deployment.yaml`의 `image` 자리표시자를 발행한 이미지 주소로 바꾸세요.
GitOps에서는 `ghcr.io/YOUR_ACCOUNT/epub-reader@sha256:...`처럼 digest를 고정합니다.
비공개 GHCR 이미지는 namespace에 pull 인증 Secret을 준비하고 Deployment의
`spec.template.spec.imagePullSecrets`에 연결해야 합니다. 인증 값은 Git에 넣지 마세요.

```sh
kubectl kustomize deploy
kubectl apply -k deploy
kubectl -n epub-reader rollout status deployment/epub-reader
kubectl -n epub-reader port-forward service/epub-reader 3000:80
```

Service는 ClusterIP이므로 우선 port-forward로 접속합니다. 도메인, TLS, VPN 또는
인증 프록시는 실제 클러스터 구성에 맞춰 추가합니다. 앱에는 로그인 기능이 없습니다.
Ingress를 추가한다면 50MB 파일의 multipart 여유를 포함한 요청 크기와 타임아웃을
설정하세요. startup/liveness는 `/`, readiness는 SQLite에 접근하는 `/api/books`를
검사합니다. 개인 책장에 접근하지 않는 별도 볼륨으로 업로드, 위치 저장, 재시작 후
복원을 확인한 뒤 기존 데이터를 이전하세요.

나중에 별도 GitOps 저장소를 만들면 `deploy/`를 옮기고 Argo CD가 그 경로를
동기화하도록 연결합니다. Namespace와 PVC에는 Argo CD의 자동 prune 및 Application
삭제 시 삭제를 막는 annotation을 넣었습니다. `kubectl delete`로 직접 삭제하는 것은
막지 않으므로 데이터가 있는 namespace/PVC를 삭제하지 마세요. PV reclaim policy와
데이터 백업/복원도 별도로 준비해야 합니다. DB 마이그레이션은 이미지 롤백으로
되돌아가지 않습니다. 현재 CI와 Argo CD 연결은 포함하지 않습니다.

## 현재 제약

개인용 단일 사용자이며 Anki, 음성 생성, LLM은 포함하지 않습니다. DRM EPUB은 지원하지 않습니다. EPUB 2/3 메타데이터에 지정된 JPEG·PNG·GIF·WebP 표지를 표시하며, 표지가 없거나 형식을 지원하지 않으면 제목 첫 글자를 사용합니다. 일반적인 재배치 가능한 EPUB을 우선하며 고정 레이아웃·복잡한 출판사 CSS는 별도 튜닝이 필요할 수 있습니다. 글자 크기 변경 시 EPUB.js의 줄 경계 계산으로 CFI 문자 오프셋이 조금 달라질 수 있지만 같은 문단 부근을 유지합니다. iPad 화면 너비는 Chromium에서 확인했으며 실제 iPad Safari의 터치 선택은 실기기 검증이 필요합니다. 여러 탭·기기 간 복잡한 병합은 지원하지 않습니다.
