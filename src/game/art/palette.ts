/**
 * "Ink & Ember" — the single 32-colour palette the whole game is drawn with.
 * A full-screen post shader (PaletteFX) snaps every rendered pixel to these colours,
 * so anything drawn anywhere automatically belongs to the same world.
 */
export const PALETTE: readonly number[] = [
    0x0b0714, 0x160f26, 0x221a3d, 0x32285a, 0x4a3c7a, 0x6c5f9c, 0x9a8fbf, 0xcfc6dd,
    0xf4ecd8, 0xd6c39a, 0xa88a62, 0x6e4e3a, 0x402a2a, 0x7a1d2e, 0xb8283a, 0xee4a3a,
    0xf28a2e, 0xffc040, 0xfff07a, 0x12403a, 0x1f7a5a, 0x3fbf7a, 0xa6ee8a, 0x123a6a,
    0x2a6fc0, 0x4cb4f0, 0xa0e8f8, 0x5a2a8a, 0x9a4cd0, 0xe070d8, 0xf8a8c8, 0x6a8a3a,
];

/** Named colours (indices into PALETTE) — use these instead of raw hex everywhere. */
export const C = {
    void: 0x0b0714,
    ink: 0x160f26,
    night: 0x221a3d,
    dusk: 0x32285a,
    twilight: 0x4a3c7a,
    haze: 0x6c5f9c,
    mist: 0x9a8fbf,
    fog: 0xcfc6dd,
    paper: 0xf4ecd8,
    parchment: 0xd6c39a,
    wood: 0xa88a62,
    bark: 0x6e4e3a,
    umber: 0x402a2a,
    blood: 0x7a1d2e,
    crimson: 0xb8283a,
    cinnabar: 0xee4a3a,
    ember: 0xf28a2e,
    gold: 0xffc040,
    glow: 0xfff07a,
    pine: 0x12403a,
    moss: 0x1f7a5a,
    jade: 0x3fbf7a,
    lime: 0xa6ee8a,
    deep: 0x123a6a,
    azure: 0x2a6fc0,
    sky: 0x4cb4f0,
    ice: 0xa0e8f8,
    violet: 0x5a2a8a,
    orchid: 0x9a4cd0,
    magenta: 0xe070d8,
    petal: 0xf8a8c8,
    olive: 0x6a8a3a,
} as const;

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** CSS colour strings for Phaser text. */
export const T = {
    paper: hex(C.paper),
    gold: hex(C.gold),
    glow: hex(C.glow),
    dim: hex(C.mist),
    fog: hex(C.fog),
    ink: hex(C.ink),
    void: hex(C.void),
    cinnabar: hex(C.cinnabar),
    jade: hex(C.jade),
    lime: hex(C.lime),
    ice: hex(C.ice),
    sky: hex(C.sky),
    petal: hex(C.petal),
    orchid: hex(C.orchid),
    ember: hex(C.ember),
} as const;

export const FONT = 'Zpix, "Press Start 2P", monospace';

/** Logical pixel size: everything decorative snaps to multiples of this on the 1920x1080 canvas. */
export const PX = 4;
