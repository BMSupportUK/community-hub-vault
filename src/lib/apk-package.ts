import { unzipSync } from "fflate";

export function validAndroidPackage(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value);
}

/** Read only the manifest package attribute, never infer identity from the app's display name. */
export function manifestPackage(bytes: Uint8Array): string | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const strings: string[] = [];
    const decoder = new TextDecoder();
    const length8 = (at: number): [number, number] => {
      const first = view.getUint8(at);
      return first & 0x80 ? [((first & 0x7f) << 8) | view.getUint8(at + 1), at + 2] : [first, at + 1];
    };
    if (view.getUint16(0, true) !== 3) return null;
    for (let offset = view.getUint16(2, true); offset + 8 <= bytes.length;) {
      const type = view.getUint16(offset, true);
      const header = view.getUint16(offset + 2, true);
      const size = view.getUint32(offset + 4, true);
      if (size < header || header < 8 || offset + size > bytes.length) return null;
      if (type === 1) {
        const count = view.getUint32(offset + 8, true);
        const utf8 = (view.getUint32(offset + 16, true) & 0x100) !== 0;
        const start = offset + view.getUint32(offset + 20, true);
        for (let i = 0; i < count; i++) {
          let at = start + view.getUint32(offset + header + i * 4, true);
          if (utf8) {
            [, at] = length8(at);
            const [length, textAt] = length8(at);
            strings.push(decoder.decode(bytes.subarray(textAt, textAt + length)));
          } else {
            let length = view.getUint16(at, true); at += 2;
            if (length & 0x8000) { length = ((length & 0x7fff) << 16) | view.getUint16(at, true); at += 2; }
            strings.push(new TextDecoder("utf-16le").decode(bytes.subarray(at, at + length * 2)));
          }
        }
      } else if (type === 0x102) {
        const ext = offset + header;
        if (strings[view.getUint32(ext + 4, true)] === "manifest") {
          const start = ext + view.getUint16(ext + 8, true);
          const stride = view.getUint16(ext + 10, true);
          const count = view.getUint16(ext + 12, true);
          if (stride < 20) return null;
          for (let i = 0; i < count; i++) {
            const at = start + i * stride;
            if (view.getUint32(at, true) !== 0xffffffff || strings[view.getUint32(at + 4, true)] !== "package") continue;
            const raw = view.getUint32(at + 8, true);
            const value = strings[raw === 0xffffffff && view.getUint8(at + 15) === 3 ? view.getUint32(at + 16, true) : raw];
            return validAndroidPackage(value) ? value : null;
          }
        }
      }
      offset += size;
    }
  } catch { /* An invalid archive must not become a shell command. */ }
  return null;
}

export function apkPackage(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes, { filter: (entry) => entry.name === "AndroidManifest.xml" && entry.originalSize <= 2 * 1024 * 1024 });
    const manifest = files["AndroidManifest.xml"];
    return manifest ? manifestPackage(manifest) : null;
  } catch { return null; }
}