export interface GongfaExpressionContext {
    cardStar?: number;
    artifactStar?: number;
}

export class GongfaExpressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GongfaExpressionError';
    }
}

enum TokenType {
    Number = 'Number',
    Identifier = 'Identifier',
    Plus = 'Plus',
    Minus = 'Minus',
    Star = 'Star',
    Slash = 'Slash',
    LeftParen = 'LeftParen',
    RightParen = 'RightParen',
    End = 'End'
}

interface Token {
    type: TokenType;
    value: string;
    position: number;
}

const IDENTIFIER_CHARS = /^[A-Za-z_.]$/;
const DIGIT = /^[0-9]$/;

export function evaluateGongfaNumberExpression(
    expression: string,
    context: GongfaExpressionContext
): number {
    const parser = new GongfaExpressionParser(tokenize(expression), context);
    const value = parser.parse();
    if (!Number.isFinite(value)) {
        throw new GongfaExpressionError('功法表达式结果必须是有限数字');
    }
    return value;
}

function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < expression.length) {
        const char = expression[index];
        const position = index;

        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (char === '+') {
            tokens.push({ type: TokenType.Plus, value: char, position });
            index++;
            continue;
        }

        if (char === '-') {
            tokens.push({ type: TokenType.Minus, value: char, position });
            index++;
            continue;
        }

        if (char === '*') {
            tokens.push({ type: TokenType.Star, value: char, position });
            index++;
            continue;
        }

        if (char === '/') {
            tokens.push({ type: TokenType.Slash, value: char, position });
            index++;
            continue;
        }

        if (char === '(') {
            tokens.push({ type: TokenType.LeftParen, value: char, position });
            index++;
            continue;
        }

        if (char === ')') {
            tokens.push({ type: TokenType.RightParen, value: char, position });
            index++;
            continue;
        }

        if (DIGIT.test(char) || char === '.') {
            const numberToken = readNumber(expression, index);
            tokens.push(numberToken);
            index = numberToken.position + numberToken.value.length;
            continue;
        }

        if (IDENTIFIER_CHARS.test(char)) {
            const identifierToken = readIdentifier(expression, index);
            tokens.push(identifierToken);
            index = identifierToken.position + identifierToken.value.length;
            continue;
        }

        throw new GongfaExpressionError(`功法表达式包含不支持的字符 "${char}"，位置 ${position}`);
    }

    tokens.push({ type: TokenType.End, value: '', position: expression.length });
    return tokens;
}

function readNumber(expression: string, start: number): Token {
    let index = start;
    let hasDigit = false;
    let hasDot = false;

    while (index < expression.length) {
        const char = expression[index];
        if (DIGIT.test(char)) {
            hasDigit = true;
            index++;
            continue;
        }

        if (char === '.' && !hasDot) {
            hasDot = true;
            index++;
            continue;
        }

        break;
    }

    const value = expression.slice(start, index);
    const parsed = Number(value);
    if (!hasDigit || !Number.isFinite(parsed)) {
        throw new GongfaExpressionError(`功法表达式数字字面量无效：${value}`);
    }

    return { type: TokenType.Number, value, position: start };
}

function readIdentifier(expression: string, start: number): Token {
    let index = start;
    while (index < expression.length && IDENTIFIER_CHARS.test(expression[index])) {
        index++;
    }
    return {
        type: TokenType.Identifier,
        value: expression.slice(start, index),
        position: start
    };
}

class GongfaExpressionParser {
    private current = 0;

    constructor(
        private readonly tokens: Token[],
        private readonly context: GongfaExpressionContext
    ) {}

    parse(): number {
        const value = this.parseAdditive();
        if (!this.match(TokenType.End)) {
            const token = this.peek();
            throw new GongfaExpressionError(`功法表达式在位置 ${token.position} 有多余内容：${token.value}`);
        }
        return value;
    }

    private parseAdditive(): number {
        let value = this.parseMultiplicative();

        while (this.match(TokenType.Plus) || this.match(TokenType.Minus)) {
            const operator = this.previous();
            const right = this.parseMultiplicative();
            value = operator.type === TokenType.Plus
                ? value + right
                : value - right;
            this.assertFinite(value);
        }

        return value;
    }

    private parseMultiplicative(): number {
        let value = this.parseUnary();

        while (this.match(TokenType.Star) || this.match(TokenType.Slash)) {
            const operator = this.previous();
            const right = this.parseUnary();
            value = operator.type === TokenType.Star
                ? value * right
                : value / right;
            this.assertFinite(value);
        }

        return value;
    }

    private parseUnary(): number {
        if (this.match(TokenType.Plus)) {
            return this.parseUnary();
        }

        if (this.match(TokenType.Minus)) {
            const value = -this.parseUnary();
            this.assertFinite(value);
            return value;
        }

        return this.parsePrimary();
    }

    private parsePrimary(): number {
        if (this.match(TokenType.Number)) {
            return Number(this.previous().value);
        }

        if (this.match(TokenType.Identifier)) {
            return this.resolveIdentifier(this.previous());
        }

        if (this.match(TokenType.LeftParen)) {
            const value = this.parseAdditive();
            this.consume(TokenType.RightParen, '功法表达式缺少右括号');
            return value;
        }

        const token = this.peek();
        throw new GongfaExpressionError(`功法表达式在位置 ${token.position} 缺少数字、card.star 或 artifact.star`);
    }

    private resolveIdentifier(token: Token): number {
        if (token.value === 'card.star') {
            return this.requireFiniteContextValue('card.star', this.context.cardStar);
        }

        if (token.value === 'artifact.star') {
            return this.requireFiniteContextValue('artifact.star', this.context.artifactStar);
        }

        throw new GongfaExpressionError(`功法表达式不支持标识符：${token.value}`);
    }

    private requireFiniteContextValue(name: string, value: number | undefined): number {
        if (value === undefined || !Number.isFinite(value)) {
            throw new GongfaExpressionError(`功法表达式缺少 ${name} 上下文`);
        }
        return value;
    }

    private match(type: TokenType): boolean {
        if (this.peek().type !== type) {
            return false;
        }
        this.current++;
        return true;
    }

    private consume(type: TokenType, message: string): Token {
        if (this.peek().type === type) {
            this.current++;
            return this.previous();
        }
        throw new GongfaExpressionError(message);
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private assertFinite(value: number): void {
        if (!Number.isFinite(value)) {
            throw new GongfaExpressionError('功法表达式结果必须是有限数字');
        }
    }
}
