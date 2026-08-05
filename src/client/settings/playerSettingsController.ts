import type { ClientPlayerSettingsV1, PlayerSettingsStore } from './playerSettingsStore';
import { validateNickname, type NicknameValidationResult } from '../../shared/lobby/nicknameValidation';
import { generateDefaultNickname } from '../../shared/lobby/nicknamePool';

/**
 * Settings editing controller: draft-only Randomize, Save on demand, Cancel
 * discards the draft. SAVE writes once; keystrokes never persist.
 */
export class PlayerSettingsController {
  private saved: ClientPlayerSettingsV1;
  private draft: string;
  private lastValidation: NicknameValidationResult;

  constructor(private readonly store: PlayerSettingsStore) {
    this.saved = store.load();
    this.draft = this.saved.nickname;
    this.lastValidation = validateNickname(this.draft);
  }

  get currentNickname(): string {
    return this.saved.nickname;
  }

  get draftNickname(): string {
    return this.draft;
  }

  setDraft(value: string): NicknameValidationResult {
    this.draft = value;
    this.lastValidation = validateNickname(value);
    return this.lastValidation;
  }

  randomize(): string {
    this.draft = generateDefaultNickname();
    this.lastValidation = validateNickname(this.draft);
    return this.draft;
  }

  /** Validate + persist the draft; returns the validation result. */
  save(): NicknameValidationResult {
    const result = validateNickname(this.draft);
    if (!result.valid) {
      this.lastValidation = result;
      return result;
    }
    this.saved = { version: 1, nickname: result.normalized };
    this.store.save(this.saved);
    this.draft = result.normalized;
    this.lastValidation = result;
    return result;
  }

  /** Discard the draft; returns the previous saved nickname. */
  cancel(): string {
    this.draft = this.saved.nickname;
    this.lastValidation = validateNickname(this.draft);
    return this.saved.nickname;
  }

  get validation(): NicknameValidationResult {
    return this.lastValidation;
  }
}
