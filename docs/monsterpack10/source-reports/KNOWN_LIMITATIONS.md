# Known Limitations

- Actual safe horde counts must be measured after integration into the target game.
- The GLBs use vertex colours through one opaque material; the destination renderer must preserve glTF vertex-colour input.
- Only the 15 models that passed the common-eligibility policy receive near, far, and aggregate tiers. The other 30 intentionally remain hero-only.
- Common-far and aggregate files are rigid representative-pose proxies and do not contain skeletons or animation clips.
- Aggregate meshes are deliberately coarse distant silhouettes and are unsuitable for close-up presentation.
- Scale profiles and visible-count guidance are recommendations; collision, VFX, behaviour, and engine-specific import settings are outside this library.
- The official pack page advertises 50 models, while this local source folder contains 45 GLBs. The pipeline processes only the verified local files.
