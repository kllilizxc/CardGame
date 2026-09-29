export type UnitArt = 'fox' | 'eagle' | 'disc' | 'sage' | 'turtle' | 'wolf' | 'ghost';
export type BattleSide = 'me' | 'foe';
export const UNIT_ART: Record<UnitArt, { w: number; h: number; ax: number; ay: number }> = {
    fox: { w: 120, h: 96, ax: 60, ay: 92 },
    eagle: { w: 120, h: 104, ax: 56, ay: 100 },
    disc: { w: 120, h: 136, ax: 56, ay: 132 },
    sage: { w: 136, h: 156, ax: 64, ay: 150 },
    turtle: { w: 120, h: 96, ax: 60, ay: 92 },
    wolf: { w: 128, h: 112, ax: 64, ay: 108 },
    ghost: { w: 128, h: 144, ax: 70, ay: 136 },
};
const units: Record<string, UnitArt> = {
    CR_001: 'fox', CR_002: 'disc', CR_003: 'eagle', CR_004: 'disc', CR_005: 'turtle',
    CR_006: 'disc', CR_007: 'wolf', CR_008: 'disc', CR_009: 'sage', CR_010: 'disc',
    CR_HIGH_001: 'disc', CR_HIGH_002: 'sage', SX_YJZ_001: 'disc', SX_YJS_001: 'disc',
    SX_TY_001: 'disc', SX_JXTM_001: 'disc', SX_JYNX_001: 'sage',
};
/** Exact content identities; unknown beasts must never silently become a fox. */
export function unitArt(id: string): UnitArt | undefined { return units[id]; }
export const BATTLE_SLOTS = {
    me: [[30, 58], [54, 77], [78, 97]],
    foe: [[-30, 58], [-54, 77], [-78, 97]],
} as const;
/** Original prototype camera in its 640 × 360 logical viewport. */
export function project(x: number, z: number, camera = { x: 0, z: 0 }, lift = 0) {
    const k = 240 / Math.max(2, z - camera.z);
    return { x: 320 + (x - camera.x) * k, y: 80 + (40 - lift) * k };
}
export function slotPosition(side: BattleSide, index: number, camera = { x: 0, z: 0 }) {
    const [x, z] = BATTLE_SLOTS[side][Math.max(0, Math.min(2, index))];
    return project(x, z, camera);
}
