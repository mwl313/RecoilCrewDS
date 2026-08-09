/** AUTO-GENERATED — do not edit by hand. Run `npx tsx scripts/generate-monster-dimensions.ts`. */
export interface MonsterSourceDimensions {
  width: number;
  height: number;
  depth: number;
  groundOffset: number;
  projectileSocket: [number, number, number];
  groundSocket: [number, number, number];
}

/** Generated policy input consumed by the single runtime dimension resolver. */
export const MONSTER_READABILITY_SIZE_POLICY = {
  "ordinaryTargetHeights": {
    "small": 1.2,
    "medium": 1.8,
    "large": 2
  },
  "preservedBaselineHeights": {
    "small": 1.02,
    "medium": 1.53,
    "large": 1.7
  },
  "tierScales": {
    "fodder": 1,
    "specialist": 1,
    "elite": 3,
    "boss": 5
  },
  "readabilityTiers": [
    "fodder",
    "specialist"
  ]
} as const;

export const MONSTER_DIMENSIONS: Record<string, MonsterSourceDimensions> = {
  "alien": {
    "width": 1.426542,
    "height": 1.2,
    "depth": 0.71568,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.28627198934555054
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "alien-high-detail": {
    "width": 1.92001,
    "height": 2,
    "depth": 0.961291,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.38451600074768066
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "alpaking": {
    "width": 2.41455,
    "height": 1.2000000000000002,
    "depth": 1.265593,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.5062367916107178
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "alpaking-evolved": {
    "width": 1.629932,
    "height": 1.2000000000000002,
    "depth": 1.126616,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.45064640045166016
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "armabee": {
    "width": 2.732788,
    "height": 1.2000000000000002,
    "depth": 1.315812,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.5263248085975647
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "armabee-evolved": {
    "width": 2.416623,
    "height": 1.2000000000000002,
    "depth": 1.149006,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.459602415561676
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "birb": {
    "width": 1.28063,
    "height": 1.2,
    "depth": 1.263015,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.5052055716514587
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "blue-demon": {
    "width": 2.374949,
    "height": 2,
    "depth": 1.4172850000000001,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.566914439201355
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "bunny": {
    "width": 1.866448,
    "height": 1.999999,
    "depth": 0.995294,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.3981176018714905
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "cactoro": {
    "width": 1.364952,
    "height": 1.2,
    "depth": 1.228573,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.49142879247665405
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "cactoro-high-detail": {
    "width": 1.708497,
    "height": 2,
    "depth": 1.136977,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.4547904133796692
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "cat": {
    "width": 1.291354,
    "height": 1.2,
    "depth": 1.06022,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.4240880012512207
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "chicken": {
    "width": 1.1978659999999999,
    "height": 1.2,
    "depth": 1.0718670000000001,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.42874640226364136
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "demon": {
    "width": 3.601679,
    "height": 1.8,
    "depth": 2.193953,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.8775808215141296
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "demon-high-detail": {
    "width": 2.4861,
    "height": 2,
    "depth": 1.355074,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.542030394077301
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "dino": {
    "width": 2.1308920000000002,
    "height": 2.000001,
    "depth": 1.28164,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.512656033039093
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "dragon": {
    "width": 3.4813590000000003,
    "height": 1.2000000000000002,
    "depth": 1.947047,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.77881920337677
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "dragon-evolved": {
    "width": 2.784632,
    "height": 1.8,
    "depth": 1.696907,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.6787623763084412
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "fish": {
    "width": 1.225316,
    "height": 1.2,
    "depth": 1.237518,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.495007187128067
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "fish-high-detail": {
    "width": 1.825208,
    "height": 2,
    "depth": 1.33059,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.5322359800338745
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "frog": {
    "width": 2.568775,
    "height": 2.000001,
    "depth": 1.331444,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.5325767993927002
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "ghost": {
    "width": 1.737479,
    "height": 1.7999990000000001,
    "depth": 1.113277,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.44531121850013733
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "ghost-skull": {
    "width": 1.746294,
    "height": 1.7999990000000001,
    "depth": 1.251092,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.5004367828369141
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "glub": {
    "width": 2.202094,
    "height": 1.2000000000000002,
    "depth": 1.11867,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.44746798276901245
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "glub-evolved": {
    "width": 1.394138,
    "height": 1.199999,
    "depth": 0.650292,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.2601167857646942
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "goleling": {
    "width": 3.404572,
    "height": 1.199999,
    "depth": 1.524715,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.6098864078521729
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "goleling-evolved": {
    "width": 2.051954,
    "height": 1.2000000000000002,
    "depth": 1.021931,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.2640000581741333,
      0.4087727963924408
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "green-blob": {
    "width": 1.447824,
    "height": 1.2,
    "depth": 1.413095,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.5652376413345337
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "green-spiky-blob": {
    "width": 1.010692,
    "height": 1.2,
    "depth": 1.20083,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.48033198714256287
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "hywirl": {
    "width": 1.946997,
    "height": 1.7999990000000001,
    "depth": 1.475975,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.590389609336853
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "monkroose": {
    "width": 2.3097440000000002,
    "height": 2,
    "depth": 1.171562,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.4686240255832672
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "mushnub": {
    "width": 0.9985,
    "height": 1.2,
    "depth": 0.99851,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.39940398931503296
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "mushnub-evolved": {
    "width": 0.92383,
    "height": 1.2,
    "depth": 0.95542,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.3821679949760437
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "mushroom-king": {
    "width": 1.966636,
    "height": 1.999999,
    "depth": 1.20085,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.48034000396728516
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "ninja": {
    "width": 0.989702,
    "height": 1.2,
    "depth": 1.06162,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.4246479868888855
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "ninja-high-detail": {
    "width": 2.156022,
    "height": 2,
    "depth": 1.892722,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.7570887804031372
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "orc": {
    "width": 2.144888,
    "height": 2.000001,
    "depth": 1.099267,
    "groundOffset": 0.000001,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.4397071897983551
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "orc-enemy": {
    "width": 1.341594,
    "height": 1.2,
    "depth": 0.841542,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.3366168141365051
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "pigeon": {
    "width": 1.559568,
    "height": 1.2,
    "depth": 1.335543,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.5342167615890503
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "pink-blob": {
    "width": 1.090454,
    "height": 1.2,
    "depth": 1.03346,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.41338402032852173
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "squidle": {
    "width": 3.319416,
    "height": 1.8000009999999997,
    "depth": 2.022014,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.8088055849075317
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "tribal": {
    "width": 1.383498,
    "height": 1.7999999999999998,
    "depth": 0.92042,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.7960000038146973,
      0.3681679964065552
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "wizard": {
    "width": 1.073314,
    "height": 1.2,
    "depth": 1.063992,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.42559680342674255
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "yeti": {
    "width": 1.250148,
    "height": 1.2,
    "depth": 1.2722630000000001,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      0.8640000224113464,
      0.5089055895805359
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  },
  "yeti-high-detail": {
    "width": 2.439407,
    "height": 2,
    "depth": 1.159451,
    "groundOffset": 0,
    "projectileSocket": [
      0,
      1.440000057220459,
      0.463780015707016
    ],
    "groundSocket": [
      0,
      0,
      0
    ]
  }
};

/** Per-definition size-class/tier metadata for generalized monsters. */
export const ENEMY_DEFINITION_SIZE_TIER: Record<string, { sizeClass: 'small' | 'medium' | 'large'; tier: 'fodder' | 'specialist' | 'elite' | 'boss'; optionalVariantScale: number }> = {
  "enemy.quaternius.alien-high-detail": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.alien": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.alpaking-evolved": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.alpaking": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.armabee-evolved": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.armabee": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.birb": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.blue-demon": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.bunny": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.cactoro-high-detail": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.cactoro": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.cat": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.chicken": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.demon-high-detail": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.demon": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.dino": {
    "sizeClass": "large",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.dragon-evolved": {
    "sizeClass": "large",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.dragon": {
    "sizeClass": "large",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.fish-high-detail": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.fish": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.frog": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.ghost-skull": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.ghost": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.glub-evolved": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.glub": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.goleling-evolved": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.goleling": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.green-blob": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.green-spiky-blob": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.hywirl": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.monkroose": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.mushnub-evolved": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.mushnub": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.mushroom-king": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.ninja-high-detail": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.ninja": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.orc-enemy": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.orc": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.pigeon": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.pink-blob": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.squidle": {
    "sizeClass": "small",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.tribal": {
    "sizeClass": "medium",
    "tier": "specialist",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.wizard": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.yeti-high-detail": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.yeti": {
    "sizeClass": "medium",
    "tier": "fodder",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.alien-high-detail.boss": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.cactoro-high-detail.boss": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.fish-high-detail.boss": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.ninja-high-detail.boss": {
    "sizeClass": "large",
    "tier": "boss",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.demon-high-detail.elite": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  },
  "enemy.quaternius.yeti-high-detail.elite": {
    "sizeClass": "medium",
    "tier": "elite",
    "optionalVariantScale": 1
  }
};
