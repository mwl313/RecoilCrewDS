# Recoil Crew — Map Lab Design Document
## 브라우저 기반 절차적 맵 프로파일 편집·시각화·검증 도구

**프로젝트:** Recoil Crew DS  
**도구명:** Recoil Crew Map Lab  
**대상 브랜치:** `map-creation` 이후  
**기술 스택:** TypeScript, Vite, Three.js, Zod  
**목적:** 실제 게임과 동일한 맵 생성기와 검증기를 사용해 시드·프로파일·오브젝트 설정을 눈으로 조정하고, 검증된 설정을 실제 게임 콘텐츠로 반영한다.

---

# 1. 제품 정의

Map Lab은 고정 맵을 수동으로 제작하는 범용 씬 에디터가 아니다.

```text
맵 하나의 오브젝트를 직접 배치하는 도구  X
맵을 생성하는 규칙과 프로파일을 편집하는 도구  O
```

주요 용도:

- 동일한 시드 재현
- 랜덤 시드 탐색
- 지형 생성 파라미터 조정
- 경로와 의미론적 구역 확인
- 오브젝트 생성 규칙 조정
- 검증 실패 위치 확인
- 프로파일 비교
- 실제 게임용 JSON 출력
- 문제 시드 저장
- 추후 절벽·신규 피처·오브젝트·검증 규칙 확장

---

# 2. 현재 코드베이스와의 관계

현재 프로젝트에는 이미 다음 기반이 있다.

- 결정적 시드와 재시도
- `generateArenaWithRetry()`
- `buildArenaCandidate()`
- Heightfield와 매크로 피처
- 경로 그래프와 의미론적 구역
- 스폰·게이트·복구 지점
- 퍼니처·램프·착지 구역
- 검증 결과와 체크섬
- Three.js 지형 렌더링
- 개발용 `DebugOverlay`

Map Lab은 이 로직을 복제하지 않는다.

```text
공유 맵 생성기
├── 실제 게임
├── Map Lab
├── 시드 스윕 테스트
└── 회귀 테스트
```

## 2.1 기존 DebugOverlay 재사용

현재 `DebugOverlay`의 시각화 기능을 재사용 가능한 레이어 렌더러로 분리한다.

```text
src/client/map-debug/
├── heightLayer.ts
├── slopeLayer.ts
├── featureLayer.ts
├── routeLayer.ts
├── zoneLayer.ts
├── spawnLayer.ts
├── rampLayer.ts
├── recoveryLayer.ts
├── colliderLayer.ts
├── barrelLayer.ts
└── validationLayer.ts
```

사용처:

```text
게임 내 F3 DebugOverlay
Map Lab
```

---

# 3. 핵심 설계 원칙

## 3.1 실제 게임과 동일한 결과

같은 프로파일, 방 코드, 매치 인덱스, 생성기 버전을 사용하면 실제 게임과 같은 최종 맵이 생성되어야 한다.

## 3.2 콘텐츠 JSON을 단일 소스로 사용

```text
content/*.json
→ 검증
→ 서버
→ 자동 생성된 client-safe bundle
→ 클라이언트·Practice·Map Lab
```

수동으로 복사한 TypeScript 프로파일은 제거하거나 비활성화한다.

## 3.3 편집 중 데이터 분리

```text
Frozen source profile
→ deep-cloned Working Profile
→ 편집
→ 검증
→ Export
```

Map Lab은 가져온 원본 정의를 직접 변경하지 않는다.

## 3.4 파라미터 UI 자동 확장

필드별 UI를 컴포넌트에 직접 하드코딩하지 않는다. Descriptor Registry가 UI를 생성하고, 등록되지 않은 신규 필드는 Raw JSON 편집기에서 수정할 수 있어야 한다.

## 3.5 플레이어 번들과 분리

Map Lab은 별도 Vite 엔트리와 빌드 결과를 사용한다. Tweakpane과 Map Lab 코드는 일반 게임 번들에 포함하지 않는다.

## 3.6 안전한 적용

브라우저에서 저장소 파일을 직접 덮어쓰지 않는다. 프로파일 번들을 Export하고 별도 CLI가 검증 후 `content/`에 적용한다.

---

# 4. 범위

## 4.1 MVP

- 프로파일 선택
- Production/Exact Candidate 생성
- 방 코드·리매치 인덱스·시드 입력
- 다음 시드·랜덤 시드
- 3D 자유 카메라와 탑다운 카메라
- Basic/Advanced 파라미터 편집
- 레이어 토글
- 검증 결과와 오류 포커스
- 체크섬·생성 시간·오브젝트 수
- Undo/Redo와 Reset
- Source 대비 Diff
- 전체·카테고리·개별 오브젝트 토글
- Profile Bundle Export
- Generated Arena Export
- Validation Report Export
- Debounced 재생성
- localStorage/IndexedDB draft

## 4.2 후속 기능

- A/B 비교
- Seed Gallery
- Favorite/Bad Seeds
- 문제 시드 자동 추천
- Drive Test
- 오브젝트 썸네일
- 스크린샷 Export

## 4.3 초기 제외

- 지형 브러시 조각
- 수동 오브젝트 드래그 앤 드롭
- 범용 씬 에디터
- 게임 전체 멀티플레이 실행
- 브라우저 Git 커밋
- 생성 알고리즘 노드 그래프
- 모델 Import 파이프라인
- 동굴·브리지·스트리밍 편집

---

# 5. 사용자 흐름

## 5.1 프로파일 편집

```text
Map Lab 실행
→ 실제 프로파일 선택
→ 시드 생성
→ 3D/탑다운 확인
→ 파라미터 수정
→ 자동 또는 수동 재생성
→ 검증 확인
→ 여러 시드 확인
→ Profile Export
→ CLI로 콘텐츠 적용
→ 테스트
```

## 5.2 문제 후보 분석

```text
문제 시드 발견
→ Exact Candidate 모드
→ candidateSeed와 attempt 입력
→ 실패 후보 그대로 생성
→ 오류 레이어와 위치 확인
→ 파라미터 수정
→ 같은 후보로 재검증
```

---

# 6. 생성 모드

## 6.1 Production Mode

실제 게임 흐름을 재현한다.

입력:

```text
roomCode
matchIndex
mapProfileId
generatorVersion
workingBundle
fallbackBundle
```

흐름:

```text
baseSeed
→ attempt 0부터 생성·검증
→ 첫 성공 후보
→ 전부 실패하면 fallback
```

표시:

- Base seed
- Candidate seed
- Attempt
- Fallback 여부
- 최종 체크섬

## 6.2 Exact Candidate Mode

재시도 없이 특정 후보를 생성한다.

```text
baseSeed
candidateSeed
attempt
generatorVersion
mapProfileId
workingBundle
```

검증에 실패한 맵도 분석을 위해 렌더링할 수 있다.

---

# 7. 데이터 구조

## 7.1 Working Bundle

```ts
export interface MapLabWorkingBundle {
  map: MapDefinitionDef;
  terrainProfile: TerrainProfileDef;
  validationProfile: ValidationProfileDef;
  furnitureSet: FurnitureSetDef;
  densityProfile: DensityProfileDef;
  landmarks: LandmarkDef[];
}
```

## 7.2 Map Lab 상태

```ts
export interface MapLabState {
  mode: "production" | "exactCandidate";
  sourceProfileId: string;
  workingBundle: MapLabWorkingBundle;
  fallbackBundle: MapGenerationBundle;
  roomCode: string;
  matchIndex: number;
  generatorVersion: number;
  baseSeed?: number;
  candidateSeed?: number;
  attempt?: number;
  cameraMode: "orbit3d" | "topDown";
  autoRegenerate: boolean;
  layers: MapLabLayerState;
  selectedIssueId?: string;
  dirty: boolean;
}
```

## 7.3 생성 어댑터

```ts
export interface MapLabGenerateRequest {
  mode: "production" | "exactCandidate";
  roomCode: string;
  matchIndex: number;
  generatorVersion: number;
  workingBundle: MapGenerationBundle;
  fallbackBundle: MapGenerationBundle;
  exactCandidateSeed?: number;
  exactBaseSeed?: number;
  exactAttempt?: number;
}
```

UI는 이 어댑터만 호출한다.

---

# 8. 단일 소스 프로파일 파이프라인

```text
content/maps/*.json
content/terrain-profiles/*.json
content/validation-profiles/*.json
content/furniture-sets/*.json
content/density-profiles/*.json
content/landmarks/*.json
        ↓
scripts/generate-map-profile-bundle.ts
        ↓
src/generated/mapProfiles.generated.ts
```

## 8.1 명령

```bash
npm run generate:map-profiles
```

역할:

1. 실제 ContentLoader로 JSON 로드
2. Zod와 참조 검증
3. 맵별 완성된 `MapGenerationBundle` 생성
4. 안정적인 순서로 직렬화
5. 자동 생성 파일 작성
6. 클라이언트·Practice·Map Lab에서 사용

## 8.2 Parity 테스트

```text
서버가 JSON에서 resolve한 Bundle
===
생성된 client-safe Bundle
```

생성 파일이 오래된 경우 테스트가 실패해야 한다.

---

# 9. 파라미터 시스템

## 9.1 Descriptor

```ts
export interface ParameterDescriptor {
  path: string;
  label: string;
  group: string;
  type: "number" | "boolean" | "select" | "text" | "range" | "readonly";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  basic?: boolean;
  advanced?: boolean;
  requiresRegeneration: boolean;
  visibleWhen?: ParameterCondition;
}
```

## 9.2 Registry 구조

```text
tools/maplab/src/parameters/
├── mapParameters.ts
├── terrainParameters.ts
├── validationParameters.ts
├── routeParameters.ts
├── furnitureParameters.ts
├── densityParameters.ts
└── parameterRegistry.ts
```

## 9.3 Basic 패널

- 맵 크기
- 전체 높이 범위
- Terrain Drama
- 평지 비율
- 언덕·능선·고원 강도
- 최대 주행 경사
- 경로 폭
- 램프 수
- 오브젝트 밀도
- 배럴 수
- 오브젝트 전체 Enabled

`Terrain Drama` 같은 값은 여러 상세 파라미터를 함께 조정하는 매크로 컨트롤이 될 수 있다.

## 9.4 Advanced 패널

- 피처별 count
- radius/length/width
- height/depth
- falloff
- smoothing
- slope correction
- retry limit
- route clearance/slope
- 퍼니처 간격·구역·경사
- 오브젝트 예산
- 검증 허용치

## 9.5 Raw JSON

Descriptor가 없는 필드도 Working Bundle JSON으로 편집 가능해야 한다. 적용 전 실제 스키마 검증을 통과해야 한다.

---

# 10. 오브젝트 편집

## 10.1 전체 토글

```text
objectPlacement.enabled
```

false일 때도 지형·경로·구역·스폰·게이트·복구 지점은 생성한다.

## 10.2 카테고리 토글

```text
ramps
largeObstacle
barrel
crate
medium
decoration
lightPole
```

## 10.3 개별 Entry

```text
enabled
count
assetId
obstacleType
minSpacing
clearance
zoneTags
slopeMax
collider
```

## 10.4 함께 정리할 현 구조

- 같은 `kind`의 모든 Entry 처리
- 첫 Entry만 선택하는 경로 제거
- Crate가 생성→월드 변환→렌더링 사이에서 사라지지 않게 함
- Light Pole을 데이터화하거나 명시적인 토글 추가
- 요청·배치·렌더·충돌·거절 수를 Metrics에 표시

---

# 11. UI

```text
┌──────────────────────────────────────────────────────────────┐
│ Profile │ Mode │ Seed │ Regenerate │ Undo │ Redo │ Export    │
├────────────┬────────────────────────────────┬────────────────┤
│ Parameters │                                │ Validation     │
│ Basic      │         3D / Top Down          │ Metrics        │
│ Advanced   │                                │ Issues         │
│ Objects    │                                │ Performance    │
├────────────┴────────────────────────────────┴────────────────┤
│ Layers │ History │ JSON Diff │ Seed Gallery │ Logs           │
└──────────────────────────────────────────────────────────────┘
```

## 상단

- Profile
- Production/Exact
- Room Code
- Match Index
- Generator Version
- Seed
- Previous/Next/Random
- Regenerate
- Auto Regenerate
- Undo/Redo/Reset
- Export

## 왼쪽

```text
Basic
Terrain
Routes
Objects
Validation
Advanced JSON
```

## 중앙

```text
Orbit 3D
Top Down
```

## 오른쪽

- 전체 PASS/FAIL
- 카테고리별 상태
- Issues
- Metrics
- Performance
- Logs

---

# 12. 카메라

- OrbitControls 기반 자유 카메라
- Orthographic Top Down
- Fit Map
- 선택 Issue 포커스
- 모드 전환 시 중심점 유지

검증 오류를 클릭하면 관련 레이어를 켜고, 위치가 있으면 카메라를 이동시킨다.

---

# 13. 레이어

MVP 레이어:

```text
Terrain Mesh
Height Heatmap
Slope Heatmap
Macro Features
Route Nodes
Route Edges
Route Corridors
Semantic Zones
Player Spawns
Enemy Gates
Recovery Zones
Ramps
Flight Corridors
Landing Zones
Furniture
Authoritative Colliders
Decorations
Barrel Chains
Validation Errors
Validation Warnings
```

계약:

```ts
export interface MapLabLayerRenderer {
  id: string;
  label: string;
  defaultVisible: boolean;
  setArena(context: MapLabRenderContext): void;
  setVisible(visible: boolean): void;
  focus?(targetId: string): void;
  dispose(): void;
}
```

---

# 14. 검증 UX

```ts
export interface MapValidationIssue {
  id: string;
  code: string;
  message: string;
  severity: "error" | "warning";
  category: "terrain" | "routes" | "spawns" | "furniture" | "ramps" | "performance" | "determinism";
  position?: { x: number; y: number; z: number };
  entityId?: string;
  layerId?: string;
  parameterPaths?: string[];
}
```

표시 예:

```text
Terrain       PASS
Routes        PASS
Spawns        WARNING 1
Furniture     ERROR 2
Ramps         PASS
Performance   PASS
Determinism   PASS
```

Issue에 `parameterPaths`가 있으면 관련 컨트롤을 강조한다.

---

# 15. 재생성 정책

- 기본 300ms Debounce
- Auto Regenerate 토글
- Apply Changes 버튼
- 레이어 토글은 맵을 재생성하지 않음
- 새 요청이 생기면 이전 결과를 폐기
- 최신 Request ID 결과만 렌더링

---

# 16. Web Worker

```text
tools/maplab/src/worker/mapGeneration.worker.ts
```

Worker가 담당:

- 맵 생성
- 검증
- 직렬화
- Metrics

Three.js 객체는 메인 스레드에서 생성한다. Heightfield TypedArray는 Transferable을 사용한다.

---

# 17. History와 Draft

- Undo
- Redo
- Reset Section
- Reset Profile
- Source 대비 변경값
- JSON Diff
- localStorage/IndexedDB 자동 저장
- 소스 프로파일 fingerprint가 달라졌으면 복구 경고

---

# 18. Export와 실제 적용

## 18.1 Profile Bundle Export

실제 게임 설정용.

포함:

- Map Definition
- Terrain Profile
- Validation Profile
- Furniture Set
- Density Profile
- Landmark Definitions
- Format Version
- Source Profile ID

## 18.2 Generated Arena Export

특정 시드 디버깅용.

- Seeds
- Attempt
- Generator Version
- Checksum
- Heightfield
- Features
- Routes
- Zones
- Objects
- Spawns/Gates
- Validation

## 18.3 Apply CLI

```bash
npm run maplab:apply -- ./downloads/profile-bundle.json
```

처리:

1. Export 형식 검증
2. 실제 스키마·참조 검증
3. ID 충돌 확인
4. `--overwrite` 없이 덮어쓰기 금지
5. `content/` 파일 생성/교체
6. Manifest 갱신
7. client-safe bundle 재생성
8. 관련 테스트 안내 또는 실행
9. 변경 파일 출력

자동 Git 커밋은 하지 않는다.

---

# 19. 후속 Seed Gallery

```text
9 / 16 / 25개 시드 생성
→ 탑다운 썸네일
→ Validation과 Metrics
→ 클릭 시 상세 열기
```

필터:

- Retry 발생
- Fallback
- 최대 높이/경사
- 오브젝트 수
- 램프 수
- Warning/Error

---

# 20. 후속 Drive Test

실제 공유 Tank Kinematics와 Arena Queries 사용.

- WASD
- Space Jump
- Shift Dash
- Cannon/JACKPOT Recoil Test
- Gravity Profile
- Spawn/Recovery Teleport

멀티플레이와 AI는 실행하지 않는다.

---

# 21. 디렉터리 구조

```text
tools/maplab/
├── index.html
├── vite.config.ts
└── src/
    ├── main.ts
    ├── mapLabApp.ts
    ├── mapLabState.ts
    ├── generatorAdapter.ts
    ├── worker/mapGeneration.worker.ts
    ├── parameters/
    ├── rendering/
    ├── panels/
    ├── history/
    └── io/

src/client/map-debug/
├── layerTypes.ts
├── layerManager.ts
└── layers/

src/generated/
└── mapProfiles.generated.ts

scripts/
├── generate-map-profile-bundle.ts
└── apply-maplab-profile.ts
```

---

# 22. 명령

```json
{
  "scripts": {
    "generate:map-profiles": "tsx scripts/generate-map-profile-bundle.ts",
    "dev:maplab": "vite --config tools/maplab/vite.config.ts",
    "build:maplab": "npm run generate:map-profiles && vite build --config tools/maplab/vite.config.ts",
    "test:maplab": "vitest run tests/maplab",
    "maplab:apply": "tsx scripts/apply-maplab-profile.ts"
  }
}
```

Tweakpane은 컨트롤 렌더러일 뿐이며, 상태 원본은 `MapLabState`와 Working Bundle이다.

---

# 23. 성능 목표

- 단일 생성 중 UI가 장시간 멈추지 않음
- 20회 연속 재생성 후 Scene 객체 수 안정
- 10회 프로파일 전환 후 리소스 누수 없음
- 오래된 Worker 결과가 최신 결과를 덮어쓰지 않음
- 레이어 Visibility 변경은 재생성을 일으키지 않음
- Map Lab/Tweakpane이 일반 게임 번들에 없음

표시 Metrics:

- Generator ms
- Validation ms
- Serialization ms
- Render-build ms
- Terrain chunks
- Objects/Colliders
- Scene objects
- Draw calls

---

# 24. 테스트

## 단일 소스

- Generated bundle과 server-resolved JSON bundle 일치
- 생성 파일 stale 감지
- 수동 프로파일 미러 비활성화

## Generator Adapter

- Production 결과가 실제 게임 세션 결과와 일치
- Exact Candidate 재현
- Working Bundle이 원본을 변경하지 않음

## 파라미터

- Descriptor path read/write
- Raw JSON
- Invalid value
- Undo/Redo/Reset
- Object toggles

## 레이어

- Create/Toggle/Rebuild/Focus/Dispose
- 게임 F3 DebugOverlay 회귀

## Export/Apply

- Profile round-trip
- Arena checksum round-trip
- Invalid bundle rejection
- Conflict/overwrite 보호
- Manifest 갱신
- Bundle parity

## E2E

1. Map Lab 열기
2. Primary 프로파일 로드
3. Production 맵 생성
4. 언덕 높이 변경
5. 재생성 확인
6. Top Down 전환
7. Route 레이어 토글
8. 모든 오브젝트 비활성화
9. 경로는 유지되고 오브젝트 수만 감소하는지 확인
10. Issue 선택
11. Profile Export
12. 새로고침 후 Draft 복원

## 게임 회귀

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

---

# 25. 구현 단계

## Phase 0 — 선행 정리

- 수동 클라이언트 프로파일 미러 제거
- JSON → generated bundle
- DebugOverlay 레이어 분리
- 퍼니처 Entry 처리 정리
- 오브젝트 Enabled 계약

## Phase 1 — MVP

- 별도 Vite 엔트리
- 실제 생성 어댑터
- Worker
- 3D/Top Down
- Seed Controls
- Basic/Advanced Parameters
- Layers
- Validation
- Undo/Redo
- Export
- Local Draft

## Phase 2 — 분석 기능

- Seed Gallery
- A/B
- Favorite/Bad Seeds
- 문제 시드 필터
- Metrics 비교

## Phase 3 — 플레이 검증

- Drive Test
- 이동·점프·대시·반동 테스트
- Authoring Guide

---

# 26. 완료 기준

- 실제 게임과 같은 프로파일과 생성기를 사용한다.
- 같은 Production 입력은 게임과 같은 체크섬을 만든다.
- Exact Candidate로 실패 후보를 재현한다.
- 원본을 변경하지 않고 Working Bundle을 편집한다.
- 새 파라미터가 Descriptor 또는 Raw JSON으로 확장 가능하다.
- 모든 주요 생성 레이어를 토글한다.
- 검증 오류를 클릭해 위치를 확인한다.
- 전체·카테고리·개별 오브젝트를 조절한다.
- Profile Bundle을 Export하고 CLI로 실제 콘텐츠에 적용한다.
- JSON과 클라이언트 데이터가 단일 소스다.
- Map Lab이 일반 게임 번들에 포함되지 않는다.
- 반복 재생성에서 메모리 누수가 없다.
- 기존 온라인 게임·Practice·맵 생성 테스트가 유지된다.

---

# 27. 최종 구조

```text
실제 Content JSON
→ 자동 생성된 client-safe bundle
→ Working Profile
→ 파라미터 편집
→ 실제 생성기/검증기
→ 3D·탑다운·레이어 시각화
→ 검증·Metrics
→ Profile Export
→ Apply CLI
→ 실제 게임 콘텐츠
```

Map Lab의 핵심은 단순히 맵을 보는 것이 아니다.

> 생성 규칙을 빠르게 실험하고, 여러 시드에서 검증하고, 안전하게 실제 게임 설정으로 승격시키는 제작 파이프라인을 제공하는 것이 핵심이다.
