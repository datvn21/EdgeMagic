export type DropInput =
  | { kind: "file"; name: string; size: number; mimeType: string; path?: string; file?: File }
  | { kind: "image"; dataUrl: string; name: string; mimeType: string }
  | { kind: "image-url"; url: string; name: string }
  | { kind: "url"; value: string }
  | { kind: "text"; value: string };

export type CaptureDestination = "clipboard" | "notes" | "todo" | "reminder" | "saved";

export function resolveCaptureDestination(moduleId: string): CaptureDestination {
  if (moduleId === "notes" || moduleId === "todo" || moduleId === "reminder" || moduleId === "saved" || moduleId === "library") {
    return moduleId === "library" ? "saved" : moduleId;
  }
  return "clipboard";
}

export function readDropInputs(dataTransfer: DataTransfer): DropInput[] {
  const inputs: DropInput[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    const nativePath = (file as File & { path?: string }).path;
    inputs.push({ kind: "file", name: file.name, size: file.size, mimeType: file.type, ...(nativePath ? { path: nativePath } : {}), file });
  }

  const uri = dataTransfer.getData("text/uri-list")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !value.startsWith("#"));
  if (uri?.startsWith("data:image/")) {
    inputs.push({ kind: "image", dataUrl: uri, name: imageName(uri), mimeType: imageMimeType(uri) });
  } else if (uri) {
    // Check if this URL points to an image (web image drag from browser)
    const html = dataTransfer.getData("text/html");
    const imgSrc = html ? extractImgSrc(html) : null;
    const resolvedUrl = imgSrc ?? uri;
    if (isImageUrl(resolvedUrl)) {
      inputs.push({ kind: "image-url", url: resolvedUrl, name: imageNameFromUrl(resolvedUrl) });
    } else {
      inputs.push({ kind: "url", value: uri });
    }
  } else {
    // Browser selection drags commonly expose text/html first and may omit
    // text/plain in a WebView. Preserve readable text as a final fallback.
    const plainText = dataTransfer.getData("text/plain").trim();
    const html = dataTransfer.getData("text/html");
    const htmlText = html ? new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "" : "";
    const text = plainText || htmlText;
    if (text?.startsWith("data:image/")) {
      inputs.push({ kind: "image", dataUrl: text, name: imageName(text), mimeType: imageMimeType(text) });
    } else if (text) {
      inputs.push({ kind: "text", value: text });
    }
  }
  return inputs;
}

function imageMimeType(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";
}

function imageName(dataUrl: string): string {
  const extension = imageMimeType(dataUrl).split("/")[1] ?? "png";
  return `dropped-image.${extension}`;
}

function imageNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").at(-1) ?? "image";
    return filename || "dropped-image.jpg";
  } catch {
    return "dropped-image.jpg";
  }
}

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?)(?:[?#].*)?$/i;

function isImageUrl(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  try {
    const { pathname } = new URL(url);
    return IMAGE_EXTENSIONS.test(pathname);
  } catch {
    return false;
  }
}

function extractImgSrc(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("img");
    const src = img?.src ?? img?.getAttribute("src");
    return src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:image/")) ? src : null;
  } catch {
    return null;
  }
}

export function readNativeFileInputs(paths: string[]): Array<Extract<DropInput, { kind: "file" }>> {
  return paths
    .filter((path) => path.trim().length > 0)
    .map((path) => ({
      kind: "file" as const,
      name: path.split(/[\\/]/).pop() ?? path,
      size: 0,
      mimeType: "application/octet-stream",
      path
    }));
}
