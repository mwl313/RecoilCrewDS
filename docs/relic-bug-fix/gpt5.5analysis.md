1. Relic effect audit

For the table below, ✅ means the source path appears complete, not that I personally ran the browser game in this turn. ❌ means I can demonstrate a defect directly from the current source.

Relic	Status	Audit result
MAGNET CORE	✅	Resolver feeds the XP shard magnet radius correctly.
HEAT SINK	❌ Broken	The relic adds a dynamic weapon.mgDamage modifier, but actual MG firing prefers the frozen weapon statBlock, so the buff is bypassed.
COVERING FIRE	⚠️	Works on modern monster movement, but excessive stacks can push the speed multiplier below zero.
DOUBLE JUMP	❌ Broken	tank.extraJumps is created, but tank movement still only accepts jump while grounded.
VAMPIRE ROUNDS	✅	Cannon-kill trigger → capped heal path is wired.
FRIENDLY SHIELD	❌ Broken	Two separate defects: wrong damage-source match and reduction sign is backwards.
HEARTY TANK	✅	tank.maxIntegrity is dynamically projected.
DASH REFUND	✅	Dash hit reduces current cooldown and clamps at zero.
AIR MASTER	⚠️ Partially broken	+40% air control works; extra/reusable airborne dash does not.
HE PAYLOAD	✅	Cannon profile resolves dynamic radius/knockback stats.
ROADKILL	✅	Capability, speed gate, Dash priority and stack coefficient are wired.
AERIAL MASTER	❌ Broken	Checks whether the enemy is airborne, not the tank, and isn't restricted to Gunner weapons.
GROUND POUND	✅	Landing trigger → AoE damage/knockback path exists.
MOMENTUM SHIELD	❌ Reversed	At top speed it currently makes the tank take more damage.
ARMOR SHRED	✅	MG hit applies vulnerability and subsequent damage reads it.
BULLET TIME	✅	Additional airborne dash-cooldown recovery is wired.
TWIN SHELL	✅	Second cannon shot and ×1.2 cooldown are implemented; unique stacking cap works.
DEATH MARK	✅	Cannon kill explosion path is wired.
GLASS CANNON	❌ Wrong tradeoff	Outgoing +20% works, but incoming side becomes -15% damage taken, instead of +15%.
SAFE HAVEN	✅	Wave completion event reaches wave-clear healing.
RAPID RELOAD	⚠️ Overtriggers	One splash shell can trigger the cooldown reduction once per enemy damaged, multiplying the reduction repeatedly.
IRON WILL	❌ Reversed	At ≤50% integrity it currently makes the tank take more damage.
LAST RESORT	✅	≤30% integrity outgoing bonus path is wired.
PHASE DASH	❌ Duration wrong	Invulnerability uses the 0.18 s cosmetic dash-presentation timer, not the actual dash duration.
XP SURGE	✅	XP multiplier feeds authoritative XP acquisition.
PHOENIX CORE	✅	One-use revive path is implemented and match-scoped.
UNSTOPPABLE	✅	Zero dash cooldown + stacked dash damage are wired.
APEX PREDATOR	⚠️ Partially broken	Boss/wave-leader detection works, but ordinary production elite/special monsters don't receive the bonus.

So I count roughly 9 relics with definite or meaningful implementation defects, with several of them severe.

The damage-reduction relics have a systemic sign bug

This is probably the most serious family of defects.

RelicStatProjector stores reductions such as Momentum Shield and Iron Will as positive percentages. But modifyTankDamage() applies them as:

multiplier *= 1 + percent / 100;

So:

MOMENTUM SHIELD intended:
-20% damage
→ should be ×0.80

current:
+20 stored
→ 1 + .20
→ ×1.20 damage

Momentum Shield explicitly says incoming damage -20%. Iron Will has the same positive-20 encoding and therefore the same reversal.

GLASS CANNON exposes the inconsistency from the opposite direction. Its design is outgoing +20%, incoming +15%, but its content encodes incomingDamageReduction: -15; the current 1 + percent implementation consequently gives ×0.85 incoming damage—making Glass Cannon tougher instead of more fragile.

This should be fixed at the semantics layer, not by individually swapping random signs in JSON.

FRIENDLY SHIELD is doubly broken

Its content correctly says cannon self-damage -50%, two stacks reaching zero.

But actual cannon self-damage is sent to DamageSystem as:

applyTank(tankSplash, 'splash')

while modifyTankDamage() only applies the Friendly Shield bucket when:

source === 'cannon'

So it doesn't match at all. And even if the source were changed to match, the positive 50 reduction currently goes through 1 + .50, which would make self-damage 50% larger.

That relic is effectively nonfunctional right now.

DOUBLE JUMP is definitely not connected to movement

The relic creates both the tank.extraJump capability and tank.extraJumps +1.

But current tank kinematics still says:

const jumped =
  inp.jumpPressed &&
  t.grounded &&
  tankCfg.jumpHeight > 0;

There is no airborne jump counter, no consumed extra-jump charge and no extraJumps check.

So acquiring DOUBLE JUMP changes a stat that the movement simulation never consumes.

AIR MASTER has the same missing movement integration

AIR MASTER promises:

Air control +40%
+ air dash reuse

and provides tank.airDashRefresh plus tank.airDashCharges.

The air-control portion reaches the normal movement config, so that part should work. But current kinematics has no air-dash charge state or capability consumption; Dash is still governed by the ordinary cooldown path.

So the flashy half of AIR MASTER—the thing players would actually notice—is missing.

AERIAL MASTER checks the wrong entity

Its definition says:

all Gunner damage +30% while airborne.

But DamageSystem calls the progression modifier with:

airborne: enemy.impulseGrounded === false

Then modifyEnemyDamage() applies Aerial Master's bonus when that value is true. It also ignores source after receiving it.

Therefore current behavior is approximately:

tank airborne + enemy grounded
→ NO Aerial Master bonus

tank grounded + knocked-up enemy
→ Aerial Master bonus

Dash/roadkill/etc. against airborne enemy
→ can also receive the "Gunner weapon" bonus

That's a clear logic inversion.

HEAT SINK is bypassed by the weapon stat accessor

HEAT SINK correctly creates a timed +20% weapon.mgDamage resolver modifier.

But MG firing obtains damage through:

weaponStat(weapon, 'weapon.mgDamage', ...)

and weaponStat() returns the weapon's frozen statBlock value whenever present. The machine gun absolutely does have weapon.mgDamage: 2 in its stat block.

So the fallback dynamic value never wins.

There is a second timing problem: StatusEffectSystem contains the method that advances/expunges timed stat modifiers, but the main simulation step currently does not call that status-effect update.

So HEAT SINK needs both dynamic MG stat consumption and proper timed-modifier ticking fixed.

APEX PREDATOR misses ordinary elites

APEX PREDATOR says +40% damage to elites and bosses.

Modern monster spawning already normalizes populationClass === 'special' into:

monster.rewardClass = 'elite'

But damage logic decides elite/boss status using only:

ownership class boss
OR
wave enemy whose leaderId === itself

So a normal special/elite monster isn't considered elite for Apex Predator. The chest system and damage system are using two different notions of “elite.”

That should be centralized into one normalized classification helper.

PHASE DASH is shorter than the actual Dash

PHASE DASH promises invulnerability “during Dash.”

But the implementation starts an invulnerability timer using:

rules.config.tank.dashPresentationSeconds

which is only 0.18 s. The actual stateful Dash is configured for a 0.38 s burst plus 0.20 s recovery.

The robust implementation should check the authoritative dash state itself rather than maintain a separate cosmetic-duration invulnerability timer.

RAPID RELOAD is multiplicative per splash victim

The relic says a cannon hit reduces the next cooldown by 20%.

Its handler triggers on every damage.applied cannon event and multiplies remaining cooldown. But one shell explosion calls applyEnemy() separately for every enemy in its splash radius.

Thus one shot hitting five enemies can do approximately:

0.8⁵ = 0.32768

leaving only ~33% of the cooldown.

If “on cannon hit” is meant once per shell impact—as the design wording suggests—this needs shell/impact-level deduplication.

2. Unique relic / roll-limit audit

There is an important distinction here.

The original design does not say unique relics are removed from the roulette after acquisition. It says:

unique relic reappears
→ cannot stack
→ converts to +250 XP

The explicitly unique relics are:

TWIN SHELL
PHASE DASH
PHOENIX CORE

That part is implemented correctly at inventory acquisition level. RelicInventory.add() checks stackPolicy === 'unique', refuses a second stack and returns duplicate conversion XP. Their content definitions are indeed marked unique.

However, there is no roll exclusion. claimChest() filters only by rarity and then picks from the complete rarity pool:

const candidates = pool.filter(r => r.rarity === rarity);
const relic = pickPool[...];

It never removes already-owned unique relics.

So the current state is:

Can PHASE DASH be acquired twice?       NO ✅
Can PHASE DASH appear in roulette twice? YES
Second appearance becomes +250 XP.      YES

If your current intention is literally “unique relics must never be rolled again after acquisition”, then that behavior is not implemented and the candidate generator needs to filter them out before selecting.

Given how many chests the new design generates, I think excluding already-owned unique relics is probably better now. With 10 starting chests plus periodic and enemy drops, repeated Legendary uniques converting into XP will otherwise consume a meaningful fraction of exciting chest rolls.

There's also a smaller content-authority issue: individual unique relic JSON contains a duplicateReplacement.amount, but RelicInventory ignores that amount and always uses the global duplicateUniqueRelicXp. They're all 250 currently, so there is no present gameplay mismatch, but it's a fake data-driven field.

3. Other spawning / rolling / relic-system bugs

The new class-aware production monster routing itself is much better. Ambient 1%, wave 2%, elite 8%, boss 0%, leader guaranteed are in content, and the new kill path now reaches them.

The chest lifecycle also correctly prevents a spawning chest from being claimed: only closed chests enter proximity selection. The first-chest rarity logic itself remains sound: first chest uses its special table and subsequent chests use the normal table.

But I found several remaining defects or weak spots:

Guaranteed leader chest isn't truly guaranteed. spawnRewardChest() asks enemyDropPlacement() for a valid location. If all searched positions fail, it simply returns null; the leader reward path has no deferred/fallback chest. In dense city geometry, a “guaranteed” reward can therefore silently vanish.

Multi-leader waves can give multiple guaranteed chests. WaveController explicitly supports multiple leaderIds. But progression decides isLeader independently for each killed enemy and immediately spawns the guaranteed chest. The old design says wave clear → guaranteed chest, singular. If a wave has two designated elite leaders, current behavior can award two guaranteed leader chests rather than one chest when the wave actually clears.

The “10 starting chests” guarantee is soft. initialPlacements() tries up to 6000 random candidates and then returns whatever it found; there is no failsafe/error if it found fewer than ten. Likewise the special discovery-annulus search can fail, after which ordinary placements continue without guaranteeing another chest in that radius. The current test proves one flat seed and one generated-city case, not the invariant over many production seeds.

Periodic spawning isn't really guaranteed to be unnoticed. Current logic guarantees only a ≥35 m tank distance. A chest can still spawn in direct view at 40 m and visibly grow. That's not a simulation bug, but it is weaker than your “without the player noticing” requirement.

There are still two enemy drop-rate authorities in content. The new actual policy has the class-aware table. But progression.mainStage still contains the obsolete-looking "enemyChestDropChance": 0.015. The new production reward path ignores that old 1.5% field. That's a dangerous tuning trap: someone can change it later and see no gameplay effect.

COVERING FIRE lacks its intended reduction clamp. Its movement path is now correctly applied immediately before movement integration. But enemySpeedMultiplier() is simply 1 - speedPercent / 100, with no lower bound. The design explicitly says reduction stacks must clamp rather than reverse behavior. With sufficiently many stacks, enemies can eventually acquire negative movement speed.

What I would fix first
P0 — repair the incoming-damage semantics for Friendly Shield, Momentum Shield, Iron Will and Glass Cannon. Some currently do literally the opposite of their descriptions.
P0 — implement Double Jump and AIR MASTER's air-dash charges in the shared server/predictor movement model, not as client-only hacks.
P0 — fix AERIAL MASTER to use tank airborne state and Gunner weapon source.
P1 — fix HEAT SINK by making MG use resolver stats and actually ticking timed modifiers.
P1 — fix APEX PREDATOR elite classification and PHASE DASH authoritative duration.
P1 — define RAPID RELOAD as once-per-projectile impact rather than once-per-splash-victim, assuming that's still your intended behavior.
P1 — make guaranteed wave rewards genuinely guaranteed and settle one-per-wave vs one-per-leader.
P1 — settle unique-roll behavior. The old design says unique duplicates may reroll for +250 XP; if your newer intent is “never appear again,” filter owned uniques from the candidate pool.
P2 — harden initial 10/discovery placement, remove the obsolete global 1.5% drop field, clamp Covering Fire, and improve periodic spawn concealment.

The biggest takeaway is that the new chest integration is not the main source of the effect failures. It exposed a set of older relic implementation defects that were already in the core progression/combat code. The branch's qualification focused strongly on “does the chest spawn/open/replicate/reconnect?” rather than “does each of the 28 acquired relics produce the exact intended gameplay behavior?”

I would make the next milestone a dedicated 28-relic correctness pass, with one deterministic behavioral test per relic rather than another general progression test suite.