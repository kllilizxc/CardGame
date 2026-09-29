export interface PixelSurface { w: number; h: number; o: HTMLCanvasElement; ox: CanvasRenderingContext2D }
export interface WenxinMaterials {
    monster(px: PixelSurface, key: string, pose: Record<string, unknown>): HTMLCanvasElement;
    portrait(px: PixelSurface, kind: string, pose: Record<string, unknown>): HTMLCanvasElement;
    cardArt(card: { mon?: string; theme: string; key: string }): HTMLCanvasElement;
    background(kind: string, w: number, h: number): HTMLCanvasElement;
    sea(w: number, h: number): HTMLCanvasElement;
    floor(slots: Record<string, readonly (readonly number[])[]>): HTMLCanvasElement;
    prop(kind: string, w: number, h: number, seed?: number): HTMLCanvasElement;
    flyingSword(ctx: CanvasRenderingContext2D, x: number, y: number): void;
    casket(px: PixelSurface, open: number): HTMLCanvasElement;
}
export function loadWenxinMaterials(baseUrl?: string): Promise<WenxinMaterials>;
