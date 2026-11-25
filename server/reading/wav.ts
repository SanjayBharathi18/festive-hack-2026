export type Wav = {
  seconds: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

const pcm = 1;
const float = 3;
const extensible = 0xfffe;

export function readWav(bytes: Uint8Array): Wav | undefined {
  if (bytes.length < 12) return undefined;
  if (ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format:
    | (Omit<Wav, "seconds"> & {
        code: number;
        byteRate: number;
        blockAlign: number;
      })
    | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt " && size >= 16 && start + 16 <= bytes.length) {
      format = {
        code: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        byteRate: view.getUint32(start + 8, true),
        blockAlign: view.getUint16(start + 12, true),
        bitsPerSample: view.getUint16(start + 14, true),
      };
    }
    if (id === "data") {
      const frameBytes = format && frameSize(format);
      if (format === undefined || frameBytes === undefined) return undefined;
      const { channels, sampleRate, bitsPerSample } = format;
      const dataBytes = Math.min(size, bytes.length - start);
      return {
        seconds: dataBytes / (sampleRate * frameBytes),
        sampleRate,
        channels,
        bitsPerSample,
      };
    }
    offset = start + size + (size % 2);
  }
  return undefined;
}

function frameSize({
  code,
  channels,
  sampleRate,
  bitsPerSample,
  byteRate,
  blockAlign,
}: Omit<Wav, "seconds"> & {
  code: number;
  byteRate: number;
  blockAlign: number;
}): number | undefined {
  const frameBytes = channels * (bitsPerSample / 8);
  const valid =
    [pcm, float, extensible].includes(code) &&
    channels > 0 &&
    sampleRate > 0 &&
    bitsPerSample > 0 &&
    bitsPerSample % 8 === 0 &&
    blockAlign === frameBytes &&
    byteRate === sampleRate * frameBytes;
  return valid ? frameBytes : undefined;
}

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}
