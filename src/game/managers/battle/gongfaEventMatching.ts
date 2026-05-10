import type { EffectSchema } from '@data/types/gongfa';
import { EffectEventSide, EffectEventType } from '@data/types/gongfa';

export type GongfaEventDefinition = EffectSchema['event'];

export interface GongfaEventTrigger {
    type: EffectEventType;
    side: EffectEventSide;
}

/**
 * Pure matcher for gongfa event definitions against the runtime trigger.
 *
 * Custom events intentionally require an exact type and side match. Non-custom
 * events match by type, then accept an omitted side or Any as a wildcard.
 */
export function isGongfaEventMatch(
    event: GongfaEventDefinition,
    trigger: GongfaEventTrigger
): boolean {
    if (event.type === EffectEventType.Custom) {
        return event.type === trigger.type && event.side === trigger.side;
    }

    if (event.type !== trigger.type) {
        return false;
    }

    if (!event.side || event.side === EffectEventSide.Any) {
        return true;
    }

    return event.side === trigger.side;
}
