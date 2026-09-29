/**
 * "Ink & Ember" — the single 32-colour palette the whole game is drawn with.
 * A full-screen post shader (PaletteFX) snaps every rendered pixel to these colours,
 * so anything drawn anywhere automatically belongs to the same world.
 */
export const PALETTE: readonly number[] = [
    // 文心 pixel-art set (kept exact so the generated art passes through the shader untouched)
    0x20282e, 0x303a42, 0x484642, 0x655b50, 0x88745c, 0xac8c61, 0xc6aa7a, 0xdfc99f,
    0xeee4d3, 0xc8c4b5, 0xa8afa4, 0x849a8d, 0x607b72, 0x425d57, 0x2b4440, 0x67505a,
    0x957477, 0xb98e82, 0xe0b49a, 0xf1cead, 0x556577, 0x7d8c98, 0xa8b3b9, 0xd2d6cd,
    // shared scene theme
    0x0d1320, 0x172133, 0x22180f, 0x202e2a, 0x303e38, 0x42554c, 0x4f7a62, 0x72a68a,
    0xd3b27b, 0xe8d5ab, 0xf3ead3, 0x8f5037, 0xb36c46, 0x524a3f,
    // accents: cinnabar seal, moon-blue, dawn mist, lamp glow
    0x080c12, 0x5a2622, 0x8d3c30, 0xb95a44, 0xd98f6a, 0x2a3a52, 0x3f5f86, 0x7fa2bd,
    0xcfe1e6, 0x34465a, 0x4a4f78, 0x8b8fb8, 0xf2d98d, 0xa4c5b0,
];

/** Named colours — use these instead of raw hex everywhere. Every value is a PALETTE entry. */
export const C = {
    void: 0x080c12,
    ink: 0x0d1320,
    night: 0x172133,
    dusk: 0x34465a,
    twilight: 0x4a4f78,
    haze: 0x556577,
    mist: 0x7d8c98,
    fog: 0xa8b3b9,
    paper: 0xf3ead3,
    parchment: 0xe8d5ab,
    wood: 0xb36c46,
    bark: 0x8f5037,
    umber: 0x22180f,
    blood: 0x5a2622,
    crimson: 0x8d3c30,
    cinnabar: 0xb95a44,
    ember: 0xd98f6a,
    gold: 0xd3b27b,
    glow: 0xf2d98d,
    pine: 0x202e2a,
    moss: 0x303e38,
    olive: 0x42554c,
    jade: 0x4f7a62,
    lime: 0x72a68a,
    celadon: 0xa4c5b0,
    deep: 0x2a3a52,
    azure: 0x3f5f86,
    sky: 0x7fa2bd,
    ice: 0xcfe1e6,
    violet: 0x4a4f78,
    orchid: 0x8b8fb8,
    magenta: 0x524a3f,
    petal: 0xe0b49a,
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
