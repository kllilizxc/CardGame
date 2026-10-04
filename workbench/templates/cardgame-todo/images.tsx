import { Modal } from "@heroui/react";
import React, { useState } from "react";
import type { TodoImage } from "./actions";

export const MAX_PASTED_IMAGES = 3;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 600_000;
const MAX_TOTAL_LENGTH = 900_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function mergePastedImages(current: TodoImage[], additions: TodoImage[]): TodoImage[] {
  const next = [...current, ...additions];
  if (next.length > MAX_PASTED_IMAGES) throw new Error(`最多添加 ${MAX_PASTED_IMAGES} 张图片`);
  if (next.reduce((size, image) => size + image.dataUrl.length, 0) > MAX_TOTAL_LENGTH)
    throw new Error("图片附件总大小过大，请减少图片数量或换小图");
  return next;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解析这张图片"));
    image.src = dataUrl;
  });
}

async function convertClipboardImage(file: File, index: number): Promise<TodoImage> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("仅支持 PNG、JPG、WebP 或 GIF 图片");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("图片文件过大，请先压缩后再粘贴");
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  const sourceMax = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = sourceMax > 1600 ? 1600 / sourceMax : 1;
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  // Preserve a small animated GIF. Other images use bounded canvas output.
  let dataUrl = file.type === "image/gif" && sourceUrl.length <= MAX_DATA_URL_LENGTH ? sourceUrl : "";
  if (!dataUrl) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法处理图片");
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL("image/webp", 0.88);
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) dataUrl = canvas.toDataURL("image/jpeg", 0.68);
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) throw new Error("图片压缩后仍然过大，请换一张图片");
  return {
    id: `image-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl,
    name: file.name || "clipboard-image",
    type: dataUrl.slice(5, dataUrl.indexOf(";")) as TodoImage["type"],
    width,
    height,
  };
}

export async function pasteClipboardImages(event: React.ClipboardEvent<HTMLElement>): Promise<TodoImage[]> {
  const files = Array.from(event.clipboardData.items)
    .filter(item => IMAGE_TYPES.has(item.type))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (!files.length) return [];
  event.preventDefault();
  return Promise.all(files.slice(0, MAX_PASTED_IMAGES).map(convertClipboardImage));
}

const IMAGE_CSS = `
.cardgame-image-strip{display:flex;flex-wrap:wrap;gap:6px;min-width:0;margin:6px 0}
.cardgame-image-thumb{position:relative;width:62px;height:46px;margin:0;overflow:hidden;border:1px solid var(--wb-line);border-radius:5px;background:var(--wb-surface-deep)}
.cardgame-image-strip.is-compact .cardgame-image-thumb{width:34px;height:26px}
.cardgame-image-thumb:focus-within{outline:2px solid var(--wb-accent);outline-offset:2px}
.cardgame-image-preview{display:block;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:zoom-in}
.cardgame-image-preview:focus-visible{outline:none}
.cardgame-image-preview img{display:block;width:100%;height:100%;object-fit:cover}
.cardgame-image-remove{position:absolute;top:1px;right:1px;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:var(--wb-ink);color:var(--wb-paper);font-size:14px;line-height:16px;cursor:pointer}
.cardgame-image-strip.is-compact .cardgame-image-remove{width:14px;height:14px;font-size:11px;line-height:12px}
.cardgame-image-modal-dialog{background:var(--wb-paper);color:var(--wb-ink);box-shadow:var(--wb-shadow-popover);border-radius:var(--wb-radius)}
`;

export function ImageAttachments({ images, onRemove, compact = false }: {
  images?: TodoImage[];
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  const [previewImage, setPreviewImage] = useState<TodoImage | null>(null);
  const validImages = (images ?? []).filter(image => typeof image?.dataUrl === "string" && image.dataUrl.startsWith("data:image/"));
  if (!validImages.length) return null;
  return <>
    <style>{IMAGE_CSS}</style>
    <div className={`cardgame-image-strip ${compact ? "is-compact" : ""}`} aria-label={`${validImages.length} 张图片`}>
      {validImages.map((image, index) => <figure className="cardgame-image-thumb" key={image.id || `${index}-${image.dataUrl.slice(0, 24)}`}>
        <button type="button" className="cardgame-image-preview" aria-label={`放大预览：${image.name || `图片 ${index + 1}`}`}
          aria-haspopup="dialog" onClick={event => { event.stopPropagation(); setPreviewImage(image); }}>
          <img src={image.dataUrl} alt="" loading="lazy" />
        </button>
        {onRemove && <button type="button" className="cardgame-image-remove" aria-label={`移除图片 ${index + 1}`}
          onClick={event => { event.stopPropagation(); onRemove(image.id); }}>×</button>}
      </figure>)}
    </div>
    <Modal isOpen={Boolean(previewImage)} onOpenChange={isOpen => { if (!isOpen) setPreviewImage(null); }}>
      <Modal.Backdrop variant="blur" onClick={event => event.stopPropagation()}>
        <Modal.Container placement="center" size="md">
          <Modal.Dialog aria-label="图片预览" className="cardgame-image-modal-dialog"
            style={{ width: "fit-content", minWidth: 180, minHeight: 120, maxWidth: "min(94vw, 1200px)", maxHeight: "94dvh", padding: "34px 10px 10px" }}>
            <Modal.CloseTrigger aria-label="关闭图片预览" style={{ position: "absolute", top: 8, right: 8 }} />
            <Modal.Body style={{ display: "grid", placeItems: "center", minWidth: 160, minHeight: 80, padding: 0, maxWidth: "calc(94vw - 20px)", maxHeight: "calc(94dvh - 44px)", overflow: "hidden" }}>
              {previewImage && <img src={previewImage.dataUrl} alt={previewImage.name || "图片预览"}
                style={{ display: "block", width: "auto", height: "auto", maxWidth: "calc(94vw - 40px)", maxHeight: "calc(88dvh - 48px)", objectFit: "contain", borderRadius: 4 }} />}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  </>;
}
