const BREAK_AFTER = new Set(['。', '！', '？', '；', '，', '\n']);

/** Keep every character while showing one readable passage at a time. */
export function paginateReadableCopy(copy: string, maxCharacters = 150): string[] {
    if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
        throw new Error('Story page size must be a positive integer.');
    }
    const characters = Array.from(copy);
    if (!characters.length) return [''];
    const pages: string[] = [];
    let start = 0;
    while (start < characters.length) {
        let end = Math.min(start + maxCharacters, characters.length);
        if (end < characters.length) {
            const earliestBreak = start + Math.ceil(maxCharacters * 0.6);
            for (let index = end - 1; index >= earliestBreak; index -= 1) {
                if (BREAK_AFTER.has(characters[index]!)) {
                    end = index + 1;
                    break;
                }
            }
        }
        pages.push(characters.slice(start, end).join(''));
        start = end;
    }
    return pages;
}
