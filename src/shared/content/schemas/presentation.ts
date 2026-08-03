import { z } from 'zod';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber } from './common';

const vfxEntry = z.object({
  id: z.string().regex(/^vfx\./, 'vfx id must start with vfx.'),
  color: nonNegativeInt,
  size: positiveNumber,
  life: nonNegativeNumber,
  count: positiveInt,
  speed: nonNegativeNumber,
  gravity: nonNegativeNumber,
});

const uiEntry = z.object({
  id: z.string().regex(/^ui\./, 'ui id must start with ui.'),
  name: z.string().min(1),
  primary: z.string().min(1),
  accent: z.string().min(1),
  secondary: z.string().min(1),
  panel: z.string().min(1),
  highlight: z.string().min(1),
});

const audioEntry = z.object({
  id: z.string().regex(/^audio\./, 'audio id must start with audio.'),
  kind: z.string().min(1),
  desc: z.string().min(1),
});

const iconEntry = z.object({
  id: z.string().regex(/^icon\./, 'icon id must start with icon.'),
  color: z.string().min(1),
  label: z.string().min(1),
});

const cameraImpulseEntry = z.object({
  id: z.string().regex(/^cameraImpulse\./, 'camera impulse id must start with cameraImpulse.'),
  shake: nonNegativeNumber,
});

export const presentationSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^presentation\./, 'presentation id must start with presentation.'),
  assets: z.object({
    models: z.array(z.string()).default([]),
    vfx: z.array(vfxEntry).default([]),
    ui: z.array(uiEntry).default([]),
    audio: z.array(audioEntry).default([]),
    icons: z.array(iconEntry).default([]),
    cameraImpulses: z.array(cameraImpulseEntry).default([]),
  }),
});

export type PresentationDefinition = z.infer<typeof presentationSchema>;
