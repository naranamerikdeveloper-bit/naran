// Shared image upload helpers for the admin. Pictures are downscaled and
// converted to WebP in the browser before they leave the machine, so a 6MB
// phone photo becomes ~100KB and the shop's pages stay fast.

const MAX_W = 1200, MAX_H = 1500, QUALITY = 0.86;

/** Downscale + convert to WebP in the browser; falls back to the original file. */
export async function optimizeImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, "image/webp", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file; // unsupported format / no canvas → upload as-is
  }
}

/** Upload files to Medusa's file service and return their public URLs. */
export async function uploadImages(files: File[]): Promise<string[]> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any)?.message || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => f.url).filter(Boolean);
}
