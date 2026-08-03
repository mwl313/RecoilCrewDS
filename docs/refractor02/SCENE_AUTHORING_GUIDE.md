# Refractor 02 — Scene Authoring Guide

Scenes live in `content/scenes/*.json`, are validated by Zod + reference
checks, and are compiled into `src/generated/presentationContent.generated.ts`
by `npm run generate:presentation-content`.

## Scene document model

```json
{
  "id": "scene.credits",
  "label": "Credits",
  "type": "ui",
  "enterTransition": { "type": "fade", "durationMs": 180 },
  "root": {
    "id": "screen-credits",
    "type": "container",
    "class": "screen",
    "children": [
      {
        "id": "credits-panel",
        "type": "panel",
        "class": "panel",
        "children": [
          { "id": "credits-title", "type": "text", "props": { "tag": "h2" }, "text": "CREDITS" },
          { "id": "credits-body", "type": "text", "props": { "tag": "p" }, "text": "Designed, engineered, and playtested by the Recoil Crew." },
          { "id": "credits-back", "type": "button", "class": "btn ghost", "props": { "dataAct": "back" }, "text": "BACK", "actions": [{ "event": "click", "action": "app.back" }] }
        ]
      }
    ]
  },
  "previewStates": [{ "id": "idle", "label": "Idle", "context": {} }]
}
```

## Adding a scene

1. Create `content/scenes/<name>.json` with a unique `scene.*` id and a
   stable root node id (e.g. `screen-credits`).
2. Add nodes using registered component types: `container`, `panel`,
   `text`, `button`, `input`, `horizontal`, `vertical`, `grid`, `spacer`,
   `conditional`, `repeater`, `progressBar`, `image`.
3. Actions reference allowlisted ids only (`app.enter`, `app.back`,
   `app.createCrew`, `app.pause`, ...). Behavior is code-owned in
   `SceneFlowPresenter` + `main.ts` handlers.
4. Bindings read from the scene's context (`code`, `status`, `message`,
   `value`, `sub`, `score`, `title`, `grade`, `stats`, `modifiers`, ...) —
   never from `MatchState`.
5. Add a flow state in `content/scene-flows/primary.json` if the scene is a
   navigation target.
6. Run `npm run generate:presentation-content` and `npm test`.

## Hybrid scenes (3D background)

```json
{
  "id": "scene.credits",
  "label": "Credits",
  "type": "hybrid",
  "environment": {
    "background": "#0b1216",
    "lights": [
      { "type": "hemisphere", "color": "#7fb2c9", "groundColor": "#1c1512", "intensity": 0.9 },
      { "type": "directional", "color": "#ffd9a0", "intensity": 1.5, "direction": [0.35, 0.8, 0.4] }
    ]
  },
  "entities": [
    {
      "id": "creditsTank",
      "transform": { "position": [0, -1.4, 0], "rotation": [0, 0.6, 0], "scale": [1.2, 1.2, 1.2] },
      "components": [
        { "type": "model", "props": { "assetId": "playerTank.chassis" } },
        { "type": "rotateAnimation", "props": { "speed": 0.12 } },
        { "type": "floatAnimation", "props": { "amplitude": 0.35, "speed": 0.8 } }
      ]
    }
  ]
}
```

Supported presentation components: `model`, `camera`, `directionalLight`,
`hemisphereLight`, `pointLight`, `rotateAnimation`, `floatAnimation`,
`lookAt`, `audioSource` (metadata only), `postProcessPreset` (metadata only),
`particleEmitter`, `billboard`.

Hybrid scenes never instantiate gameplay. `PresentationWorld` is disposed
when the scene is left; `?lowq=1` or `prefers-reduced-motion` disables the
3D background.

## Inspecting and previewing

- `npm run dev:presentation-preview` — scene/HUD selectors, preview states,
  role/theme selectors, resolution presets, component hierarchy, binding
  and asset diagnostics, hybrid toggle.
- `?stable=1` disables animations for screenshot-friendly output.

## Validation rules

- Unique scene ids, unique node ids within a document, no cycles, depth
  ≤ 24, ≤ 500 nodes.
- Component types, actions, transforms, binding sources, themes, and asset
  references must be registered/known.
- Every `previewStates` context is available to the preview tool.
