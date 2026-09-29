import { expect, test } from 'bun:test';
import { resolveBattleLoadout } from './battleLoadout';

const pills = [{ id: 'PL_001' }, { id: 'PL_002' }, { id: 'PL_NEW' }];
const skills = [{ id: 'SK_000' }, { id: 'SK_NEW' }];

test('older games retain the original two pill slots and one skill', () => {
    expect(resolveBattleLoadout(undefined, pills, skills)).toEqual({ pills: pills.slice(0, 2), skills: skills.slice(0, 1) });
});

test('configured pills and skills reach their actual battle controls in order', () => {
    expect(resolveBattleLoadout({ schemaVersion: 1, pillIds: ['PL_NEW', 'PL_001'], skillIds: ['SK_NEW', 'SK_000'] }, pills, skills))
        .toEqual({ pills: [pills[2], pills[0]], skills: [skills[1], skills[0]] });
});

test('invalid, duplicate, and overflowing loadout entries fail before battle starts', () => {
    for (const config of [
        { schemaVersion: 1, pillIds: ['PL_MISSING'], skillIds: [] },
        { schemaVersion: 1, pillIds: ['PL_001', 'PL_001'], skillIds: [] },
        { schemaVersion: 1, pillIds: ['PL_001', 'PL_002', 'PL_NEW', 'PL_001'], skillIds: [] },
        { schemaVersion: 1, pillIds: [], skillIds: ['SK_MISSING'] },
        { schemaVersion: 2, pillIds: [], skillIds: [] },
    ]) expect(() => resolveBattleLoadout(config, pills, skills)).toThrow();
});
