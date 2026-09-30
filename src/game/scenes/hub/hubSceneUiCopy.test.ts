import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('HubScene player-facing copy', () => {
    it('keeps map prompts and status feedback free of internal hub/session terminology', () => {
        const scene = read('src/game/scenes/hub/HubScene.ts');

        // The street view needs no instruction copy: places are buildings you click.
        expect(scene).not.toContain('拖拽查看地图');
        expect(scene).toContain('`已选定前往：${location.title}。`');

        expect(scene).not.toContain("'地点子地图'");
        expect(scene).not.toContain("'拖拽平移地图，点击标记选择 Hub 小地点。'");
        expect(scene).not.toContain("'当前 Hub 位置会保存到本地 Story/Hub session。'");
        expect(scene).not.toContain('`已在 Hub 子地图选择：${location.title}。`');
    });
});
