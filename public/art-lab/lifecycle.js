/* Shared, deterministic lifecycle model. No renderer or browser dependency. */
(() => {
  const phases = [
    ['summon', '唤灵', 'SUMMON', 3, '灵气汇入阵心，符环逐层开启。'],
    ['birth', '凝形', 'MATERIALIZE', 3, '骨翼与翎羽从火中展开，完成第一次振翅。'],
    ['idle', '栖焰', 'IDLE', 4, '呼吸、眨眼、羽冠与尾羽保持独立次级运动。'],
    ['flight', '巡游', 'FLIGHT', 4, '振翅推进、身体侧倾，尾羽与余焰延迟跟随。'],
    ['charge', '蓄势', 'CHARGE', 3, '双翼收拢，逆向火流聚成一枚日核。'],
    ['attack', '焚天', 'ATTACK', 2.5, '日核爆发，羽刃、冲击环与热浪依次展开。'],
    ['hit', '受创', 'HIT', 1.5, '短暂顿帧、轮廓闪白与羽片脱落，保留动作重量。'],
    ['death', '陨落', 'DISSOLVE', 3, '羽翼逐像素剥离，光芒坠入灰烬。'],
    ['ash', '余烬', 'ASH', 3, '余温缓慢消散，一颗火种仍在灰烬中呼吸。'],
    ['rebirth', '涅槃', 'REBIRTH', 3, '火种重新点燃，凤凰穿过光柱，再入轮回。']
  ].map(([id, name, en, duration, description], index) => ({id, name, en, duration, description, index}));
  let cursor = 0;
  for (const phase of phases) { phase.start = cursor; cursor += phase.duration; phase.end = cursor; }
  const duration = cursor;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const hash = seed => { let x = seed | 0; x = Math.imul(x ^ x >>> 16, 0x45d9f3b); x = Math.imul(x ^ x >>> 16, 0x45d9f3b); return ((x ^ x >>> 16) >>> 0) / 4294967296; };
  const wrap = time => ((time % duration) + duration) % duration;
  function sample(time) {
    const t = wrap(time);
    const phase = phases.find(p => t < p.end) || phases[0];
    return {time: t, phase, progress: (t - phase.start) / phase.duration, local: t - phase.start};
  }
  function rawPose(time) {
    const {phase, progress: p} = sample(time);
    const wave = Math.sin(time * 2.4), id = phase.id;
    const v = {x: 322, y: 152 + wave * 3, scale: 1, flap: Math.sin(time * 4.5) * .26, fold: 0, tilt: Math.sin(time * 1.1) * .025, visibility: 1, dissolve: 0, energy: .28, tail: 1};
    if (id === 'summon') { v.visibility = 0; v.energy = p * .65; }
    if (id === 'birth') { v.visibility = smooth(p * 1.9); v.scale = .55 + smooth(p) * .45; v.y += (1 - smooth(p)) * 58; v.flap = -.8 + smooth(p * 1.4) * .95; v.energy = .75; }
    if (id === 'flight') { const e = Math.sin(p * Math.PI); v.x += Math.sin(p * Math.PI * 2) * 72; v.y -= e * 22; v.tilt = Math.cos(p * Math.PI * 2) * .13 * e; v.flap = Math.sin(time * 8) * .62; }
    if (id === 'charge') { v.fold = smooth(p) * .74; v.y -= smooth(p) * 16; v.flap *= .25; v.energy = .3 + p * .7; }
    if (id === 'attack') { v.fold = .74 * (1 - smooth(p * 6)); v.flap = -.2 - Math.sin(p * Math.PI) * .55; v.y -= 16 * (1 - smooth(p)); v.energy = 1 - p * .6; }
    if (id === 'hit') { const recoil = Math.sin(Math.min(1, p * 3) * Math.PI); v.x -= recoil * 17; v.tilt = -recoil * .26; v.flap = -.2; v.energy = .55; }
    if (id === 'death') { v.y += p * p * 88; v.tilt = p * .32; v.fold = smooth(p) * .5; v.dissolve = smooth(p); v.energy = 1 - p; v.tail = 1 - p * .7; }
    if (id === 'ash') { v.visibility = 0; v.energy = .12 + p * .14; }
    if (id === 'rebirth') { v.visibility = smooth((p - .18) * 3); v.y += (1 - smooth(p)) * 70; v.scale = .65 + smooth(p) * .35; v.flap = -.9 + smooth(p) * 1.15; v.energy = 1 - p * .7; }
    return v;
  }
  function pose(time) {
    time = wrap(time);
    const state = sample(time), current = rawPose(time);
    const transition = state.phase.id === 'summon' ? .55 : .22;
    if (state.local >= transition) return current;
    const previous = phases[(state.phase.index + phases.length - 1) % phases.length];
    const from = rawPose(previous.end - 1e-7);
    // The first 90 ms of a hit hold the outgoing silhouette before recoil begins.
    const blend = smooth(state.phase.id === 'hit' ? (state.local - .09) / .13 : state.local / transition);
    for (const key of Object.keys(current)) current[key] = from[key] + (current[key] - from[key]) * blend;
    return current;
  }
  globalThis.EmberLifecycle = Object.freeze({phases, duration, clamp, smooth, hash, wrap, sample, pose});
})();
