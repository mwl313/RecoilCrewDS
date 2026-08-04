import { z } from 'zod';

/**
 * Refractor 02 — presentation content schemas.
 *
 * Scenes/HUD documents describe structure, layout, styling, bindings, and
 * allowlisted actions only. They never execute code and never touch the
 * authoritative simulation. Every document is validated at generation time
 * (npm run generate:presentation-content) and again at runtime.
 */

export const UI_COMPONENT_TYPES = [
  'container',
  'panel',
  'text',
  'button',
  'input',
  'horizontal',
  'vertical',
  'grid',
  'spacer',
  'conditional',
  'repeater',
  'progressBar',
  'image',
  'roleChip',
  'connectionIndicator',
  'statText',
  'crosshair',
  'objectiveMarker',
  'arcMeter',
  'popupLayer',
  'pauseButton',
] as const;

/** Scene entity component types with a runtime implementation. */
export const SCENE_COMPONENT_TYPES = [
  'model',
  'camera',
  'directionalLight',
  'hemisphereLight',
  'pointLight',
  'rotateAnimation',
  'floatAnimation',
] as const;

/**
 * Reserved scene component types. They remain valid in documents so the
 * future editor can render/author them, but the runtime does not pretend
 * to implement them: PresentationWorld logs an explicit unsupported warning
 * when one is encountered instead of silently no-op'ing.
 */
export const SCENE_RESERVED_COMPONENT_TYPES = [
  'lookAt',
  'audioSource',
  'postProcessPreset',
  'particleEmitter',
  'billboard',
] as const;

export const ACTION_IDS = [
  'app.enter',
  'app.createCrew',
  'app.openJoin',
  'app.joinCrew',
  'app.ready',
  'app.startSinglePlayer',
  'app.restartSinglePlayer',
  'app.openHowTo',
  'app.back',
  'app.leave',
  'app.rematch',
  'app.retry',
  'app.resume',
  'app.pause',
  'app.returnToMenu',
  'app.copyRoomCode',
] as const;

export const BINDING_TARGETS = ['text', 'value', 'visible', 'class', 'style', 'attribute'] as const;
export const BINDING_TRANSFORMS = [
  'number',
  'integer',
  'time',
  'percentage',
  'ratio',
  'booleanClass',
  'roleLabel',
  'connectionLabel',
] as const;

/** Allowed binding source paths for scene documents. */
export const SCENE_BINDING_PATHS = [
  'code',
  'status',
  'copyLabel',
  'copyDisabled',
  'message',
  'value',
  'sub',
  'score',
  'title',
  'grade',
  'stats',
  'driverReady',
  'gunnerReady',
  'driverState',
  'gunnerState',
  'readyLabel',
  'myRole',
  'roomCode',
  'myReady',
  'modifiers',
  'selectedModifier',
  'rematchInfo',
  'canLeave',
  'crewMode',
  'singleMode',
  'stats',
] as const;

/** Allowed binding source paths for gameplay HUD documents (HudViewModel). */
export const HUD_BINDING_PATHS = [
  'role',
  'session.kind',
  'session.showRoleIdentity',
  'session.showPeerStatus',
  'connection.peerConnected',
  'connection.pingMs',
  'connection.fps',
  'match.timeRemaining',
  'match.timeUrgent',
  'match.score',
  'match.scoreText',
  'match.combo',
  'match.comboHot',
  'tank.integrity',
  'tank.integrityMax',
  'tank.integrityLow',
  'tank.speed',
  'tank.grounded',
  'tank.dashReady',
  'tank.dashActive',
  'tank.dashCooling',
  'gunner.cannonCooldown',
  'gunner.cooldownRatio',
  'gunner.chargeUnlocked',
  'gunner.chargeHeld',
  'gunner.chargeRatio',
  'gunner.chargeFull',
  'gunner.chargeMax',
  'objective.visible',
  'objective.screenX',
  'objective.screenY',
  'objective.label',
  'pointerLocked',
  'prompt',
  'promptSub',
  'crosshairVisible',
  'stage.phase',
  'stage.farmingLabel',
  'stage.waveLabel',
  'stage.waveActive',
  'stage.leaderHpRatio',
  'stage.leaderHpMax',
  'stage.stageClear',
  'stage.gameOver',
] as const;

const idPrefix = (prefix: string) => z.string().regex(new RegExp(`^${prefix.replace(/\./g, '\\.')}`), `id must start with ${prefix}`);

const layoutSchema = z
  .object({
    kind: z.enum(['absolute', 'anchor', 'horizontal', 'vertical', 'grid', 'overlay', 'flow']),
    x: z.union([z.number(), z.string()]).optional(),
    y: z.union([z.number(), z.string()]).optional(),
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    gap: z.number().optional(),
    columns: z.number().optional(),
    rows: z.number().optional(),
    align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    justify: z.enum(['start', 'center', 'end', 'spaceBetween']).optional(),
    zIndex: z.number().optional(),
  })
  .strict();

const styleSchema = z
  .object({
    background: z.string().optional(),
    color: z.string().optional(),
    padding: z.string().optional(),
    margin: z.string().optional(),
    radius: z.string().optional(),
    shadow: z.string().optional(),
    font: z.string().optional(),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional(),
    letterSpacing: z.string().optional(),
    opacity: z.number().optional(),
    border: z.string().optional(),
    minWidth: z.string().optional(),
    minHeight: z.string().optional(),
    maxWidth: z.string().optional(),
    maxHeight: z.string().optional(),
    textAlign: z.string().optional(),
    textTransform: z.string().optional(),
    position: z.string().optional(),
    cursor: z.string().optional(),
  })
  .strict();

export const bindingSchema = z
  .object({
    target: z.enum(BINDING_TARGETS),
    source: z.string(),
    format: z.string().optional(),
    transform: z.enum(BINDING_TRANSFORMS).optional(),
    fallback: z.unknown().optional(),
    attribute: z.string().optional(),
  })
  .strict();

export const actionBindingSchema = z
  .object({
    event: z.string(),
    action: z.enum(ACTION_IDS),
    payload: z.unknown().optional(),
  })
  .strict();

const animationSchema = z
  .object({
    type: z.enum(['fade', 'slide', 'pulse', 'none']),
    durationMs: z.number().optional(),
    direction: z.string().optional(),
  })
  .strict();

const nodeEditorMetadataSchema = z
  .object({
    label: z.string().optional(),
    locked: z.boolean().optional(),
  })
  .strict();

export const uiNodeSchema: z.ZodType<UiNodeInput> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      type: z.enum(UI_COMPONENT_TYPES),
      layout: layoutSchema.optional(),
      style: styleSchema.optional(),
      class: z.string().optional(),
      text: z.string().optional(),
      assetId: z.string().optional(),
      bindings: z.array(bindingSchema).optional(),
      actions: z.array(actionBindingSchema).optional(),
      animations: z.array(animationSchema).optional(),
      visible: z.boolean().optional(),
      children: z.array(uiNodeSchema).optional(),
      editor: nodeEditorMetadataSchema.optional(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
);

export interface UiNodeInput {
  id: string;
  type: (typeof UI_COMPONENT_TYPES)[number];
  layout?: z.infer<typeof layoutSchema>;
  style?: z.infer<typeof styleSchema>;
  class?: string;
  text?: string;
  assetId?: string;
  bindings?: z.infer<typeof bindingSchema>[];
  actions?: z.infer<typeof actionBindingSchema>[];
  animations?: z.infer<typeof animationSchema>[];
  visible?: boolean;
  children?: UiNodeInput[];
  editor?: z.infer<typeof nodeEditorMetadataSchema>;
  props?: Record<string, unknown>;
}

const transformSchema = z
  .object({
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
    scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
  })
  .strict();

export const sceneComponentSchema = z
  .object({
    type: z.enum([...SCENE_COMPONENT_TYPES, ...SCENE_RESERVED_COMPONENT_TYPES]),
    props: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const sceneEntitySchema: z.ZodType<SceneEntityInput> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      transform: transformSchema.optional(),
      components: z.array(sceneComponentSchema).min(1),
      children: z.array(sceneEntitySchema).optional(),
      editor: nodeEditorMetadataSchema.optional(),
    })
    .strict(),
);

export interface SceneEntityInput {
  id: string;
  transform?: z.infer<typeof transformSchema>;
  components: z.infer<typeof sceneComponentSchema>[];
  children?: SceneEntityInput[];
  editor?: z.infer<typeof nodeEditorMetadataSchema>;
}

const lightSchema = z
  .object({
    type: z.enum(['directional', 'hemisphere', 'point']),
    color: z.union([z.string(), z.number()]).optional(),
    intensity: z.number().optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    direction: z.tuple([z.number(), z.number(), z.number()]).optional(),
    groundColor: z.union([z.string(), z.number()]).optional(),
    distance: z.number().optional(),
  })
  .strict();

export const environmentSchema = z
  .object({
    background: z.union([z.string(), z.number()]).optional(),
    fog: z
      .object({
        color: z.union([z.string(), z.number()]),
        near: z.number(),
        far: z.number(),
      })
      .optional(),
    lights: z.array(lightSchema).optional(),
    postProcessPresetId: z.string().optional(),
    cameraId: z.string().optional(),
  })
  .strict();

const transitionSchema = z
  .object({
    type: z.enum(['fade', 'slide', 'none']),
    durationMs: z.number().optional(),
    direction: z.string().optional(),
  })
  .strict();

export const previewStateSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    context: z.record(z.string(), z.unknown()),
  })
  .strict();

export const sceneDefinitionSchema = z
  .object({
    id: idPrefix('scene.'),
    label: z.string(),
    type: z.enum(['ui', 'hybrid', 'gameplayOverlay']),
    root: uiNodeSchema,
    environment: environmentSchema.optional(),
    entities: z.array(sceneEntitySchema).optional(),
    cameras: z.array(transformSchema).optional(),
    audio: z
      .array(
        z
          .object({
            assetId: z.string(),
            loop: z.boolean().optional(),
            volume: z.number().optional(),
          })
          .strict(),
      )
      .optional(),
    enterTransition: transitionSchema.optional(),
    exitTransition: transitionSchema.optional(),
    previewStates: z.array(previewStateSchema).optional(),
    editor: nodeEditorMetadataSchema.optional(),
  })
  .strict();

export const hudDefinitionSchema = z
  .object({
    id: idPrefix('hud.'),
    label: z.string(),
    role: z.enum(['shared', 'driver', 'gunner']).optional(),
    themeId: idPrefix('theme.'),
    root: uiNodeSchema,
    previewStates: z.array(previewStateSchema).optional(),
  })
  .strict();

export const sceneFlowDefinitionSchema = z
  .object({
    id: idPrefix('flow.'),
    initialSceneId: z.string(),
    states: z
      .array(
        z
          .object({
            id: z.string(),
            sceneId: z.string(),
          })
          .strict(),
      )
      .min(1),
    transitions: z
      .array(
        z
          .object({
            from: z.string(),
            to: z.string(),
            action: z.enum(ACTION_IDS).optional(),
            event: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const themeDefinitionSchema = z
  .object({
    id: idPrefix('theme.'),
    label: z.string(),
    colors: z.record(z.string(), z.string()),
    spacing: z.record(z.string(), z.number()),
    typography: z.record(z.string(), z.string()).optional(),
    radii: z.record(z.string(), z.string()).optional(),
    shadows: z.record(z.string(), z.string()).optional(),
    motion: z.record(z.string(), z.number()).optional(),
    cssVariables: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const projectAssetKinds = ['model', 'image', 'texture', 'audio', 'vfx', 'uiTheme', 'postProcessPreset'] as const;

export const projectAssetDefinitionSchema = z
  .object({
    id: z.string(),
    kind: z.enum(projectAssetKinds),
    file: z.string().optional(),
    /**
     * Catalog-driven placeholder policy: when a project model has no file
     * (or its file fails), it resolves to this registered asset's
     * prototype instead of a hardcoded code path.
     */
    fallbackAssetId: z.string().optional(),
    namespace: z
      .enum(['custom', 'scene', 'environment', 'ui'])
      .describe('project asset namespace; built-in ids are protected'),
    replacesBuiltIn: z.string().optional(),
    defaultTransform: transformSchema.optional(),
    materialOverrides: z.record(z.string(), z.unknown()).optional(),
    sockets: z
      .array(
        z
          .object({
            id: z.string(),
            position: z.tuple([z.number(), z.number(), z.number()]).optional(),
            rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
          })
          .strict(),
      )
      .optional(),
    collider: z
      .object({
        radius: z.number().optional(),
        halfExtents: z.tuple([z.number(), z.number(), z.number()]).optional(),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
    lodRefs: z.array(z.string()).optional(),
    optional: z.boolean().optional(),
  })
  .strict();

export const assetCatalogDefinitionSchema = z
  .object({
    id: z.string(),
    builtins: z.array(z.string()),
    project: z.array(projectAssetDefinitionSchema),
  })
  .strict();

export type SceneDefinition = z.infer<typeof sceneDefinitionSchema>;
export type HudDefinition = z.infer<typeof hudDefinitionSchema>;
export type SceneFlowDefinition = z.infer<typeof sceneFlowDefinitionSchema>;
export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;
export type ProjectAssetDefinition = z.infer<typeof projectAssetDefinitionSchema>;
export type AssetCatalogDefinition = z.infer<typeof assetCatalogDefinitionSchema>;
export type UiNodeDefinition = z.infer<typeof uiNodeSchema>;
export type BindingDefinition = z.infer<typeof bindingSchema>;
export type ActionBindingDefinition = z.infer<typeof actionBindingSchema>;
export type TransitionDefinition = z.infer<typeof transitionSchema>;
export type PreviewStateDefinition = z.infer<typeof previewStateSchema>;
export type SceneEntityDefinition = z.infer<typeof sceneEntitySchema>;
export type PresentationEnvironmentDefinition = z.infer<typeof environmentSchema>;

export interface PresentationContentBundle {
  format: number;
  sourceHash: string;
  scenes: Record<string, SceneDefinition>;
  huds: Record<string, HudDefinition>;
  flows: Record<string, SceneFlowDefinition>;
  themes: Record<string, ThemeDefinition>;
  assets: AssetCatalogDefinition;
}
