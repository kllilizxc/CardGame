import type { Scene } from 'phaser';

const NATIVE_TEXT_ENTRY_CLASS_NAME = 'cardgame-native-text-entry';
const NATIVE_TEXT_ENTRY_STYLE_ID = 'cardgame-native-text-entry-style';

export interface NativeTextEntryRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface NativeTextEntryInset {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}

export interface NativeTextEntryStyle {
    fontFamily: string;
    fontSize: number;
    fontWeight?: string;
    color: string;
    caretColor?: string;
    placeholderColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    lineHeight?: number;
}

export interface NativeTextEntryKeyboardEventLike {
    key: string;
    isComposing?: boolean;
}

export type NativeTextEntryShortcut = 'confirm' | 'cancel' | 'block-tab' | null;

export interface NativeTextEntrySessionConfig {
    id: string;
    ariaLabel: string;
    value: string;
    placeholder?: string;
    selectAllOnFocus?: boolean;
    getBounds: () => NativeTextEntryRect | null;
    style: NativeTextEntryStyle;
    onValueChange?: (value: string) => void;
    onConfirm?: (value: string) => void;
    onCancel?: (value: string) => void;
    onBlur?: () => void;
}

export function insetNativeTextEntryRect(
    rect: Readonly<NativeTextEntryRect>,
    inset: NativeTextEntryInset,
): NativeTextEntryRect {
    const left = inset.left ?? 0;
    const right = inset.right ?? 0;
    const top = inset.top ?? 0;
    const bottom = inset.bottom ?? 0;

    return {
        x: rect.x + left,
        y: rect.y + top,
        width: Math.max(0, rect.width - left - right),
        height: Math.max(0, rect.height - top - bottom),
    };
}

export function projectSceneRectToClientRect(
    rect: Readonly<NativeTextEntryRect>,
    canvasRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    sceneSize: { width: number; height: number },
): NativeTextEntryRect {
    const scaleX = sceneSize.width > 0 ? canvasRect.width / sceneSize.width : 0;
    const scaleY = sceneSize.height > 0 ? canvasRect.height / sceneSize.height : 0;

    return {
        x: canvasRect.left + rect.x * scaleX,
        y: canvasRect.top + rect.y * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
    };
}

export function getNativeTextEntryShortcut(
    event: NativeTextEntryKeyboardEventLike,
    compositionActive: boolean,
): NativeTextEntryShortcut {
    if (compositionActive || event.isComposing) {
        return event.key === 'Tab' ? 'block-tab' : null;
    }

    switch (event.key) {
        case 'Enter':
            return 'confirm';
        case 'Escape':
            return 'cancel';
        case 'Tab':
            return 'block-tab';
        default:
            return null;
    }
}

export class NativeTextEntryOverlay {
    private readonly scene: Scene;
    private session: NativeTextEntrySessionConfig | null = null;
    private input: HTMLInputElement | null = null;
    private compositionActive = false;
    private focused = false;
    private suppressBlur = false;
    private readonly windowLayoutHandler = () => this.syncLayout();

    constructor(scene: Scene) {
        this.scene = scene;
        this.scene.scale.on('resize', this.syncLayout, this);

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.windowLayoutHandler);
            window.addEventListener('scroll', this.windowLayoutHandler, true);
        }
    }

    isActive(sessionId?: string): boolean {
        if (!this.session) {
            return false;
        }

        return sessionId === undefined || this.session.id === sessionId;
    }

    isFocused(sessionId?: string): boolean {
        return this.focused && this.isActive(sessionId);
    }

    activate(config: NativeTextEntrySessionConfig): void {
        const sameSession = this.session?.id === config.id;
        this.session = config;

        this.ensureInput();
        this.applySessionConfig(sameSession);
        this.syncLayout();

        if (!sameSession) {
            this.compositionActive = false;
            this.focusInput(Boolean(config.selectAllOnFocus));
        }
    }

    focus(sessionId?: string): void {
        if (!this.input || !this.isActive(sessionId)) {
            return;
        }

        this.focusInput(false);
    }

    deactivate(sessionId?: string): void {
        if (!this.session || (sessionId !== undefined && this.session.id !== sessionId)) {
            return;
        }

        this.session = null;
        this.compositionActive = false;
        this.focused = false;

        if (!this.input) {
            return;
        }

        this.suppressBlur = true;
        if (typeof document !== 'undefined' && document.activeElement === this.input) {
            this.input.blur();
        }
        this.suppressBlur = false;
        this.input.remove();
        this.input = null;
    }

    destroy(): void {
        this.deactivate();
        this.scene.scale.off('resize', this.syncLayout, this);

        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this.windowLayoutHandler);
            window.removeEventListener('scroll', this.windowLayoutHandler, true);
        }
    }

    private ensureInput(): void {
        if (this.input || typeof document === 'undefined') {
            return;
        }

        this.ensurePlaceholderStyle();

        const input = document.createElement('input');
        input.type = 'text';
        input.className = NATIVE_TEXT_ENTRY_CLASS_NAME;
        input.dir = 'auto';
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.enterKeyHint = 'done';
        input.style.position = 'fixed';
        input.style.zIndex = '2147483647';
        input.style.margin = '0';
        input.style.padding = '0';
        input.style.border = '0';
        input.style.outline = 'none';
        input.style.background = 'transparent';
        input.style.boxSizing = 'border-box';
        input.style.appearance = 'none';

        input.addEventListener('focus', this.handleFocus);
        input.addEventListener('blur', this.handleBlur);
        input.addEventListener('input', this.handleInput);
        input.addEventListener('keydown', this.handleKeyDown);
        input.addEventListener('compositionstart', this.handleCompositionStart);
        input.addEventListener('compositionend', this.handleCompositionEnd);

        document.body.appendChild(input);
        this.input = input;
    }

    private applySessionConfig(sameSession: boolean): void {
        if (!this.input || !this.session) {
            return;
        }

        const { ariaLabel, placeholder, value, style } = this.session;
        this.input.setAttribute('aria-label', ariaLabel);
        this.input.placeholder = placeholder ?? '';

        if (!sameSession || this.input.value !== value) {
            this.input.value = value;
        }

        this.input.style.fontFamily = style.fontFamily;
        this.input.style.fontSize = `${style.fontSize}px`;
        this.input.style.fontWeight = style.fontWeight ?? 'normal';
        this.input.style.color = style.color;
        this.input.style.caretColor = style.caretColor ?? style.color;
        this.input.style.textAlign = style.textAlign ?? 'left';
        this.input.style.lineHeight = `${style.lineHeight ?? style.fontSize}px`;
        this.input.style.setProperty(
            '--native-text-entry-placeholder-color',
            style.placeholderColor ?? '#64748b',
        );
    }

    private focusInput(selectAll: boolean): void {
        if (!this.input) {
            return;
        }

        this.input.focus({ preventScroll: true });
        const selectionEnd = this.input.value.length;
        if (selectAll) {
            this.input.setSelectionRange(0, selectionEnd);
        } else {
            this.input.setSelectionRange(selectionEnd, selectionEnd);
        }
        this.focused = true;
    }

    private syncLayout(): void {
        if (!this.input || !this.session) {
            return;
        }

        const sceneRect = this.session.getBounds();
        const canvas = this.scene.game.canvas as HTMLCanvasElement | undefined;
        const sceneWidth = this.scene.scale.width;
        const sceneHeight = this.scene.scale.height;

        if (!sceneRect || !canvas || sceneWidth <= 0 || sceneHeight <= 0) {
            this.input.style.opacity = '0';
            this.input.style.pointerEvents = 'none';
            return;
        }

        const clientRect = projectSceneRectToClientRect(sceneRect, canvas.getBoundingClientRect(), {
            width: sceneWidth,
            height: sceneHeight,
        });

        this.input.style.left = `${clientRect.x}px`;
        this.input.style.top = `${clientRect.y}px`;
        this.input.style.width = `${clientRect.width}px`;
        this.input.style.height = `${clientRect.height}px`;
        this.input.style.opacity = '1';
        this.input.style.pointerEvents = 'auto';
    }

    private ensurePlaceholderStyle(): void {
        if (typeof document === 'undefined' || document.getElementById(NATIVE_TEXT_ENTRY_STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = NATIVE_TEXT_ENTRY_STYLE_ID;
        style.textContent = `
.${NATIVE_TEXT_ENTRY_CLASS_NAME}::placeholder {
    color: var(--native-text-entry-placeholder-color, #64748b);
    opacity: 1;
}
`;
        document.head.appendChild(style);
    }

    private readonly handleFocus = (): void => {
        this.focused = true;
    };

    private readonly handleBlur = (): void => {
        this.focused = false;

        if (this.suppressBlur || !this.session) {
            return;
        }

        this.session.onBlur?.();
    };

    private readonly handleInput = (): void => {
        if (!this.session || !this.input) {
            return;
        }

        this.session.onValueChange?.(this.input.value);
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.session || !this.input) {
            return;
        }

        const shortcut = getNativeTextEntryShortcut(event, this.compositionActive);
        if (shortcut === 'confirm') {
            event.preventDefault();
            event.stopPropagation();
            this.session.onConfirm?.(this.input.value);
            return;
        }

        if (shortcut === 'cancel') {
            event.preventDefault();
            event.stopPropagation();
            this.session.onCancel?.(this.input.value);
            return;
        }

        if (shortcut === 'block-tab') {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        event.stopPropagation();
    };

    private readonly handleCompositionStart = (): void => {
        this.compositionActive = true;
    };

    private readonly handleCompositionEnd = (): void => {
        this.compositionActive = false;
    };
}
