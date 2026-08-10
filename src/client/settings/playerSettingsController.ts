import type { ClientPlayerSettingsV2, PlayerSettingsStore } from './playerSettingsStore';
import { validateNickname, type NicknameValidationResult } from '../../shared/lobby/nicknameValidation';
import { generateDefaultNickname } from '../../shared/lobby/nicknamePool';
import type { Locale } from '../localization/localizationTypes';

export class PlayerSettingsController {
  private saved: ClientPlayerSettingsV2;
  private draft: ClientPlayerSettingsV2;
  private lastValidation: NicknameValidationResult;

  constructor(private readonly store: PlayerSettingsStore) {
    this.saved = store.load();
    this.draft = { ...this.saved };
    this.lastValidation = validateNickname(this.draft.nickname);
  }

  get current(): Readonly<ClientPlayerSettingsV2> { return this.saved; }
  get draftSettings(): Readonly<ClientPlayerSettingsV2> { return this.draft; }
  get currentNickname(): string { return this.saved.nickname; }
  get draftNickname(): string { return this.draft.nickname; }
  get currentLocale(): Locale { return this.saved.locale; }
  get draftLocale(): Locale { return this.draft.locale; }
  get draftBgmVolume(): number { return this.draft.bgmVolume; }
  get draftSfxVolume(): number { return this.draft.sfxVolume; }

  beginEdit(): Readonly<ClientPlayerSettingsV2> {
    this.draft = { ...this.saved };
    this.lastValidation = validateNickname(this.draft.nickname);
    return this.draft;
  }

  setDraft(value: string): NicknameValidationResult {
    this.draft = { ...this.draft, nickname: value };
    this.lastValidation = validateNickname(value);
    return this.lastValidation;
  }

  setDraftLocale(locale: Locale): void { this.draft = { ...this.draft, locale }; }
  setDraftBgmVolume(value: number): void { this.draft = { ...this.draft, bgmVolume: clampVolume(value) }; }
  setDraftSfxVolume(value: number): void { this.draft = { ...this.draft, sfxVolume: clampVolume(value) }; }

  randomize(): string {
    this.draft = { ...this.draft, nickname: generateDefaultNickname() };
    this.lastValidation = validateNickname(this.draft.nickname);
    return this.draft.nickname;
  }

  save(): NicknameValidationResult {
    const result = validateNickname(this.draft.nickname);
    if (!result.valid) {
      this.lastValidation = result;
      return result;
    }
    this.saved = { ...this.draft, version: 2, nickname: result.normalized };
    this.store.save(this.saved);
    this.draft = { ...this.saved };
    this.lastValidation = result;
    return result;
  }

  cancel(): Readonly<ClientPlayerSettingsV2> {
    this.draft = { ...this.saved };
    this.lastValidation = validateNickname(this.draft.nickname);
    return this.saved;
  }

  get validation(): NicknameValidationResult { return this.lastValidation; }
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 100;
}
