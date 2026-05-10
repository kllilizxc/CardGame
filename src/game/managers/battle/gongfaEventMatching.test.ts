import { describe, expect, it } from 'bun:test';

import { EffectEventSide, EffectEventType } from '@data/types/gongfa';
import { isGongfaEventMatch } from './gongfaEventMatching';

describe('gongfaEventMatching pure event matcher', () => {
  it('requires exact type and side for Custom events', () => {
    const customAllyEvent = { type: EffectEventType.Custom, side: EffectEventSide.Ally };

    expect(isGongfaEventMatch(customAllyEvent, {
      type: EffectEventType.Custom,
      side: EffectEventSide.Ally,
    })).toBe(true);
    expect(isGongfaEventMatch(customAllyEvent, {
      type: EffectEventType.Custom,
      side: EffectEventSide.Enemy,
    })).toBe(false);
    expect(isGongfaEventMatch(customAllyEvent, {
      type: EffectEventType.OnSummon,
      side: EffectEventSide.Ally,
    })).toBe(false);
  });

  it('does not treat Any as a wildcard for Custom event side matching', () => {
    expect(isGongfaEventMatch(
      { type: EffectEventType.Custom, side: EffectEventSide.Any },
      { type: EffectEventType.Custom, side: EffectEventSide.Ally },
    )).toBe(false);
    expect(isGongfaEventMatch(
      { type: EffectEventType.Custom, side: EffectEventSide.Any },
      { type: EffectEventType.Custom, side: EffectEventSide.Any },
    )).toBe(true);
  });

  it('matches non-custom events by type', () => {
    expect(isGongfaEventMatch(
      { type: EffectEventType.OnSummon },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
    )).toBe(true);
    expect(isGongfaEventMatch(
      { type: EffectEventType.TurnEnd },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
    )).toBe(false);
  });

  it('accepts omitted side and Any side for non-custom events', () => {
    expect(isGongfaEventMatch(
      { type: EffectEventType.OnSummon },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Enemy },
    )).toBe(true);
    expect(isGongfaEventMatch(
      { type: EffectEventType.OnSummon, side: EffectEventSide.Any },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
    )).toBe(true);
  });

  it('rejects explicit side mismatch for non-custom events', () => {
    expect(isGongfaEventMatch(
      { type: EffectEventType.OnSummon, side: EffectEventSide.Enemy },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
    )).toBe(false);
  });

  it('accepts exact explicit side match for non-custom events', () => {
    expect(isGongfaEventMatch(
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
      { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
    )).toBe(true);
  });
});
