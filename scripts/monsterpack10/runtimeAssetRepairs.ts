import { rewriteGlbNodeTransform } from './glbSummary';

/**
 * Runtime-only corrections for source exports that passed the Blender-side
 * checks but violate the glTF/Three.js pose contract. Source evidence and
 * hashes stay untouched; the importer applies these only to copied assets.
 */
export function repairMonsterRuntimeAsset(variantId: string, buffer: Buffer): Buffer {
  switch (variantId) {
    case 'model.quaternius.demon-high-detail.hero':
      // The Demon source uses +Z-down for the animated humanoid. Convert it
      // to Three.js +Y-up with a +90° X rotation, then recenter and ground the
      // corrected idle pose. The previous -90° repair grounded the bounds but
      // inverted the skeleton (feet above hips and head below hips).
      return rewriteGlbNodeTransform(buffer, 'HordeReadyContent', {
        translation: [1.6624350365630063, 1.5830285080588224, -0.07571140766835616],
        rotation: [0.7071067811865475, 0, 0, 0.7071067811865476],
        scale: [0.6827593445777893, 0.6827593445777893, 0.6827593445777893],
      });
    case 'model.quaternius.orc.hero':
      // Skin bind translation was not included in the exported wrapper's
      // recentering calculation; align the idle feet and horizontal center.
      return rewriteGlbNodeTransform(buffer, 'HordeReadyContent', {
        translation: [1.247995309110027, 1.1545574475341405, -0.21491911010923577],
        scale: [0.6556596755981445, 0.6556596755981445, 0.6556596755981445],
      });
    case 'model.quaternius.mushroom-king.hero':
      return rewriteGlbNodeTransform(buffer, 'HordeReadyContent', {
        translation: [1.1302224025992007, 1.0370591803278169, -0.1595938489803172],
        scale: [0.5855790376663208, 0.5855790376663208, 0.5855790376663208],
      });
    default:
      return buffer;
  }
}
