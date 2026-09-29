import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import { getStarFromGradeId } from '../../utils/ArtifactHelper';
import { getUnitStar } from '../../utils/RealmHelper';
import type { GongfaExpressionContext } from './gongfaExpression';

export interface GongfaExpressionContextInput {
    triggerUnit?: UnitCard;
    equippedArtifact?: ArtifactCard;
}

export function buildGongfaExpressionContext(
    input: GongfaExpressionContextInput
): GongfaExpressionContext | undefined {
    if (!input.triggerUnit) {
        return undefined;
    }

    return {
        cardStar: getUnitStar(input.triggerUnit),
        artifactStar: input.equippedArtifact
            ? getStarFromGradeId(input.equippedArtifact.gradeId)
            : 0
    };
}
