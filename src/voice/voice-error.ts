export const voiceErrorCodes = [
  "mic_denied",
  "mic_missing",
  "mic_busy",
  "mic_unsupported",
  "too_long",
  "too_short",
  "too_big",
  "cannot_decode",
] as const;

export type VoiceErrorCode = (typeof voiceErrorCodes)[number];

export type VoiceError = Error & {
  code: VoiceErrorCode;
  params: Readonly<Record<string, number>>;
};

const voiceErrorMark = Symbol("voiceError");

export function voiceError(
  code: VoiceErrorCode,
  params: Readonly<Record<string, number>> = {},
  cause?: unknown,
): VoiceError {
  return Object.assign(new Error(`Voice: ${code}`, { cause }), {
    name: "VoiceError",
    code,
    params,
    [voiceErrorMark]: true,
  });
}

export function isVoiceError(error: unknown): error is VoiceError {
  return error instanceof Error && voiceErrorMark in error;
}
