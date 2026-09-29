export interface StoryDialoguePageLine {
    id: string;
    text: string;
}

export interface StoryDialoguePage<T extends StoryDialoguePageLine> {
    startIndex: number;
    endIndex: number;
    lines: T[];
    nextDialogueId?: string;
}

/** Group nearby dialogue lines while keeping the saved position tied to a line ID. */
export function storyDialoguePage<T extends StoryDialoguePageLine>(
    dialogues: readonly T[],
    currentDialogueId?: string,
    maxCharacters = 130,
    maxLines = 3,
): StoryDialoguePage<T> {
    const savedIndex = currentDialogueId === undefined
        ? -1
        : dialogues.findIndex(line => line.id === currentDialogueId);
    const startIndex = Math.max(0, savedIndex);
    let endIndex = startIndex;
    let characters = 0;

    while (endIndex < dialogues.length && endIndex - startIndex < maxLines) {
        const line = dialogues[endIndex]!;
        if (endIndex > startIndex && characters + line.text.length > maxCharacters) break;
        characters += line.text.length;
        endIndex += 1;
    }

    return {
        startIndex,
        endIndex,
        lines: dialogues.slice(startIndex, endIndex),
        ...(endIndex < dialogues.length ? { nextDialogueId: dialogues[endIndex]!.id } : {}),
    };
}
