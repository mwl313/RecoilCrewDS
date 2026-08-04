# Recoil Crew — Power-Up, Level-Up, and Relic Progression System Design
## Core Loop과 결합되는 데이터 기반 성장 시스템

**권장 저장 경로:** `docs/progression08/POWERUP_AND_RELIC_PROGRESSION_SYSTEM_DESIGN.md`  
**상태:** 구현 설계안  
**기준 문서:**  
- `03-업그레이드-시스템.md`
- `05-유물-테이블.md`
- Coreloop 06의 StageDirector / WaveController / 보상 이벤트 계약
- Combat 05의 Dash-only 기본 접촉 전투 규칙

---

# 0. 문서 목적

본 문서는 Recoil Crew의 코어 루프와 직접 결합되는 성장 시스템을 구현하기 위한 기술·게임플레이 통합 설계다.

성장 시스템은 두 개의 독립된 레이어로 구성된다.

```text
몬스터 처치
→ XP 조각 드랍
→ 탱크가 XP 조각 회수
→ 팀 경험치 증가
→ 레벨업
→ 레벨업 룰렛
→ 순수 스탯 강화

보물상자 획득
→ 유물 룰렛
→ 조건부 효과·트리거·능력 해금
→ 새로운 빌드 동작 활성화
```

두 레이어의 목적은 명확히 다르다.

```text
레벨업 업그레이드
→ 이동, 공격, 체력 등 기본 성능의 직접 성장

유물
→ 조건부 효과, 전투 규칙 변화, 새로운 능력, 특수 시너지
```

일부 유물은 레벨업과 동일한 스탯을 강화할 수 있다. 이는 의도된 중복이며, 두 시스템의 결과를 서로 곱해 강한 시너지를 만든다.

---

# 1. 확정된 핵심 규칙

## 1.1 ROADKILL

기본 Combat 05 규칙:

```text
일반 접촉
→ 대미지 없음

고속 일반 접촉
→ 대미지 없음

Dash 대미지 윈도우 중 접촉
→ Dash 접촉 대미지
```

`relic.roadkill` 획득 후:

```text
Dash가 아닌 상태
+ ROADKILL 보유
+ 설정된 고속 주행 조건 충족
+ 적과 접촉
→ 속도 비례 접촉 대미지
```

ROADKILL은 예전 래밍 시스템을 기본 기능으로 복구하지 않는다.

ROADKILL은 다음 capability를 해금하는 유물로 구현한다.

```text
tank.roadkillContact
```

접촉 판정 우선순위:

```text
1. Dash damage window가 활성화되어 있으면
   → 기존 Dash 접촉 공격만 적용

2. Dash가 아니며 ROADKILL capability가 있고 속도 조건을 만족하면
   → Roadkill 접촉 공격 적용

3. 그 외
   → 접촉 대미지 0
```

한 번의 접촉에 Dash와 ROADKILL 대미지가 동시에 중복 적용되지 않는다.

---

## 1.2 첫 보물상자

최신 확정 규칙:

```text
해당 매치에서 처음 여는 보물상자
Epic       70%
Legendary  30%
```

두 번째 보물상자부터:

```text
Common     55%
Rare       30%
Epic       13%
Legendary   2%
```

첫 보물상자는 획득 경로와 관계없이 적용한다.

```text
맵에 배치된 상자
적 처치 드랍 상자
웨이브 리더 확정 상자
```

이 중 가장 먼저 열린 상자가 첫 보물상자다.

권장 런타임 상태:

```ts
treasureChestsOpened: number;
```

```text
treasureChestsOpened === 0
→ firstChest rarity table

treasureChestsOpened > 0
→ normal rarity table
```

유물 문서에 남은 “첫 웨이브 Rare 확정” 규칙은 폐기된 구버전으로 취급한다.

웨이브 리더 처치 규칙은 다음만 유지한다.

```text
웨이브 리더 처치
→ 보물상자 확정 드랍
```

그 상자가 해당 매치의 첫 상자라면 Epic/Legendary 첫 상자 룰을 사용한다.

---

## 1.3 레벨업과 유물의 중복 스탯

동일 스탯을 레벨업과 유물이 동시에 강화하는 것을 허용한다.

각 성장 시스템 내부의 스택 규칙을 유지한 뒤, 시스템 레이어끼리 곱한다.

```text
레벨업 업그레이드 내부
→ 카드마다 multiply 누적

유물 내부
→ 문서에 정의된 additive % 또는 flat 정수 누적

레벨업 레이어 × 유물 레이어
→ 곱연산
```

권장 최종 계산 구조:

```text
최종 스탯
= (기본값 + 일반 flat 보정 + 유물 flat 보정)
× 레벨업 업그레이드 배율
× 유물 퍼센트 배율
× 조건부 배율
```

개념식:

```ts
finalValue =
  (baseValue + baseFlatAdd + relicFlatAdd)
  * levelUpgradeMultiplier
  * (1 + relicPercentBonus)
  * conditionalMultiplier;
```

최종적으로 스탯 정의의 최소·최대 클램프를 적용한다.

### 예시 A — HE PAYLOAD와 대포 스플래시 업그레이드

```text
기본 폭발 반경 = 6

레벨업:
+20%
+30%
→ levelUpgradeMultiplier = 1.20 × 1.30 = 1.56

HE PAYLOAD 2개:
+30% +30%
→ relicPercentBonus = 0.60
→ relicMultiplier = 1.60

최종:
6 × 1.56 × 1.60
= 14.976
```

### 예시 B — HEARTY TANK와 장갑 업그레이드

```text
기본 최대 내구도 = 100

HEARTY TANK 2개:
+20 +20
→ relicFlatAdd = 40

레벨업 장갑:
+20%
→ levelUpgradeMultiplier = 1.20

최종:
(100 + 40) × 1.20
= 168
```

---

## 1.4 레벨링 속도

다음 값은 현재 임시 데이터다.

```text
잡졸 XP
웨이브 잡졸 XP
엘리트 XP
보스 XP
레벨별 요구 XP
싱글플레이 XP 보정
목표 레벨업 횟수
```

몬스터 디자인과 실제 처치 밀도가 확정된 후 밸런싱한다.

따라서 이번 구현의 목표는:

```text
레벨링 속도를 확정하는 것
→ 아님

레벨링 속도를 콘텐츠 데이터로 쉽게 변경할 수 있게 만드는 것
→ 맞음
```

현재 문서의 XP 값과 레벨 곡선은 초기 테스트용 프리셋으로만 유지한다.

---

# 2. 전체 플레이 루프

## 2.1 Farming Phase

```text
앰비언트 몬스터 지속 스폰
→ 몬스터 처치
→ XP 조각 생성
→ 탱크가 XP 조각 회수
→ 팀 경험치 증가
→ 레벨업 임계치 도달
→ Match Flow 일시정지
→ 레벨업 룰렛
→ 선택 완료
→ 게임 재개
```

## 2.2 Elite Wave

```text
웨이브 시작
→ farming countdown 정지
→ 기존 앰비언트 몬스터 유지
→ 엘리트와 웨이브 코호트 등장
→ 엘리트 처치
→ 웨이브 코호트 퍼지
→ 퍼지 대상은 XP·드랍·킬 트리거 없음
→ 엘리트 보상 처리
→ 보물상자 확정 드랍
→ farming countdown 재개
```

## 2.3 Boss Wave

```text
보스 웨이브 시작
→ 보스 및 보스 코호트 전투
→ 보스 처치
→ stage clear
→ 보스 보상·결과 통계 처리
```

보스 처치 후 추가 성장 선택을 제공할지는 별도 설계 대상이다. 현재 문서는 스테이지 클리어를 우선한다.

---

# 3. 시스템 경계

성장 시스템을 하나의 거대한 클래스에 넣지 않는다.

권장 모듈:

```text
src/shared/progression/
├── progressionTypes.ts
├── teamExperienceSystem.ts
├── levelCurve.ts
├── levelUpController.ts
├── upgradeOfferGenerator.ts
├── upgradeSelectionController.ts
├── upgradeEffectApplier.ts
├── treasureChestSystem.ts
├── relicOfferGenerator.ts
├── relicInventory.ts
├── relicEffectRegistry.ts
├── rewardSelectionController.ts
├── progressionRng.ts
└── progressionTelemetry.ts

src/shared/pickups/
├── xpShardSystem.ts
├── pickupMagnetSystem.ts
└── pickupTypes.ts

src/shared/stats/
├── statLayerResolver.ts
└── existing StatResolver integration

src/shared/combat/
├── existing TankContactCombat
└── roadkillContactRule.ts

src/client/progression/
├── rewardSelectionPresenter.ts
├── levelUpRouletteView.ts
├── relicRouletteView.ts
├── progressionHudBinding.ts
└── progressionAudioVfx.ts
```

경로는 실제 저장소 규칙에 맞게 조정할 수 있다.

---

# 4. Match Flow 상태

StageDirector의 phase와 별도로, 전체 시뮬레이션이 진행 가능한지를 관리하는 상위 흐름 상태가 필요하다.

```ts
type MatchFlowState =
  | "playing"
  | "upgradeSelection"
  | "relicSelection"
  | "clear"
  | "gameOver";
```

StageDirector:

```text
farming1
wave1
farming2
wave2
farming3
bossWave
clear
gameOver
```

Match Flow:

```text
현재 시뮬레이션이 실제로 진행되는가
선택 화면 때문에 정지되어 있는가
```

두 상태를 분리한다.

예:

```text
StagePhase = farming2
MatchFlowState = upgradeSelection
```

이때 farming2는 유지되지만 시뮬레이션은 일시정지한다.

---

# 5. 권위형 일시정지

## 5.1 정지해야 하는 시스템

`upgradeSelection` 또는 `relicSelection` 중:

```text
StageDirector countdown
HordeDirector spawning
Wave reinforcement
Enemy simulation
Enemy attacks
Projectiles
Tank physics
Contact damage
Pickup movement
Pickup collection
Gameplay timers
TriggeredEffect gameplay timers
```

## 5.2 계속 진행해야 하는 시스템

```text
네트워크 연결
ping/heartbeat
선택 메시지 처리
10초 선택 타임아웃
READY 상태
룰렛 연출
UI 애니메이션
오디오
재접속 처리
```

게임플레이 시뮬레이션의 `dt`는 0으로 처리하거나 authoritative step을 건너뛴다.

선택 타임아웃은 게임플레이 시간이 아니라 wall-clock 또는 별도 네트워크 선택 타이머를 사용한다.

---

# 6. Team Experience

탱크가 한 대이므로 경험치는 팀 공유다.

```ts
interface TeamProgressionState {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  totalXpCollected: number;
  pendingLevelUps: number;
}
```

## 6.1 다중 레벨업

한 번에 큰 XP를 획득하여 여러 임계치를 넘을 수 있다.

```text
XP 획득
→ 레벨 임계치 반복 검사
→ pendingLevelUps 증가
```

선택 화면 중 추가 XP는 발생하지 않는다. 시뮬레이션이 멈추기 때문이다.

여러 레벨업이 대기 중이면:

```text
첫 업그레이드 선택 완료
→ pendingLevelUps가 남아 있으면 다음 룰렛 시작
→ 모두 소진 후 플레이 재개
```

## 6.2 레벨 곡선

데이터 기반:

```ts
interface LevelCurveDefinition {
  id: string;
  thresholds: number[];
  overflowRule: "repeatLastDelta" | "formula" | "cap";
  maximumLevel?: number;
}
```

초기 테스트 데이터:

```json
{
  "id": "levelCurve.mainStagePrototype",
  "thresholds": [20, 45, 75, 110, 150, 195, 245, 300],
  "overflowRule": "repeatLastDelta"
}
```

이 값은 최종 밸런스가 아니다.

---

# 7. XP 조각 시스템

## 7.1 생성

정상적인 적 처치만 XP 조각을 생성한다.

```text
일반 몬스터 정상 처치
→ XP 조각 생성

웨이브 일반 몬스터 정상 처치
→ XP 조각 생성

엘리트 정상 처치
→ 엘리트 XP 또는 집중 XP 보상

보스 정상 처치
→ 보스 XP/통계

WaveController purge
→ XP 조각 생성 없음
```

권장 보상 이벤트 계약:

```ts
type RewardSourceEvent =
  | EnemyKilledRewardEvent
  | EliteLeaderKilledRewardEvent
  | BossKilledRewardEvent
  | EnemyPurgedEvent;
```

`EnemyPurgedEvent`는 시각 효과에는 사용 가능하지만 ProgressionSystem이 보상으로 소비하지 않는다.

## 7.2 픽업 상태

```ts
interface XpShardState {
  id: number;
  value: number;

  x: number;
  y: number;
  z: number;

  vx: number;
  vy: number;
  vz: number;

  age: number;
  collected: boolean;
}
```

## 7.3 자석 반경

기본 스탯:

```text
progression.magnetRadius
```

유물 `MAGNET CORE`:

```text
자석 반경 +50%
동일 유물 중복 시 additive
```

예:

```text
기본 자석 반경 = 5m
MAGNET CORE 2개 = +100%
최종 = 10m
```

## 7.4 근접 가속

조각이 탱크에 가까울수록 흡인 속도가 증가한다.

권장 개념:

```text
자석 경계 근처
→ 느린 이동

탱크 근처
→ 빠른 이동
```

데이터:

```ts
interface XpMagnetDefinition {
  baseRadius: number;
  minimumPullSpeed: number;
  maximumPullSpeed: number;
  accelerationExponent: number;
  collectRadius: number;
}
```

---

# 8. 레벨업 룰렛

## 8.1 레어도

각 카드 독립 시행:

```text
Common     50%
Rare       30%
Epic       15%
Legendary   5%
```

같은 레어도가 여러 장 등장할 수 있다.

## 8.2 첫 레벨업

첫 레벨업:

```text
카드 1
→ Epic 확정

카드 2
→ 일반 확률

카드 3
→ 50% Legendary
→ 나머지 50%는 일반 확률
```

첫 레벨업 이후:

```text
세 카드 모두 일반 확률
```

런타임 상태:

```ts
levelUpOffersCompleted: number;
```

## 8.3 역할별 카드 풀

멀티플레이:

```text
Driver
→ tank/driver 카드만

Gunner
→ gunner 카드만
```

한 번의 팀 레벨업에서 두 명이 각각 하나를 선택한다.

싱글플레이:

```text
통합 카드 풀
→ Driver + Gunner 카드 모두 포함
→ 한 번의 레벨업에서 하나 선택
```

싱글플레이의 XP 속도 보정은 데이터로 두며 최종 값은 몬스터 설계 후 조정한다.

## 8.4 결정론

서버 또는 Single Player 로컬 authority가 선택 화면이 열릴 때 결과를 미리 생성한다.

```text
authority RNG
→ 카드 세 장 생성
→ offer ID와 카드 결과 저장
→ 클라이언트로 전송
→ 클라이언트 룰렛은 결과를 보여주는 연출
```

클라이언트가 레어도나 수치를 새로 뽑으면 안 된다.

## 8.5 선택 상태

```ts
interface UpgradeSelectionState {
  offerId: string;
  level: number;

  driverOffer?: UpgradeCard[];
  gunnerOffer?: UpgradeCard[];
  singlePlayerOffer?: UpgradeCard[];

  driverSelection?: number;
  gunnerSelection?: number;
  singlePlayerSelection?: number;

  expiresAt: number;
}
```

멀티플레이 재개 조건:

```text
Driver 선택 완료
AND
Gunner 선택 완료
→ 효과 적용
→ MatchFlowState = playing
```

10초 타임아웃:

```text
미선택 역할
→ authority RNG로 카드 1장 자동 선택
```

---

# 9. 업그레이드 콘텐츠

## 9.1 정의

```ts
interface UpgradeCategoryDefinition {
  id: string;
  label: string;
  role: "driver" | "gunner";
  iconId: string;
  tags: string[];

  effects: UpgradeStatEffectDefinition[];
  rarityRanges: Record<UpgradeRarity, {
    minPercent?: number;
    maxPercent?: number;
    minFlat?: number;
    maxFlat?: number;
  }>;
}
```

```ts
interface UpgradeCard {
  cardId: string;
  categoryId: string;
  rarity: UpgradeRarity;
  rolledEffects: RolledUpgradeEffect[];
}
```

레어도별 수치는 정수 범위에서 authority RNG로 결정한다.

## 9.2 적용

레벨업 카드는 고유 modifier instance를 생성한다.

```ts
interface LevelUpgradeModifier {
  sourceId: string;
  categoryId: string;
  statId: string;
  operation: "multiply";
  factor: number;
}
```

예:

```text
+15%
→ factor = 1.15
```

같은 카테고리를 다시 획득하면 각각 별도의 multiply modifier로 유지한다.

```text
1.15 × 1.15
```

---

# 10. 보물상자

## 10.1 획득 경로

```text
맵 랜덤 배치
적 정상 처치 시 확률 드랍
웨이브 리더 처치 시 확정 드랍
```

퍼지된 적은 상자를 드랍하지 않는다.

## 10.2 상태

```ts
interface TreasureChestState {
  id: number;
  source: "map" | "enemyDrop" | "waveClear";
  x: number;
  y: number;
  z: number;
  opened: boolean;
}
```

## 10.3 오픈 권위

탱크가 상자를 열면 authority가:

```text
첫 상자인지 확인
→ 레어도 결정
→ 유물 후보 또는 유물 결과 생성
→ MatchFlowState = relicSelection
```

유물 룰렛이 한 개의 결과만 표시할지, 여러 유물 중 선택하게 할지는 원본 문서의 “유물 룰렛 1회 → 유물 1개”를 따른다.

따라서 현재 구현은:

```text
상자 1개
→ 유물 1개 결정
→ 카지노 룰렛 연출
→ 결과 확정
```

카드 3선택 형태로 확장하고 싶다면 별도 콘텐츠 설정으로 추가 가능하게 설계한다.

---

# 11. 유물 정의

```ts
interface RelicDefinition {
  id: string;
  label: string;
  rarity: RelicRarity;
  role: "driver" | "gunner" | "crew";

  iconId: string;
  description: string;
  tags: string[];

  stackPolicy:
    | "addPercent"
    | "addFlat"
    | "grantCapabilityAndAddPercent"
    | "unique";

  capabilityId?: string;

  effects: RelicEffectDefinition[];

  duplicateReplacement?: {
    type: "xp";
    amount: number;
  };
}
```

유물은 28종 콘텐츠 테이블로 유지한다.

---

# 12. 유물 스택 규칙

## 12.1 Additive Percent

```text
MAGNET CORE 2개
→ +50% +50%
→ relicPercentBonus = +100%
```

## 12.2 Additive Flat

```text
HEARTY TANK 2개
→ +20 +20
→ relicFlatAdd = +40
```

## 12.3 Capability + Numeric Stack

예:

```text
UNSTOPPABLE 첫 획득
→ dash cooldown zero capability 해금
→ dash damage +50%

두 번째 획득
→ capability는 이미 보유
→ dash damage +50% 추가
```

## 12.4 Unique

```text
PHASE DASH
PHOENIX CORE
TWIN SHELL
```

재등장 시:

```text
+250 XP
```

중복 불가 유물은 이미 보유한 경우 유물 인벤토리에 추가하지 않는다.

---

# 13. Relic Inventory

```ts
interface RelicInventoryState {
  stacks: Record<string, number>;
  capabilities: string[];
}
```

권장 런타임 API:

```ts
getStack(relicId: string): number;
has(relicId: string): boolean;
add(relicId: string): RelicAcquireResult;
removeSource?(sourceId: string): void;
```

현재 유물은 매치 내 영구 지속을 전제로 한다.

---

# 14. Triggered Effect Registry

유물 효과를 하나의 거대한 switch에 넣지 않는다.

```text
passive
onCannonFire
onHit
onKill
onDash
onDashHit
onLand
onAir
onWaveClear
onWipeout
```

권장 인터페이스:

```ts
interface RelicTriggeredEffectHandler<TEvent> {
  trigger: RelicTrigger;
  handle(
    event: TEvent,
    context: RelicEffectContext,
    relic: RelicDefinition,
    stackCount: number
  ): void;
}
```

Registry:

```ts
register(effectType: string, handler: RelicTriggeredEffectHandler<any>): void;
resolve(effectType: string): RelicTriggeredEffectHandler<any>;
```

새 유물을 추가할 때 기존 handler 조합으로 표현할 수 있어야 한다.

새로운 동작이 필요한 경우에만 새 handler를 추가한다.

---

# 15. ROADKILL 상세 구현

## 15.1 Capability

```text
tank.roadkillContact
```

`relic.roadkill` 첫 획득 시 capability를 부여한다.

## 15.2 속도 조건

문서의 “최고속도 이상”은 실제 속도가 stat upgrade로 변할 수 있으므로 하드코딩된 절대 숫자 대신 현재 해석된 최고속도에 대한 비율로 정의한다.

```ts
interface RoadkillEffectDefinition {
  minimumSpeedRatio: number;
  baseDamageCoefficient: number;
  coefficientPerAdditionalStack: number;
  perTargetCooldownSeconds: number;
  knockbackCoefficient: number;
}
```

예:

```text
currentSpeed >= resolvedForwardSpeed × minimumSpeedRatio
```

`minimumSpeedRatio`의 실제 값은 플레이테스트 데이터다.

## 15.3 대미지

개념식:

```text
speedRatio = currentSpeed / resolvedForwardSpeed

damage
= baseRoadkillDamage
× speedRatio
× relicStackMultiplier
```

스택 규칙:

```text
첫 ROADKILL
→ capability 활성화
→ 기본 계수

추가 ROADKILL
→ 대미지 계수 +25%씩 additive
```

## 15.4 접촉 서비스

기존 `TankContactCombat` 또는 통합 접촉 서비스에서 판정한다.

권장 구조:

```text
TankContactCombat
├── DashContactRule
├── RoadkillContactRule
└── NoDamageFallback
```

Dash가 우선이다.

ROADKILL은 Dash 이벤트, Dash kill, Dash refund를 발생시키지 않는다.

권장 별도 대미지 source:

```text
roadkill
```

단, 기존 DamageSource 확장이 부담스럽다면 `contact`와 effect metadata로 구분할 수 있다. 구현 시 통계·유물 트리거 구분 가능성을 우선한다.

---

# 16. 레벨업과 유물 Stat Layer

기존 StatResolver를 확장하거나 그 위에 레이어 어댑터를 둔다.

권장 레이어:

```ts
type StatModifierLayer =
  | "baseFlat"
  | "relicFlat"
  | "levelUpgradeMultiply"
  | "relicPercent"
  | "conditionalMultiply"
  | "finalClamp";
```

처리 순서:

```text
1. base
2. baseFlat + relicFlat
3. levelUpgradeMultiply의 모든 factor 곱
4. relicPercent의 additive 합을 하나의 multiplier로 변환
5. conditionalMultiply
6. min/max clamp
```

감소 효과:

```text
-30%
→ relicPercentBonus = -0.30
```

클램프:

```text
쿨다운 감소, 자해 감소 등
→ 콘텐츠에 정의된 최소값에서 clamp
```

0 이하의 쿨다운은 capability가 명시적으로 허용한 경우에만 가능하다.

예:

```text
UNSTOPPABLE
→ dash cooldown zero capability
```

---

# 17. Single Player와 Multiplayer

## 17.1 동일한 게임플레이 정의

두 모드는 동일한 다음 콘텐츠를 사용한다.

```text
XP 값
레벨 곡선
업그레이드 카테고리
레어도
수치 범위
유물 테이블
유물 확률
첫 경험 하드코딩
스택 규칙
```

## 17.2 다른 실행 방식

멀티플레이:

```text
Driver와 Gunner 각각 역할별 룰렛
두 명 모두 완료 후 재개
```

싱글플레이:

```text
통합 풀 룰렛 1개
한 명 선택 후 재개
XP 획득 보정 가능
```

싱글 XP 보정 값은 데이터로 유지하며 최종 값은 몬스터 디자인 후 결정한다.

---

# 18. 결정론적 RNG

성장 시스템 전용 RNG 스트림을 사용한다.

```text
spawn RNG와 분리
map RNG와 분리
combat spread RNG와 분리
```

권장 스트림:

```text
progression.upgradeOffer
progression.upgradeValue
progression.relicRarity
progression.relicSelection
progression.timeoutAutopick
progression.enemyChestDrop
```

동일 seed와 동일 이벤트 순서에서 동일 결과가 나와야 한다.

클라이언트는 결과를 생성하지 않는다.

---

# 19. 네트워크 메시지

권장 논리 메시지:

```text
progressionState
upgradeOfferStarted
upgradeSelectionSubmitted
upgradePlayerReady
upgradeOfferResolved

relicOfferStarted
relicOfferResolved

xpCollected
levelGained
relicAcquired
capabilityChanged
```

업그레이드 카드의 실제 결과는 authority가 전송한다.

클라이언트 요청:

```ts
{
  type: "selectUpgrade";
  offerId: string;
  cardIndex: number;
}
```

검증:

```text
offerId 일치
현재 역할의 offer 존재
cardIndex 유효
아직 선택하지 않음
선택 시간 내 또는 authority가 허용
```

재연결 시 현재 선택 상태를 복원한다.

---

# 20. UI와 연출

## 20.1 레벨업 룰렛

```text
화면 중앙 오버레이
카드 3장 수직 카지노 회전
점점 느려짐
클릭 시 즉시 스냅
결과는 이미 authority가 결정
```

카드 표시:

```text
아이콘
이름
한 줄 효과
실제 랜덤 수치
레어도 프레임
역할 태그
```

멀티플레이:

```text
내 선택 상태
팀원 READY 상태
남은 시간
```

## 20.2 유물 룰렛

```text
유물 아이콘
유물 이름
레어도
효과 설명
현재 스택
획득 후 결과
```

Legendary:

```text
금색 프레임
전용 사운드
화면 플래시
강한 VFX
```

연출 시간은 사용자가 클릭해 즉시 스킵할 수 있어야 한다.

---

# 21. 콘텐츠 데이터

권장 폴더:

```text
content/progression/
├── level-curves/
├── upgrade-rarity-tables/
├── upgrade-categories/
├── upgrade-first-experience/
├── xp-pickup/
├── treasure-rarity-tables/
├── relics/
├── relic-effect-templates/
└── progression-modes/
```

예:

```json
{
  "id": "progression.mainStage",
  "levelCurveId": "levelCurve.prototype",
  "upgradeRarityTableId": "rarity.upgrade.default",
  "firstLevelRuleId": "firstExperience.levelUp",
  "treasureRarityTableId": "rarity.treasure.default",
  "firstTreasureRuleId": "firstExperience.treasure",
  "xpPickupDefinitionId": "xpPickup.default"
}
```

Single Player와 Multiplayer가 같은 progression definition을 참조한다.

모드별 실행 정책만 별도다.

---

# 22. 보상 이벤트 계약

Coreloop/Horde와 Progression의 연결은 이벤트 계약으로 제한한다.

```ts
interface EnemyKilledRewardEvent {
  enemyId: number;
  enemyDefinitionId: string;
  populationClass: "ambient" | "wave" | "boss" | "special";
  waveId?: number;
  rewardProfileId: string;
  damageSource: string;
}

interface WaveLeaderKilledRewardEvent {
  waveId: number;
  leaderEnemyId: number;
  rewardProfileId: string;
}

interface BossKilledRewardEvent {
  bossEnemyId: number;
  rewardProfileId: string;
}

interface EnemyPurgedEvent {
  enemyId: number;
  waveId: number;
  reason: "leaderDeath";
}
```

Progression 처리:

```text
EnemyKilledRewardEvent
→ XP 및 상자 드랍 가능

WaveLeaderKilledRewardEvent
→ 집중 XP
→ 확정 상자

BossKilledRewardEvent
→ 보스 XP/통계/클리어 보상

EnemyPurgedEvent
→ 보상 없음
```

---

# 23. 28종 유물 구현 분류

## 23.1 단순 Passive/Stat Layer

```text
MAGNET CORE
HEARTY TANK
FRIENDLY SHIELD
HE PAYLOAD
AERIAL MASTER
MOMENTUM SHIELD
IRON WILL
LAST RESORT
GLASS CANNON
XP SURGE
APEX PREDATOR
```

## 23.2 Capability 기반

```text
DOUBLE JUMP
AIR MASTER
ROADKILL
PHASE DASH
PHOENIX CORE
UNSTOPPABLE
TWIN SHELL
```

## 23.3 Triggered Effect

```text
HEAT SINK
COVERING FIRE
VAMPIRE ROUNDS
DASH REFUND
GROUND POUND
ARMOR SHRED
BULLET TIME
DEATH MARK
SAFE HAVEN
RAPID RELOAD
```

일부 유물은 둘 이상의 분류를 사용한다.

예:

```text
UNSTOPPABLE
→ capability + additive dash damage

AIR MASTER
→ capability + additive air control
```

---

# 24. 구현 단계

## Milestone 0 — Audit

- 기존 StatResolver
- CapabilitySystem
- ItemSystem
- PickupSystem
- Damage/kill event
- WaveController reward hook
- pause/lifecycle
- Single/Multiplayer state
- content generation
- current HUD/presentation

문서:

```text
docs/progression08/PROGRESSION08_CODE_AUDIT.md
```

## Milestone 1 — Progression Content

- schemas
- rarity tables
- level curve
- upgrade categories
- relic table
- first-experience rules
- validation/generation

## Milestone 2 — XP Pickup

- XP shard spawn
- magnet radius
- proximity acceleration
- collection
- team XP

## Milestone 3 — Level-Up State

- pending level ups
- MatchFlow pause
- deterministic offers
- timeout
- Single/Multiplayer role pools

## Milestone 4 — Stat Layer Integration

- level upgrade multiplier layer
- relic flat layer
- relic percent layer
- conditional layer
- clamps
- debug breakdown

## Milestone 5 — Treasure/Relic

- map/enemy/wave chest sources
- first chest E70/L30
- normal chest rarity
- relic inventory
- duplicate replacement

## Milestone 6 — Trigger Registry

- passive
- combat triggers
- movement triggers
- wave/wipeout triggers
- capability effects

## Milestone 7 — ROADKILL

- capability
- Dash priority
- speed threshold
- per-target cooldown
- attribution
- VFX/telemetry

## Milestone 8 — UI

- level roulette
- relic roulette
- ready state
- timeout
- local skip
- legendary presentation

## Milestone 9 — Networking/Lifecycle

- reconnect
- duplicate message protection
- rematch reset
- game-over during normal play
- no progression during pause

## Milestone 10 — Tests and Reports

- unit/integration/E2E
- manual two-client
- data authoring guide
- implementation report
- balance telemetry

---

# 25. 테스트 요구사항

## XP와 보상

```text
정상 킬은 XP 생성
퍼지는 XP 미생성
웨이브 리더는 상자 확정
퍼지는 상자 미생성
자석 반경 동작
근접 가속 동작
중복 수집 방지
```

## 레벨업

```text
임계치 도달
여러 레벨 동시 상승
pending queue
첫 카드 Epic
세 번째 카드 Legendary 50%
이후 일반 확률
카드별 독립 레어도
Driver/Gunner 풀 분리
Single 통합 풀
10초 자동 선택
양쪽 완료 후 재개
```

## 유물

```text
첫 상자 E70/L30
두 번째부터 일반 확률
웨이브 상자도 첫 상자 규칙 적용 가능
addPercent 스택
addFlat 스택
capability 첫 획득
unique 중복 시 +250 XP
유물 인벤토리 복제 방지
```

## Stat Layer

```text
레벨업 multiply 누적
유물 percent additive
두 시스템 결과 곱연산
flat 유물은 곱하기 전 더함
조건부 배율 순서
최종 clamp
debug breakdown과 실제 값 일치
```

## ROADKILL

```text
미보유 고속 접촉 대미지 0
보유 저속 접촉 대미지 0
보유 고속 접촉 대미지 발생
Dash 중에는 Dash만 적용
ROADKILL은 Dash kill로 집계되지 않음
추가 스택은 계수 +25%
per-target cooldown
```

## Pause

```text
선택 중 Stage timer 정지
적 이동 정지
프로젝트타일 정지
물리 정지
네트워크 유지
타임아웃 진행
READY 상태 동기화
```

## Lifecycle

```text
Single restart reset
Multiplayer rematch reset
reconnect selection state restore
disconnect timeout policy
gameOver 후 선택 시작 안 함
clear 후 신규 레벨업 시작 안 함
```

---

# 26. 디버그와 텔레메트리

Debug overlay:

```text
team level
current XP
next threshold
pending level ups

current MatchFlowState
active offer ID
selection timeout
Driver/Gunner ready

upgrade modifiers by stat
relic flat bonuses
relic percent bonuses
conditional multipliers
final resolved value

relic inventory and stacks
capabilities

treasureChestsOpened
first chest consumed
last rarity roll
last RNG stream position

XP shards active
magnet radius
XP collected per second

ROADKILL capability
resolved speed threshold
last roadkill speed ratio
last roadkill damage
```

밸런스 텔레메트리:

```text
분당 킬
분당 XP
farming second당 XP
레벨업 시간
스테이지당 레벨업 수
놓친 XP 비율
상자 획득 수
유물 레어도 분포
업그레이드 선택률
유물별 보유율
ROADKILL 처치 수
```

이 데이터는 몬스터 디자인 완료 후 레벨링 속도 조정에 사용한다.

---

# 27. 문서화 요구사항

Codex 구현 시 다음을 작성한다.

```text
docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md
docs/progression08/PROGRESSION08_CONTENT_AUTHORING_GUIDE.md
docs/progression08/PROGRESSION08_STAT_STACKING_GUIDE.md
docs/progression08/PROGRESSION08_RELIC_TRIGGER_GUIDE.md
docs/progression08/PROGRESSION08_NETWORK_AND_PAUSE_GUIDE.md
docs/progression08/PROGRESSION08_BALANCE_TELEMETRY_GUIDE.md
```

기존 문서의 구버전 문구도 수정한다.

필수 수정:

```text
05-유물-테이블.md
→ “첫 웨이브 Rare 확정” 제거
→ 첫 상자는 Epic 70% / Legendary 30%로 통일

03-업그레이드-시스템.md
→ 레벨업과 유물 간 중복 스탯 계산 레이어 명시
→ 레벨링 속도는 몬스터 설계 후 확정으로 명시
→ ROADKILL capability 예외 규칙 명시
```

---

# 28. 완료 조건

구현은 다음 조건을 모두 만족해야 완료다.

1. XP 조각이 정상 킬에서만 생성된다.
2. 퍼지된 적은 XP·상자·킬 트리거를 만들지 않는다.
3. 팀 경험치와 pending level-up이 작동한다.
4. 레벨 곡선이 콘텐츠 데이터다.
5. 레벨업 룰렛 결과는 authority가 미리 결정한다.
6. 첫 레벨업 하드코딩이 적용된다.
7. 멀티 역할별 풀과 싱글 통합 풀이 작동한다.
8. 선택 중 authoritative gameplay가 정지한다.
9. 두 플레이어가 모두 완료해야 멀티가 재개된다.
10. 타임아웃 자동 선택이 결정론적이다.
11. 첫 보물상자는 E70/L30이다.
12. 이후 보물상자는 C55/R30/E13/L2다.
13. 웨이브 리더는 상자를 확정 드랍한다.
14. 첫 상자 규칙은 획득 경로와 무관하다.
15. 유물 28종이 데이터로 정의된다.
16. 중복 불가 유물 재등장은 +250 XP로 바뀐다.
17. 레벨업 카드 내부는 multiply 스택이다.
18. 유물 percent 내부는 additive 스택이다.
19. 레벨업과 유물 레이어는 서로 곱한다.
20. 유물 flat은 레벨업 배율 전에 더한다.
21. 조건부 효과는 Trigger Registry를 통해 실행된다.
22. ROADKILL 미보유 고속 접촉은 대미지 0이다.
23. ROADKILL 보유 시에만 고속 접촉 공격이 활성화된다.
24. Dash와 ROADKILL은 같은 접촉에 중복 적용되지 않는다.
25. Combat 05 Dash-only 기본 규칙은 유지된다.
26. ROADKILL은 별도 attribution과 통계를 가진다.
27. Single Player와 Multiplayer가 같은 콘텐츠 정의를 사용한다.
28. 모드별 차이는 선택 실행 정책과 미확정 XP 보정뿐이다.
29. 레벨링 속도 값은 쉽게 교체 가능하다.
30. 몬스터 디자인 전 임시 XP 수치를 최종값으로 고정하지 않는다.
31. 재접속과 리매치가 성장 상태를 안전하게 처리한다.
32. 디버그 오버레이가 스탯 계산 과정을 보여준다.
33. 밸런스 텔레메트리가 레벨링 속도 조정을 지원한다.
34. 새 업그레이드와 유물을 콘텐츠 중심으로 추가할 수 있다.
35. 전체 시스템이 Coreloop 06과 분리된 모듈 경계를 유지한다.

최종 불변 조건:

> Recoil Crew의 레벨업은 기본 성능을 곱연산으로 성장시키고, 유물은 조건부 능력과 별도의 스탯 레이어를 제공한다. 두 성장 레이어는 서로 곱해 강한 시너지를 만들지만, 보상 생성·선택·전투 효과는 모두 권위형이고 데이터 기반이며 코어 루프의 웨이브 및 퍼지 규칙을 침범하지 않는다.
