# Recoil Crew — 맵 생성 구현용 Codex 실행 가이드

## 목적

`01-맵-디자인(1).md`의 기준 스펙을 현재 Recoil Crew 코드베이스에 안전하게 구현한다.

이 작업은 다음 이유로 한 번에 처리하지 않는다.

- 서버와 클라이언트가 동일한 맵을 생성해야 한다.
- 기존 `arena.ts` 쿼리 인터페이스를 보존해야 한다.
- 지형, 경로, 배치, 렌더링, 체크섬, 검증, 테스트가 서로 연결되어 있다.
- 현재 온라인 게임, Practice, 예측, 충돌, 적 생성이 계속 동작해야 한다.
- 잘못된 맵이 생성되더라도 게임은 폴백 맵으로 반드시 시작해야 한다.

따라서 네 단계로 나눈다.

```text
Phase 1
시드 + PRNG + heightfield + 매크로 피처 + 기본 검증 + 폴백

Phase 2
경로 그래프 + 의미론적 구역 + 스폰/게이트 + 퍼니처 + 램프 안전성

Phase 3
서버/클라이언트 동기화 + 체크섬 + 지형 렌더링 + LOD/컬링 + 디버그 오버레이

Phase 4
시드 스윕 + 성능 검증 + 회귀 테스트 + 프로파일 확장 + 최종 정리
```

## 사용 순서

1. 기준 스펙을 `docs/design/01-맵-디자인.md`로 저장한다.
2. 이 가이드와 모든 Phase 프롬프트를 `docs/map-generation/`에 저장한다.
3. 현재 저장소가 정상인지 확인한다.

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
```

4. Phase 1부터 순서대로 실행한다.
5. 각 Phase를 별도 커밋으로 저장한다.
6. 해당 Phase 테스트가 통과하기 전에는 다음 단계로 넘어가지 않는다.
7. Master 프롬프트는 전체 감리 또는 중단된 작업 재개에 사용한다.

## 절대 조건

- 게임을 처음부터 다시 만들지 않는다.
- Three.js, TypeScript, Node.js, WebSocket 구조를 교체하지 않는다.
- P2P나 WebRTC를 추가하지 않는다.
- 몬스터 패스파인딩을 새로 구현하지 않는다.
- Loot Truck과 `truckRoute`를 추가하지 않는다.
- 동굴, 브리지, 파괴 가능한 지형을 추가하지 않는다.
- 기존 고정 맵을 폴백과 회귀 기준으로 유지한다.
- `Math.random()`을 생성 코드에서 사용하지 않는다.
- 서버와 클라이언트가 다른 지형을 사용하는 상태로 경기를 시작하지 않는다.
- 기존 `groundHeightAt`, `obstacleAt`, `resolveCircle` 계열 호출부를 불필요하게 전면 수정하지 않는다.
- 생성 실패가 게임 시작 실패로 이어지지 않게 한다.

## 공통 검증 명령

각 Phase 종료 시:

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
```

추가 스크립트가 생성되면 함께 실행한다.

```bash
npm run test:maps
npm run test:maps:sweep
```

## 최종 결과물

- 400×400 맵 생성
- 같은 시드와 버전은 같은 맵
- 리매치는 다른 맵
- heightfield 기반 언덕/계곡/능선/고원/분지
- 주요 지역이 연결된 순환 경로
- 스폰과 호드 게이트의 안전한 배치
- 경로를 막지 않는 장애물과 배럴
- 점프/대시/반동 이동을 고려한 램프와 착지 공간
- 검증 실패 시 결정적 재시도
- 8회 실패 시 고정 폴백 맵
- 서버와 클라이언트 체크섬 일치
- 프로파일 JSON으로 맵 종류 확장
- 10,000개 시드 스윕
- 생성 시간과 오브젝트 예산 검증
