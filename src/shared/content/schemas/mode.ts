import { z } from 'zod';
import { commonDefinition } from './common';

export const modeSessionPolicySchema = z
  .object({
    kind: z.enum(['multiplayer', 'singlePlayer']),
    networkRequired: z.boolean(),
    controlScheme: z.enum(['assignedRole', 'combinedDriverAndGunner']),
    showRoleIdentity: z.boolean(),
    showPeerStatus: z.boolean(),
    allowRoleSwap: z.boolean(),
    resultsFlow: z.enum(['crewRematchVote', 'localRestart']),
  })
  .superRefine((policy, ctx) => {
    const single = policy.kind === 'singlePlayer';
    if (single && policy.controlScheme === 'assignedRole') {
      ctx.addIssue({ code: 'custom', message: 'singlePlayer requires controlScheme combinedDriverAndGunner' });
    }
    if (single && policy.networkRequired) {
      ctx.addIssue({ code: 'custom', message: 'singlePlayer cannot require a network' });
    }
    if (single && policy.allowRoleSwap) {
      ctx.addIssue({ code: 'custom', message: 'singlePlayer cannot allow role swap' });
    }
    if (single && policy.resultsFlow === 'crewRematchVote') {
      ctx.addIssue({ code: 'custom', message: 'singlePlayer cannot use crewRematchVote' });
    }
    if (policy.kind === 'multiplayer' && policy.controlScheme === 'combinedDriverAndGunner') {
      ctx.addIssue({ code: 'custom', message: 'multiplayer requires controlScheme assignedRole' });
    }
    if (policy.kind === 'multiplayer' && policy.resultsFlow === 'localRestart') {
      ctx.addIssue({ code: 'custom', message: 'multiplayer cannot use localRestart' });
    }
  });

export type ModeSessionPolicy = z.infer<typeof modeSessionPolicySchema>;

export const modeSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^mode\./, 'mode id must start with mode.'),
  mapProfileId: z
    .string()
    .regex(/^map\./, 'mapProfileId must reference a map definition')
    .optional(),
  difficulty: z.string().regex(/^difficulty\./, 'difficulty must reference a difficulty definition'),
  tank: z.string().regex(/^tank\./, 'tank must reference a tank definition'),
  loadout: z.string().regex(/^loadout\./, 'loadout must reference a loadout definition'),
  objectives: z.array(z.string().regex(/^objective\./, 'objectives must reference objective definitions')).min(1),
  spawnDirector: z.string().regex(/^spawn\./, 'spawnDirector must reference a spawn director'),
  scoring: z.string().regex(/^scoring\./, 'scoring must reference a scoring definition'),
  results: z.string().regex(/^results\./, 'results must reference a results definition'),
  presentation: z.string().regex(/^presentation\./, 'presentation must reference a presentation definition'),
  session: modeSessionPolicySchema.optional(),
  /** Capabilities every match of this mode starts with (Combat 05). */
  defaultCapabilities: z.array(z.string().min(1)).optional(),
  rematch: z
    .object({
      modifiers: z.array(z.string().regex(/^difficulty\./, 'rematch modifiers must reference difficulty definitions')),
    })
    .optional(),
});

export type ModeDefinition = z.infer<typeof modeSchema>;
