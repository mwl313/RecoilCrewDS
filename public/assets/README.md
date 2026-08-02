# Custom assets

Drop replacement models and other overrides here and list them in
`manifest.json` (see `ASSET_GUIDE.md` for the full format).

Example manifest:

```json
{
  "assets": [
    { "id": "enemy.rammer", "category": "model", "file": "/assets/models/rammer.glb" }
  ]
}
```

An empty `manifest.json` ships with the repo so the client never requests a
missing file. If you delete it, the game still works (generated fallbacks are
used), but the browser logs a harmless 404.
