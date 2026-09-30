/**
 * 墨砂 "Ink & Cinnabar" — the single palette the whole game is drawn with.
 *
 * The game is authored on a 640x360 pixel grid shown at 3x (1920x1080 logical canvas).
 * A full-screen post pass (PaletteFX) snaps every rendered pixel onto the 3px grid and onto
 * these colours, so anything drawn anywhere automatically belongs to the same world.
 */
export const INK = {
    void: 0x0a0a12,     // outline ink
    ink: 0x15142a,      // deepest night
    indigo: 0x222445,
    slate: 0x343a63,
    dusk: 0x4c5a86,
    mist: 0x7f93b2,
    haze: 0xb4c3d3,
    bone: 0xe6dcc2,
    paper: 0xfbf4df,
    plum: 0x3e1f3a,
    wine: 0x6a1e2c,
    cinnabar: 0xb3302b,
    vermilion: 0xe3582f,
    amber: 0xf09a3e,
    gold: 0xf5cf6a,
    umber: 0x3b2622,
    bark: 0x6b4331,
    clay: 0xa46b48,
    skin: 0xe2ad85,
    pine: 0x123330,
    jade: 0x1f5e52,
    teal: 0x2f8f74,
    spirit: 0x6fd6a6,
    frost: 0xc9f2e0,
    grey: 0x5d5c6e,
    ash: 0x928f9c,
} as const;

export const PALETTE: readonly number[] = Object.values(INK);

/**
 * Named colours kept for older call sites. Every value is a PALETTE entry; keys are
 * semantic ("cinnabar" = danger/primary action, "jade/lime" = spirit, "gold" = rare highlight).
 */
export const C = {
    void: INK.void,
    ink: INK.ink,
    night: INK.indigo,
    dusk: INK.slate,
    twilight: INK.slate,
    haze: INK.dusk,
    mist: INK.mist,
    fog: INK.haze,
    paper: INK.paper,
    parchment: INK.bone,
    wood: INK.clay,
    bark: INK.bark,
    umber: INK.umber,
    blood: INK.wine,
    crimson: INK.cinnabar,
    cinnabar: INK.cinnabar,
    ember: INK.vermilion,
    amber: INK.amber,
    gold: INK.gold,
    glow: INK.gold,
    pine: INK.pine,
    moss: INK.jade,
    olive: INK.jade,
    jade: INK.teal,
    lime: INK.spirit,
    celadon: INK.frost,
    deep: INK.indigo,
    azure: INK.dusk,
    sky: INK.mist,
    ice: INK.frost,
    violet: INK.slate,
    orchid: INK.ash,
    magenta: INK.plum,
    petal: INK.skin,
    plum: INK.plum,
    grey: INK.grey,
    ash: INK.ash,
} as const;

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** CSS colour strings for Phaser text. */
export const T = {
    paper: hex(INK.paper),
    bone: hex(INK.bone),
    gold: hex(INK.gold),
    glow: hex(INK.gold),
    dim: hex(INK.mist),
    fog: hex(INK.haze),
    ink: hex(INK.ink),
    void: hex(INK.void),
    cinnabar: hex(INK.vermilion),
    red: hex(INK.cinnabar),
    jade: hex(INK.teal),
    lime: hex(INK.spirit),
    ice: hex(INK.frost),
    sky: hex(INK.mist),
    petal: hex(INK.skin),
    orchid: hex(INK.ash),
    ember: hex(INK.amber),
    amber: hex(INK.amber),
} as const;

export const FONT = 'Zpix, "Press Start 2P", monospace';

/** Size of one art pixel on the 1920x1080 logical canvas. Everything snaps to this grid. */
export const PX = 3;
