import { TokenType, lexer } from "./lexer.js";

export class History {
    constructor(maxHistory = 100) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.lastState = "";
    }

    _computeDiff(oldText, newText) {
        let start = 0;
        while (
            start < oldText.length &&
            start < newText.length &&
            oldText[start] === newText[start]
        ) {
            start++;
        }

        let oldEnd = oldText.length - 1;
        let newEnd = newText.length - 1;

        while (
            oldEnd >= start &&
            newEnd >= start &&
            oldText[oldEnd] === newText[newEnd]
        ) {
            oldEnd--;
            newEnd--;
        }

        const removed = oldText.slice(start, oldEnd + 1);
        const added = newText.slice(start, newEnd + 1);

        return { start, removed, added };
    }

    pushState(newText) {
        if (newText === this.lastState) return;

        const diff = this._computeDiff(this.lastState, newText);

        if (diff.removed === "" && diff.added === "") return;

        this.undoStack.push(diff);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.lastState = newText;
    }

    undo(currentText) {
        if (this.undoStack.length === 0) return null;

        const diff = this.undoStack.pop();

        const before = currentText.slice(0, diff.start);
        const after = currentText.slice(diff.start + diff.added.length);
        const restoredText = before + diff.removed + after;

        this.redoStack.push(diff);
        this.lastState = restoredText;

        return {
            text: restoredText,
            cursorPos: diff.start + diff.removed.length
        };
    }

    redo(currentText) {
        if (this.redoStack.length === 0) return null;

        const diff = this.redoStack.pop();

        const before = currentText.slice(0, diff.start);
        const after = currentText.slice(diff.start + diff.added.length);
        const appliedText = before + diff.added + after;

        this.undoStack.push(diff);
        this.lastState = appliedText;

        return {
            text: appliedText,
            cursorPos: diff.start + diff.added.length
        };
    }

    setInitialState(text) {
        this.lastState = text;
        this.undoStack = [];
        this.redoStack = [];
    }
}

export class CodeEditor {
    constructor(codeContainer) {
        this.container = codeContainer;
        this.textarea = this.container.querySelector('textarea');
        this.codePreview = this.container.querySelector('pre');

        this.history = new History();
        this.activeHoveredSpan = null;

        this.styles = {
            [TokenType.KEYWORD]: "keyword",
            [TokenType.IDENTIFIER]: "identifier",
            [TokenType.NUMBER]: "number",
            [TokenType.STRING]: "string",
            [TokenType.OPERATOR]: "operator",
            [TokenType.BRACKET]: "bracket",
            [TokenType.COMMENT]: "comment",
            [TokenType.FUNCTION]: "function",
            [TokenType.ERROR]: "error",
            [TokenType.TEMPLATE_HEAD]: "keyword",
            [TokenType.TEMPLATE_TAIL]: "keyword"
        };

        this.init();
    }

    init() {
        this.bindEvents();

        const defaultCode =
`// Welcome to Bytebeat Tiny!
// This is an live editor for bbt.js library.
/*! 8000 bytebeat infix */
/*  │    │        |
    │    │        └─> Notation
    │    └─> Type
    └─> Sample rate

This is a bytebeat directive. It specifies parameters below:
Sample rate can be wrote: { 8000 | 8k (= 8000) | 44k1 (= 44100) | k8 = (800)}.
Type defines the return value: { bytebeat[bb|byte] | floatbeat[fb|float] | signbeat[sb|sign] | funcbeat[fun] }.
Notation defines the expression notation: { infix[ifx|js] | postfix[rpn|post] | prefix[pre] }.

Funcbeat is supported only in infix notation.
Read more here: https://github.com/the-koroche/bytebeattiny
*/
// Check out the examples below, and try to modify them!
t & t >> 8
// ((t >> 10) & 42) * t
// -(t & t >> 8) | -(t >> 4) | t * t
// t * (t % (t / (t >> 9 | t >> 13)))`;
        this.textarea.value = defaultCode;
        this.history.setInitialState(defaultCode);

        this.updateHighlight();
    }

    bindEvents() {
        this.textarea.addEventListener('scroll', () => {
            this.codePreview.scrollTop = this.textarea.scrollTop;
            this.codePreview.scrollLeft = this.textarea.scrollLeft;
            this.clearUrlHover();
        });

        this.textarea.addEventListener("keyup", () => this.updateCurrentLine());

        this.textarea.addEventListener("click", (e) => {
            this.updateCurrentLine();

            if (e.ctrlKey || e.metaKey) {
                const pos = this.textarea.selectionStart;
                const text = this.textarea.value;
                const url = this.getURLAtPosition(text, pos);
                if (url) {
                    const newWin = window.open(url, '_blank');
                    if (newWin) {
                        newWin.focus();
                    }
                }
            }
        });

        this.textarea.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;

            const urlSpans = this.codePreview.querySelectorAll('.url');
            let foundSpan = null;

            for (const span of urlSpans) {
                const rects = span.getClientRects();
                for (let i = 0; i < rects.length; i++) {
                    const r = rects[i];
                    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                        foundSpan = span;
                        break;
                    }
                }
                if (foundSpan) break;
            }

            if (foundSpan) {
                if (this.activeHoveredSpan !== foundSpan) {
                    if (this.activeHoveredSpan) this.activeHoveredSpan.classList.remove('hover');
                    foundSpan.classList.add('hover');
                    this.activeHoveredSpan = foundSpan;
                }
                this.textarea.style.cursor = 'pointer';
            } else {
                this.clearUrlHover();
            }
        });

        this.textarea.addEventListener('mouseleave', () => {
            this.clearUrlHover();
        });

        this.textarea.addEventListener('input', () => {
            this.history.pushState(this.textarea.value);
            this.updateHighlight();
        });

        // (Tab, Undo, Redo)
        this.textarea.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    clearUrlHover() {
        if (this.activeHoveredSpan) {
            this.activeHoveredSpan.classList.remove('hover');
            this.activeHoveredSpan = null;
        }
        this.textarea.style.cursor = '';
    }

    getURLAtPosition(text, pos) {
        const urlRegex = /(https?:\/\/[^\s"'`<>()[\]{}]+)/g;
        let match;
        while ((match = urlRegex.exec(text)) !== null) {
            let url = match[0];
            let start = match.index;

            while (url.length > 0 && /[.,;:!?)]$/.test(url)) {
                url = url.slice(0, -1);
            }

            let end = start + url.length;
            if (pos >= start && pos <= end) {
                return url;
            }
        }
        return null;
    }

    handleKeyDown(e) {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;

        // Undo: Ctrl+Z
        if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            const result = this.history.undo(this.textarea.value);
            if (result) {
                this.textarea.value = result.text;
                this.textarea.selectionStart = this.textarea.selectionEnd = result.cursorPos;
                this.updateAll();
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if (isCtrlOrCmd && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            const result = this.history.redo(this.textarea.value);
            if (result) {
                this.textarea.value = result.text;
                this.textarea.selectionStart = this.textarea.selectionEnd = result.cursorPos;
                this.updateAll();
            }
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            this.handleTab(e.shiftKey);
            this.history.pushState(this.textarea.value);
            this.updateAll();
        }
    }

    handleTab(isShift) {
        let start = this.textarea.selectionStart;
        let end = this.textarea.selectionEnd;
        const value = this.textarea.value;

        if (start === end) {
            if (!isShift) {
                const before = value.substring(0, start);
                const after = value.substring(start);
                this.textarea.value = before + '    ' + after;
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
            } else {
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = value.indexOf('\n', start);
                const currentLine = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);
                if (currentLine.startsWith('    ')) {
                    const newLine = currentLine.substring(4);
                    this.textarea.value = value.substring(0, lineStart) + newLine + value.substring(lineEnd === -1 ? value.length : lineEnd);
                    const newPos = Math.max(lineStart, start - 4);
                    this.textarea.selectionStart = this.textarea.selectionEnd = newPos;
                }
            }
        } else {
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            let lineEnd = value.indexOf('\n', end);
            if (lineEnd === -1) lineEnd = value.length;

            const block = value.substring(lineStart, lineEnd);
            const beforeBlock = value.substring(0, lineStart);
            const afterBlock = value.substring(lineEnd);

            const lines = block.split('\n');
            let newBlock = !isShift
                ? lines.map(line => '    ' + line).join('\n')
                : lines.map(line => line.startsWith('    ') ? line.substring(4) : line).join('\n');

            this.textarea.value = beforeBlock + newBlock + afterBlock;
            this.textarea.selectionStart = lineStart;
            this.textarea.selectionEnd = lineStart + newBlock.length;
        }
    }

    updateAll() {
        this.updateHighlight();
    }

    updateCurrentLine() {
        const cursor = this.textarea.selectionStart;
        const beforeCursor = this.textarea.value.substring(0, cursor);
        const currentLine = beforeCursor.split("\n").length - 1;

        this.codePreview.querySelectorAll(".line").forEach((el, index) => {
            el.classList.toggle("active", index === currentLine);
        });
    }

    getClass(token) {
        return this.styles[token.type] || "";
    }

    escapeHTML(text) {
        return text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    wrapURLs(escapedText) {
        const urlRegex = /(https?:\/\/[^\s"'`<>()[\]{}]+)/g;
        return escapedText.replace(urlRegex, (fullMatch) => {
            let url = fullMatch;
            let trailing = "";
            while (url.length > 0 && /[.,;:!?)]$/.test(url)) {
                trailing = url.slice(-1) + trailing;
                url = url.slice(0, -1);
            }
            return `<span class="url">${url}</span>${trailing}`;
        });
    }

    highlight(source) {
        const tokens = lexer(source);
        let result = "";
        let last = 0;

        let bracketDepth = 0;
        const MAX_BRACKET_COLORS = 3;

        for (const token of tokens) {
            if (token.type === TokenType.EOF) break;

            const tokenEnd = token.position + token.value.length;
            const unhandled = source.slice(last, token.position);
            result += this.wrapURLs(this.escapeHTML(unhandled));

            const actual = source.slice(token.position, tokenEnd);
            let className = this.getClass(token);

            // Rainbow brackets
            if (token.type === TokenType.BRACKET) {
                const char = token.value;
                if ("([{".includes(char)) {
                    const colorIndex = (bracketDepth % MAX_BRACKET_COLORS) + 1;
                    className = `bracket-${colorIndex}`;
                    bracketDepth++;
                } else if (")]}".includes(char)) {
                    bracketDepth--;
                    if (bracketDepth < 0) {
                        className = `error`;
                    } else {
                        const colorIndex = (bracketDepth % MAX_BRACKET_COLORS) + 1;
                        className = `bracket-${colorIndex}`;
                    }
                }
            }

            if (className && actual === token.value) {
                let escapedContent = this.escapeHTML(actual);

                escapedContent = escapedContent.replaceAll(
                    '\n',
                    `</span>\n<span class="${className}">`
                );

                escapedContent = this.wrapURLs(escapedContent);

                result += `<span class="${className}">${escapedContent}</span>`;
            } else {
                result += this.wrapURLs(this.escapeHTML(actual));
            }

            last = tokenEnd;
        }

        result += this.wrapURLs(this.escapeHTML(source.slice(last)));

        const rawLines = result.split('\n');
        return rawLines.map((lineHTML, index) => {
            const content = lineHTML || '&nbsp;';
            return `<div class="line"><span class="line-number">${index + 1}</span>${content}</div>`;
        }).join('');
    }

    updateHighlight() {
        this.clearUrlHover();
        const source = this.textarea.value;
        this.codePreview.innerHTML = this.highlight(source);
        this.updateCurrentLine();
    }

    get value() { return this.textarea.value; }
    set value(source) {
        this.textarea.value = source;
        this.updateAll();
    }
}