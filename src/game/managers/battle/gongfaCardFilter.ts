import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { FieldCard } from '@data/types/cards/field';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { UnitCard } from '@data/types/cards/unit';
import type { CardFilter } from '@data/types/gongfa';
import { getArtifactStar } from '../../utils/ArtifactHelper';
import { getUnitStar } from '../../utils/RealmHelper';
import {
    evaluateGongfaNumberExpression,
    type GongfaExpressionContext
} from './gongfaExpression';

export type GongfaFilterCard = UnitCard | ArtifactCard | TalismanCard | FieldCard;

const KNOWN_WEAPON_TYPES: readonly ArtifactWeaponType[] = [
    '剑',
    '刀',
    '鞭',
    '枪',
    '锤',
    '弓',
    '尺',
    '印',
    '棍',
    '棒',
    '毒',
    '琴',
    '笛子',
    '拳套',
    '符箓',
    '斧头',
    '匕首',
    '飞镖',
    '扇子'
];

export function isGongfaCardFilterMatch(
    card: GongfaFilterCard,
    filter: CardFilter,
    expressionContext: GongfaExpressionContext = {}
): boolean {
    if (filter.kind && !filter.kind.includes(card.kind)) {
        return false;
    }

    if (filter.labelsAnyOf && filter.labelsAnyOf.length > 0) {
        const labels = card.labels || [];
        if (!filter.labelsAnyOf.some(label => labels.includes(label))) {
            return false;
        }
    }

    if (filter.weaponTypesAnyOf && filter.weaponTypesAnyOf.length > 0) {
        if (card.kind !== 'artifact') {
            return false;
        }

        const weaponType = card.weaponType || extractGongfaWeaponTypeFromLabels(card.labels || []);
        if (!weaponType || !filter.weaponTypesAnyOf.includes(weaponType)) {
            return false;
        }
    }

    if (filter.maxStar !== undefined) {
        const cardStar = getGongfaFilterCardStar(card);
        if (cardStar === undefined) {
            return false;
        }

        const maxStar = typeof filter.maxStar === 'string'
            ? evaluateGongfaNumberExpression(filter.maxStar, expressionContext)
            : filter.maxStar;

        if (cardStar > maxStar) {
            return false;
        }
    }

    return true;
}

export function extractGongfaWeaponTypeFromLabels(
    labels: readonly string[] | undefined
): ArtifactWeaponType | undefined {
    if (!labels) {
        return undefined;
    }

    const match = labels.find(label => KNOWN_WEAPON_TYPES.some(type => label.includes(type)));
    if (!match) {
        return undefined;
    }

    return KNOWN_WEAPON_TYPES.find(type => match.includes(type));
}

function getGongfaFilterCardStar(card: GongfaFilterCard): number | undefined {
    switch (card.kind) {
        case 'unit':
            return getUnitStar(card);
        case 'artifact':
            return getArtifactStar(card);
        default:
            return undefined;
    }
}
