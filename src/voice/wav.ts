export const wavHeaderBytes = 44;
export const wavBytesPerSample = 2;

export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * wavBytesPerSample;
  const bytes = new Uint8Array(wavHeaderBytes + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, wavHeaderBytes - 8 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * wavBytesPerSample, true);
  view.setUint16(32, wavBytesPerSample, true);
  view.setUint16(34, 8 * wavBytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index++) {
    view.setInt16(
      wavHeaderBytes + index * wavBytesPerSample,
      toInt16(samples[index]!),
      true,
    );
  }
  return bytes;
}

export type WavFormat = {
  format: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  bitsPerSample: number;
  dataBytes: number;
};

export function wavSeconds(bytes: ArrayBuffer): number | undefined {
  const format = readWavFormat(bytes);
  return format === undefined || format.byteRate === 0
    ? undefined
    : format.dataBytes / format.byteRate;
}

export function readWavFormat(bytes: ArrayBuffer): WavFormat | undefined {
  const view = new DataView(bytes);
  if (
    view.byteLength < wavHeaderBytes ||
    readAscii(view, 0) !== "RIFF" ||
    readAscii(view, 8) !== "WAVE"
  ) {
    return undefined;
  }
  let fmt: Omit<WavFormat, "dataBytes"> | undefined;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = readAscii(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= view.byteLength) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    }
    if (id === "data") {
      return fmt && body + size <= view.byteLength
        ? { ...fmt, dataBytes: size }
        : undefined;
    }
    offset = body + size + (size % 2);
  }
  return undefined;
}

function readAscii(view: DataView, offset: number): string {
  let text = "";
  for (let index = offset; index < offset + 4; index++) {
    text += String.fromCharCode(view.getUint8(index));
  }
  return text;
}

function toInt16(sample: number): number {
  if (Number.isNaN(sample)) return 0;
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
