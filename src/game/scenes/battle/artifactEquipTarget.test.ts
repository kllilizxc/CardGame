import { describe, expect, it } from 'bun:test';
import { findArtifactEquipTarget } from './artifactEquipTarget';

interface Target {
    id: string;
    x: number;
    y: number;
    body?: { x: number; y: number; width: number; height: number };
}

const find = (drop: { x: number; y: number }, targets: Target[]) =>
    findArtifactEquipTarget(drop, targets, target => target.body)?.id ?? null;

describe('artifact equip drop target', () => {
    it('accepts a drop on the visible character above its foot anchor', () => {
        expect(find({ x: 130, y: 300 }, [
            { id: 'ally', x: 130, y: 610, body: { x: 70, y: 200, width: 120, height: 400 } },
        ])).toBe('ally');
    });

    it('prefers the character under the card over another unit’s nearby foot anchor', () => {
        expect(find({ x: 130, y: 300 }, [
            { id: 'nearby-foot', x: 135, y: 330 },
            { id: 'visible-ally', x: 130, y: 610, body: { x: 70, y: 200, width: 120, height: 400 } },
        ])).toBe('visible-ally');
    });

    it('keeps the previous nearest-foot behavior and rejects distant drops', () => {
        const targets = [
            { id: 'farther', x: 200, y: 600 },
            { id: 'nearer', x: 340, y: 600 },
        ];
        expect(find({ x: 310, y: 600 }, targets)).toBe('nearer');
        expect(find({ x: 600, y: 300 }, targets)).toBeNull();
    });
});
