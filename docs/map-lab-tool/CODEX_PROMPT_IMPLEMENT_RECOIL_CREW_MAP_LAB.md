# Codex Prompt — Implement Recoil Crew Map Lab

먼저 다음 문서를 읽고 바인딩 구현 계약으로 취급하라.

```text
RECOIL_CREW_MAP_LAB_DESIGN_DOCUMENT.md
```

대상 저장소:

```text
mwl313/RecoilCrewDS
branch: map-creation
```

함께 확인할 자료:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/map-generation/
docs/refractor/

src/shared/mapgen/
src/shared/content/
src/client/app/debugOverlay.ts
src/client/arenaView.ts
src/client/app/gameClient.ts
src/server/room.ts
package.json

content/maps/
content/terrain-profiles/
content/validation-profiles/
content/furniture-sets/
content/density-profiles/
content/landmarks/
```

실제 저장소를 먼저 조사하고, 이전 보고서의 경로가 현재도 같다고 가정하지 마라.

---

# Mission

실제 Production 맵 생성기, 콘텐츠 프로파일, 검증기를 사용하는 별도 브라우저 도구 **Recoil Crew Map Lab**을 구현하라.

도구는 다음을 지원해야 한다.

- Production 맵 재현
- Exact Candidate 재현
- 맵 생성 파라미터 편집
- 생성 레이어 토글
- 오브젝트 생성 토글
- 검증 실패 위치 확인
- Source와 Working 값 비교
- 게임 적용용 Profile Bundle Export
- Generated Arena와 Validation Report Export
- CLI를 통한 안전한 콘텐츠 적용
- 신규 파라미터와 오브젝트가 추가될 때 확장 가능한 UI

Map Lab용 별도 생성기나 단순화된 알고리즘을 만들지 마라.

---

# Governance

내부적으로 다음 순서로 진행한다.

```text
Milestone 0 — 단일 소스와 재사용 가능한 디버그 레이어
Milestone 1 — Map Lab MVP
Milestone 2 — Export/Apply와 하드닝
```

각 Milestone의 테스트를 통과한 뒤 다음으로 이동한다.

Seed Gallery, A/B split-screen, Drive Test는 MVP 완료 게이트 전에는 구현하지 않는다. 후속 작업으로 문서화할 수 있다.

코드 수정 전에 다음을 작성한다.

```text
docs/maplab/MAP_LAB_IMPLEMENTATION_PLAN.md
```

Plan에는 다음을 기록한다.

- 현재 생성 API
- JSON과 클라이언트 프로파일 미러 구조
- DebugOverlay 책임
- 오브젝트 배치 데이터와 실제 흐름
- Validation Issue 구조
- 빌드와 테스트 게이트
- 추가·분리·이동할 정확한 모듈

Plan 작성 후 즉시 구현을 시작한다. Plan만 작성하고 멈추지 마라.

---

# 절대 금지

- 게임 재작성
- TypeScript/Three.js/Vite/Node/WebSocket 스택 교체
- 지형·경로·퍼니처·시드·체크섬·검증 알고리즘 복제
- Map Lab을 일반 플레이어 번들에 포함
- 브라우저 UI가 저장소 파일을 직접 덮어쓰기
- Imported frozen definition 변경
- 멀티플레이 구조 변경
- 게임 밸런스 변경
- 수동 지형 조각
- Drag-and-drop 씬 편집
- 몬스터 패스파인딩 추가
- 트럭 경로 추가
- 동굴·브리지·파괴 지형·스트리밍 추가
- 체크섬 불일치 상태로 계속 실행
- Golden fixture를 검토 없이 재생성

---

# Milestone 0 — Source of Truth와 공유 레이어

## 0.1 수동 프로파일 중복 제거

다음 파이프라인을 구현한다.

```text
content JSON
→ scripts/generate-map-profile-bundle.ts
→ src/generated/mapProfiles.generated.ts
```

스크립트:

```bash
npm run generate:map-profiles
```

요구사항:

- 실제 ContentLoader와 기존 스키마·참조 검증 사용
- 완성된 `MapGenerationBundle` 생성
- 안정적인 정렬과 직렬화
- 자동 생성 경고 헤더
- 함수나 런타임 객체 포함 금지
- 클라이언트·Practice·Map Lab·재구성 경로에서 사용
- 서버는 검증된 JSON에서 계속 resolve 가능
- Generated bundle과 server-resolved bundle parity 테스트
- stale generated file 감지

모든 소비자가 이동하면 수동 `LEGACY_MAP_DEFINITIONS`와 Phase 2 미러를 제거하거나 명확히 비활성화한다.

## 0.2 DebugOverlay 레이어 분리

`src/client/app/debugOverlay.ts`를 재구성한다.

공유 레이어:

```text
height
slope
features
routes
corridors
zones
spawns
gates
ramps
landings
recovery
colliders
barrel chains
validation issues
```

요구사항:

- 게임 F3 Overlay 유지
- Map Lab에서 동일 레이어 사용
- visibility/rebuild/dispose 지원
- authoritative arena data 변경 금지
- 반복 재빌드 리소스 누수 금지

## 0.3 Validation Issue 표준화

기존 Validator 알고리즘은 유지하면서 UI용 계약으로 변환한다.

```ts
interface MapValidationIssue {
  id: string;
  code: string;
  message: string;
  severity: "error" | "warning";
  category: string;
  position?: { x: number; y: number; z: number };
  entityId?: string;
  layerId?: string;
  parameterPaths?: string[];
}
```

## 0.4 오브젝트 Enabled 계약

최소 지원:

```text
objectPlacement.enabled
ramps.enabled
barrel.enabled
furniture entry enabled
```

요구사항:

- 비활성화 시 count 보존
- Objects를 꺼도 terrain/routes/zones/spawns/gates/recovery 유지
- 같은 kind의 모든 Entry 처리
- 첫 Entry만 선택하는 `find()` 형태 제거
- Crate가 생성→월드 변환→렌더링 사이에서 누락되지 않음
- Hardcoded Light Pole을 데이터화하거나 명시적 토글 제공
- kind별 requested/placed/rendered/collider/rejected Metrics

---

# Milestone 1 — Map Lab MVP

## 1.1 별도 Vite 엔트리

```text
tools/maplab/
├── index.html
├── vite.config.ts
└── src/
```

스크립트:

```json
{
  "dev:maplab": "vite --config tools/maplab/vite.config.ts",
  "build:maplab": "npm run generate:map-profiles && vite build --config tools/maplab/vite.config.ts",
  "test:maplab": "vitest run tests/maplab"
}
```

일반 client build에 Map Lab 코드나 Tweakpane이 포함되지 않게 한다.

## 1.2 Tweakpane

가능하면 Tweakpane을 사용한다. Tweakpane은 View/Controller일 뿐이고 `MapLabState`가 상태 원본이다.

## 1.3 Generator Adapter

다음 모드를 지원하는 단일 어댑터를 구현한다.

```text
production
exactCandidate
```

Production은 게임과 같은 retry/fallback 흐름을 사용한다.

Exact Candidate는 재구성·테스트와 같은 candidate builder를 사용한다.

Production 입력이 실제 게임 세션과 같은 checksum을 만드는 테스트를 추가한다.

## 1.4 Working Bundle

- Generated source bundle deep clone
- Source/Frozen content 변경 금지
- Dirty 상태
- Source Reset
- Section Reset
- 편집 전/후 검증
- Fallback bundle 별도 보존

## 1.5 Web Worker

생성·검증을 Worker에서 실행한다.

- Request ID
- 오래된 결과 무시
- TypedArray Transferable
- Worker에 Three.js 금지
- Error transport
- 연속 편집 중 UI 반응 유지

기존 생성기의 특정 의존성 때문에 Worker가 불가능한 경우 원인을 문서화하고, 임시로 debounced main-thread 어댑터를 사용하되 생성 로직을 복제하지 마라.

## 1.6 Parameter Registry

Descriptor 기반 컨트롤을 구현한다.

지원 타입:

```text
number
boolean
select
text
range
readonly
```

Descriptor:

```text
path
label
group
type
min/max/step
unit
description
basic/advanced
requiresRegeneration
visibleWhen
```

현재 map/terrain/validation/route/ramp/barrel/furniture/density 파라미터를 모두 등록한다.

등록되지 않은 신규 필드는 Raw JSON에서 편집 가능해야 한다.

UI 컴포넌트에 모든 필드를 직접 하드코딩하지 마라.

## 1.7 UI

구현:

```text
상단 툴바
왼쪽 파라미터 패널
중앙 뷰포트
오른쪽 검증·Metrics 패널
하단 레이어·History·Diff 드로어
```

상단:

- Profile
- Production/Exact
- Room Code
- Match Index
- Generator Version
- Seed fields
- Previous/Next/Random
- Regenerate
- Auto Regenerate
- Undo/Redo
- Reset
- Export

왼쪽:

```text
Basic
Terrain
Routes
Objects
Validation
Advanced JSON
```

중앙:

```text
Orbit 3D
Top Down
Fit Map
Focus Issue
```

오른쪽:

- PASS/FAIL
- Category 상태
- Issues
- Metrics
- Performance
- Logs

## 1.8 카메라

- OrbitControls
- Orthographic Top Down
- 전환 시 중심점 보존
- Issue 클릭 시 레이어 활성화와 카메라 포커스

## 1.9 레이어

토글:

```text
terrain
height heatmap
slope heatmap
macro features
route nodes
route edges
route corridors
semantic zones
player spawns
enemy gates
recovery
ramps
flight/landing
furniture
colliders
decorations
barrel chains
validation errors
validation warnings
```

Milestone 0의 공유 레이어를 사용한다.

## 1.10 재생성

- 기본 300ms debounce
- Auto Regenerate
- Apply Changes
- Visibility 변경 시 재생성 금지
- 이전 Three.js 리소스 dispose
- 최신 Worker 결과만 렌더링

## 1.11 History와 Draft

- Undo/Redo
- Reset Section/Profile
- Changed-value list
- Source vs Working JSON Diff
- localStorage/IndexedDB draft
- Source fingerprint가 다르면 복원 경고

---

# Milestone 2 — Export, Apply, Hardening

## 2.1 Export

버튼을 분리한다.

```text
Export Profile Bundle
Export Generated Arena
Export Validation Report
```

Profile Bundle은 선택한 맵에 필요한 모든 Definition과 Format Version을 포함한다.

Generated Arena는 Seeds, Version, Attempt, Checksum, Heightfield, Layout, Objects, Validation을 포함한다.

## 2.2 Apply CLI

```text
scripts/apply-maplab-profile.ts
```

명령:

```bash
npm run maplab:apply -- ./downloads/profile.json
```

요구사항:

- Format/version 검증
- 실제 스키마 검증
- 참조 검증
- ID 충돌 확인
- `--overwrite` 없이 기존 파일 교체 금지
- Content Manifest 갱신
- client-safe bundle 재생성
- 관련 테스트 실행 또는 정확한 안내
- 변경 파일 출력
- Git Commit 생성 금지

## 2.3 오브젝트 UI

- Master Enable
- Category Enable
- Entry Enable
- Count
- Spacing
- Clearance
- Zones
- Slope Max
- Collider
- Asset ID
- Obstacle Type

결과 Metrics:

```text
requested
placed
rendered
colliders
rejected
```

## 2.4 Metrics

표시:

- Base/Candidate Seed
- Attempt
- Generator Version
- Checksum
- Fallback
- Generator/Validation/Render ms
- Height Min/Max
- Max Slope
- Route Loops
- Min Route Width
- Objects/Colliders
- Barrel Chain Max
- Ramp Count
- Spawn/Gate/Recovery Count
- Scene Objects
- Draw Calls

## 2.5 문서

작성:

```text
docs/maplab/MAP_LAB_USER_GUIDE.md
docs/maplab/MAP_LAB_ARCHITECTURE.md
docs/maplab/MAP_LAB_IMPLEMENTATION_REPORT.md
```

업데이트:

```text
README.md
docs/README.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/ARCHITECTURE.md
docs/planning/BUILD_STATUS.md
```

---

# 테스트

## 단일 소스

- Generated client bundle == server-resolved content
- Stale generated file 감지
- Active manual profile mirror 없음

## Generator Adapter

- Production parity
- Exact candidate parity
- Retry/fallback parity
- Working bundle이 Source를 변경하지 않음

## Parameters

- Descriptor path
- Validation
- Raw JSON
- Undo/Redo
- Reset
- Object enabled 상태

## Shared Layers

- Create/Toggle/Rebuild/Focus/Dispose
- 게임 DebugOverlay 회귀

## Export/Apply

- Profile round-trip
- Arena checksum round-trip
- Invalid bundle reject
- Conflict handling
- overwrite 보호
- manifest update
- bundle parity

## Map Lab E2E

1. Map Lab 열기
2. Primary profile 로드
3. Production map 생성
4. Hill height 변경
5. Regenerate 확인
6. Top Down 전환
7. Routes 토글
8. All Objects OFF
9. 경로는 유지되고 오브젝트 수만 감소하는지 확인
10. Issue 선택
11. Profile Export
12. 새로고침 후 Draft 복원

## 게임 회귀 명령

```bash
npm run generate:map-profiles
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run build:maplab
npm run test:maplab
```

모든 명령을 실제로 실행하고 결과를 보고한다. 실행하지 않은 테스트를 통과했다고 말하지 마라.

---

# 성능·수명주기 게이트

- 20회 연속 Regenerate 후 retained scene object 증가 없음
- 10회 Profile 전환 후 이전 리소스 제거
- Layer 토글이 맵 재생성을 일으키지 않음
- 오래된 Worker 응답이 최신 맵을 덮어쓰지 않음
- Map Lab이 일반 client production chunks에 없음
- Tweakpane이 일반 client production chunks에 없음
- 게임 F3 Debug Overlay 유지

---

# 구현 보고서

```text
docs/maplab/MAP_LAB_IMPLEMENTATION_REPORT.md
```

포함:

1. Current-state audit
2. Source-of-truth migration
3. Files added/modified
4. Generated bundle design
5. Shared debug layers
6. Generator adapter
7. Worker design
8. Parameter registry
9. Object toggle design
10. UI/camera modes
11. Validation focus
12. History/draft
13. Export formats
14. Apply CLI
15. Build results
16. Unit test results
17. Map test results
18. E2E results
19. Game regression results
20. Performance/lifecycle results
21. Remaining limitations
22. Recommended next features

---

# 완료 조건

다음이 모두 충족되어야 완료다.

> Map Lab이 실제 Production 맵 파이프라인을 재현하고, Exact Candidate를 분석하며, 복제된 검증 프로파일을 확장 가능한 Descriptor로 편집하고, 주요 생성 레이어와 검증 오류를 시각화·포커스하고, 오브젝트 출현을 여러 단계에서 제어하고, 게임 적용용 Profile Bundle을 Export하며, CLI로 안전하게 적용하고, 서버와 클라이언트가 동일 JSON 소스에서 파생된 데이터를 사용하고, 일반 플레이어 번들에서 분리되며, 기존 게임과 맵 생성 회귀 테스트를 모두 유지해야 한다.
