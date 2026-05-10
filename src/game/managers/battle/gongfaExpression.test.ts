import { describe, expect, it } from 'bun:test';

import { evaluateGongfaNumberExpression } from './gongfaExpression';

describe('evaluateGongfaNumberExpression', () => {
  it('evaluates current gongfa star expressions with arithmetic precedence', () => {
    expect(evaluateGongfaNumberExpression('card.star + 1', { cardStar: 2 })).toBe(3);
    expect(evaluateGongfaNumberExpression('artifact.star * 2', { cardStar: 2, artifactStar: 3 })).toBe(6);
    expect(evaluateGongfaNumberExpression(' card.star + artifact.star * 2 ', { cardStar: 4, artifactStar: 5 })).toBe(14);
  });

  it('supports finite numeric literals, whitespace, unary signs, and parentheses', () => {
    expect(evaluateGongfaNumberExpression(' ( card.star + 1.5 ) * -2 ', { cardStar: 2 })).toBe(-7);
  });

  it('rejects unsupported identifiers and member paths', () => {
    expect(() => evaluateGongfaNumberExpression('card.attack + 1', { cardStar: 2 })).toThrow();
    expect(() => evaluateGongfaNumberExpression('Math.max(card.star, 1)', { cardStar: 2 })).toThrow();
  });

  it('rejects unsupported operators and malformed expressions', () => {
    expect(() => evaluateGongfaNumberExpression('card.star ** 2', { cardStar: 2 })).toThrow();
    expect(() => evaluateGongfaNumberExpression('card.star +', { cardStar: 2 })).toThrow();
    expect(() => evaluateGongfaNumberExpression('(card.star + 1', { cardStar: 2 })).toThrow();
  });

  it('rejects missing expression contexts for referenced star helpers', () => {
    expect(() => evaluateGongfaNumberExpression('card.star + 1', {})).toThrow();
    expect(() => evaluateGongfaNumberExpression('artifact.star * 2', { cardStar: 2 })).toThrow();
  });

  it('rejects non-finite numeric results', () => {
    expect(() => evaluateGongfaNumberExpression('1 / 0', { cardStar: 2 })).toThrow();
  });
});
