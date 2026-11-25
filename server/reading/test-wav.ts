export type WavShape = {
  rate?: number;
  channels?: number;
  bits?: number;
  format?: number;
  level?: number;
};

export function wavBytes(
  seconds: number,
  {
    rate = 16_000,
    channels = 1,
    bits = 16,
    format = 1,
    level = 0.2,
  }: WavShape = {},
): Uint8Array<ArrayBuffer> {
  const blockAlign = channels * (bits / 8);
  const frames = Math.round(seconds * rate);
  const dataBytes = frames * blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  if (bits === 16) {
    for (let frame = 0; frame < frames; frame += 1) {
      const sample = Math.round(
        level * 32767 * Math.sin((2 * Math.PI * 220 * frame) / rate),
      );
      for (let channel = 0; channel < channels; channel += 1) {
        view.setInt16(44 + frame * blockAlign + channel * 2, sample, true);
      }
    }
  }
  return bytes;
}
