import type { MonsterPackSourceManifests } from '../../scripts/monsterpack10/types';

export function makeFixtureManifests(): MonsterPackSourceManifests {
  const catalog = {
    models: [
      {
        id: 'monster.quaternius.mushnub',
        slug: 'mushnub',
        sourceFile: 'Mushnub.glb',
        classification: {
          rigFamilyId: 'rig.quaternius.simpleGround',
          roleCandidates: ['fodder', 'swarm'],
          commonEligibility: 'candidate',
          eliteEligibility: 'not_recommended',
          bossEligibility: 'not_recommended',
        },
        semanticAnimations: {},
      },
      {
        id: 'monster.quaternius.dragon-evolved',
        slug: 'dragon-evolved',
        sourceFile: 'Dragon Evolved.glb',
        classification: {
          rigFamilyId: 'rig.quaternius.compactFlying',
          roleCandidates: ['boss', 'specialist'],
          commonEligibility: 'not_common_eligible',
          eliteEligibility: 'candidate',
          bossEligibility: 'candidate',
        },
        semanticAnimations: {},
      },
    ],
  };
  const clip = (name: string): string => `CharacterArmature|${name}`;
  const variants: Record<string, never> = {};
  const addVariant = (
    slug: string,
    variant: 'hero' | 'commonNear' | 'commonFar' | 'aggregate',
    clips: string[],
    fileSuffix: string,
  ): void => {
    variants[`model.quaternius.${slug}.${variant}`] = {
      id: `model.quaternius.${slug}.${variant}`,
      variant,
      sourceModelId: `monster.quaternius.${slug}`,
      pipelineVersion: '1.1.1-color-fidelity',
      outputFile: `exports/${variant === 'commonNear' ? 'common-near' : variant === 'commonFar' ? 'common-far' : variant === 'aggregate' ? 'aggregate' : 'hero'}/${slug}.${fileSuffix}.glb`,
      outputSha256: `hash-${slug}-${variant}`,
      outputFileBytes: 1000,
      measured: {
        clipNames: clips.map((n) => `CharacterArmature|${n}`),
        armatureCount: variant === 'aggregate' ? 0 : 1,
        materialCount: 1,
        triangleCount: 100,
        meshCount: 1,
      },
    } as never;
  };
  const heroClips = ['Idle', 'Walk', 'Bite_Front', 'HitRecieve', 'Jump', 'Death'];
  const commonClips = ['Idle', 'Walk', 'Bite_Front', 'HitRecieve', 'Jump', 'Death'];
  addVariant('mushnub', 'hero', heroClips, 'hero');
  addVariant('mushnub', 'commonNear', commonClips, 'common-near');
  addVariant('mushnub', 'commonFar', [], 'common-far');
  addVariant('mushnub', 'aggregate', [], 'aggregate');
  addVariant('dragon-evolved', 'hero', heroClips, 'hero');

  const animationProfiles = {
    profiles: {
      'monster.quaternius.mushnub': {
        profileId: 'animation.mushnub',
        sourceModelId: 'monster.quaternius.mushnub',
        semanticClipMap: {
          idle: clip('Idle'),
          walk: clip('Walk'),
          move: clip('Walk'),
          attackPrimary: clip('Bite_Front'),
          hit: clip('HitRecieve'),
          stagger: clip('HitRecieve'),
          spawn: clip('Jump'),
          death: clip('Death'),
          entrance: clip('Jump'),
          recovery: clip('Idle'),
        },
      },
      'monster.quaternius.dragon-evolved': {
        profileId: 'animation.dragon-evolved',
        sourceModelId: 'monster.quaternius.dragon-evolved',
        semanticClipMap: {
          idle: clip('Flying_Idle'),
          hover: clip('Flying_Idle'),
          fastHover: clip('Fast_Flying'),
          attackPrimary: clip('Headbutt'),
          hit: clip('HitReact'),
          death: clip('Death'),
        },
      },
    },
  };
  const scaleProfiles = {
    profiles: {
      'monster.quaternius.mushnub': {
        normalizedHeight: 1.2,
        groundOffset: 0,
        hoverOffset: 0,
        recommendedCommonHeight: 1.2,
        recommendedEliteHeight: 1.8,
        recommendedBossHeight: 3.3,
        suggestedCollisionRadius: 0.4,
        suggestedCollisionHeight: 1.0,
      },
      'monster.quaternius.dragon-evolved': {
        normalizedHeight: 2.2,
        groundOffset: 0,
        hoverOffset: 0.8,
        recommendedCommonHeight: null as never,
        recommendedEliteHeight: 3.3,
        recommendedBossHeight: 6.0,
        suggestedCollisionRadius: 0.9,
        suggestedCollisionHeight: 2.0,
      },
    },
  };
  const socketProfiles = {
    profiles: {
      'monster.quaternius.mushnub': {
        center: 'socket.center',
        head: 'socket.head',
        weapon: 'socket.weapon',
        projectile: 'socket.projectile',
        hitVfx: 'socket.hitVfx',
        deathVfx: 'socket.deathVfx',
        shadow: 'socket.shadow',
      },
      'monster.quaternius.dragon-evolved': {
        center: 'socket.center',
        head: 'socket.head',
        weapon: 'socket.weapon',
        projectile: 'socket.projectile',
        hitVfx: 'socket.hitVfx',
        deathVfx: 'socket.deathVfx',
        shadow: 'socket.shadow',
      },
    },
  };
  return {
    catalog: catalog as unknown as MonsterPackSourceManifests['catalog'],
    runtimeVariants: { variants: variants as unknown as MonsterPackSourceManifests['runtimeVariants']['variants'] },
    animationProfiles: animationProfiles as unknown as MonsterPackSourceManifests['animationProfiles'],
    scaleProfiles: scaleProfiles as unknown as MonsterPackSourceManifests['scaleProfiles'],
    socketProfiles: socketProfiles as unknown as MonsterPackSourceManifests['socketProfiles'],
    rigFamilies: {
      families: {
        'rig.quaternius.simpleGround': {
          id: 'rig.quaternius.simpleGround',
          sourceModelIds: ['monster.quaternius.mushnub'],
          expectedBoneRange: [4, 4],
          expectedClipNames: ['Idle', 'Walk', 'Death'],
          commonEligible: true,
          compatibilityFingerprints: ['abc'],
        },
        'rig.quaternius.compactFlying': {
          id: 'rig.quaternius.compactFlying',
          sourceModelIds: ['monster.quaternius.dragon-evolved'],
          expectedBoneRange: [13, 13],
          expectedClipNames: ['Flying_Idle', 'Fast_Flying', 'Death'],
          commonEligible: false,
          compatibilityFingerprints: ['def'],
        },
      },
      exactCompatibilityGroups: [],
    },
  };
}
