const keywords = [
    'await', 'break', 'case',
    'catch', 'class', 'const',
    'continue', 'debugger', 'default',
    'delete', 'do', 'else',
    'enum', 'export', 'extends',
    'false', 'finally', 'for',
    'function', 'if', 'implements',
    'import', 'in', 'instanceof',
    'interface', 'let', 'new',
    'null', 'package', 'private',
    'protected', 'public', 'return',
    'static', 'super', 'switch',
    'this', 'throw', 'true',
    'try', 'typeof', 'var',
    'void', 'while', 'with',
    'yield'
];

// Sorted operators in descenting length for search
const operators = [
    ">>>=",
    "===", "!==", ">>>", "<<=", ">>=", "&&=", "||=", "??=", "...", "**=",
    "==", "!=", "<=", ">=", "++", "--", "<<", ">>", "&&", "||",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "??", "=>", "?.", "**",
    "+", "-", "*", "/", "%", "&", "|", "^", "!", "~", "=", "<", ">", "?", ":",
    ".", ",", ";"
];

export class TokenType {
    static EOF = 0;
    static IDENTIFIER = 1;
    static KEYWORD = 2;
    static NUMBER = 3;
    static STRING = 4;
    static OPERATOR = 5;
    static BRACKET = 6;
    static COMMENT = 7;
    static FUNCTION = 8;
    static VARIABLE = 9;
    static ERROR = 10;
    static TEMPLATE_HEAD = 11;
    static TEMPLATE_TAIL = 12;
}

export class Token {
    constructor(type, value, position) {
        this.type = type;
        this.value = value;
        this.position = position;
        this.end = position + value.length;
    }
}

export function lexer(input) {
    const tokens = [];
    let pos = 0;

    const templateStack = [];
    let inTemplateText = false;

    function peek() {
        return input[pos];
    }

    function advance() {
        return input[pos++];
    }

    function peekNextNonWhitespace() {
        let lookAhead = pos;
        while (lookAhead < input.length && /\s/.test(input[lookAhead])) {
            lookAhead++;
        }
        return input[lookAhead];
    }

    function readNumber() {
        const startPos = pos;

        // Prefixes for hex, binary, and oct numbers
        if (peek() === '0' && pos + 1 < input.length) {
            const next = input[pos + 1].toLowerCase();
            if (next === 'x') {
                pos += 2;
                while (pos < input.length && /[0-9a-fA-F_]/.test(peek())) pos++;
                if (peek() === 'n') pos++; // BigInt
                return new Token(TokenType.NUMBER, input.substring(startPos, pos), startPos);
            } else if (next === 'b') {
                pos += 2;
                while (pos < input.length && /[01_]/.test(peek())) pos++;
                if (peek() === 'n') pos++; // BigInt
                return new Token(TokenType.NUMBER, input.substring(startPos, pos), startPos);
            } else if (next === 'o') {
                pos += 2;
                while (pos < input.length && /[0-7_]/.test(peek())) pos++;
                if (peek() === 'n') pos++; // BigInt
                return new Token(TokenType.NUMBER, input.substring(startPos, pos), startPos);
            }
        }

        let hasDot = false;
        while (pos < input.length) {
            const char = peek();
            if (/[0-9_]/.test(char)) {
                pos++;
            } else if (char === '.' && !hasDot) {
                if (pos + 1 < input.length && /[0-9]/.test(input[pos + 1])) {
                    hasDot = true;
                    pos++;
                } else {
                    break; // Example, 42.toString()
                }
            } else {
                break;
            }
        }

        // Scientific number (1e10, 2.5e-3)
        if (pos < input.length && (peek() === 'e' || peek() === 'E')) {
            const next = input[pos + 1];
            if (/[0-9]/.test(next) || ((next === '+' || next === '-') && pos + 2 < input.length && /[0-9]/.test(input[pos + 2]))) {
                pos++; // Skip 'e'
                if (peek() === '+' || peek() === '-') pos++;
                while (pos < input.length && /[0-9_]/.test(peek())) pos++;
            }
        }

        // Suffix BigInt
        if (pos < input.length && peek() === 'n') {
            pos++;
        }

        return new Token(TokenType.NUMBER, input.substring(startPos, pos), startPos);
    }

    function readIdentifier() {
        const startPos = pos;

        while (pos < input.length && /[a-zA-Z0-9_$]/.test(peek())) {
            pos++;
        }

        const value = input.substring(startPos, pos);

        if (keywords.includes(value)) {
            return new Token(TokenType.KEYWORD, value, startPos);
        }

        if (peekNextNonWhitespace() === '(') {
            return new Token(TokenType.FUNCTION, value, startPos);
        }

        return new Token(TokenType.IDENTIFIER, value, startPos);
    }

    function readOperator() {
        const startPos = pos;
        for (const op of operators) {
            if (input.startsWith(op, pos)) {
                pos += op.length;
                return new Token(TokenType.OPERATOR, op, startPos);
            }
        }
        return new Token(TokenType.ERROR, advance(), startPos);
    }

    function readStandardString(quoteChar) {
        const startPos = pos;
        advance(); // Skip initial bracket

        while (pos < input.length && peek() !== quoteChar) {
            let char = advance();
            if (char === '\\') { // Escaping
                if (pos < input.length) {
                    advance();
                }
            } else if (char === '\n') {
                // Line wrap without escape breaks default line
                break;
            }
        }

        if (pos < input.length && peek() === quoteChar) {
            advance(); // Skip closing bracket
        }
        return new Token(TokenType.STRING, input.substring(startPos, pos), startPos);
    }

    function readRegExp() {
        const startPos = pos;
        advance(); // Skip '/'

        let inClass = false;

        while (pos < input.length) {
            const char = advance();
            if (char === '\\') {
                if (pos < input.length) advance();
            } else if (char === '[') {
                inClass = true;
            } else if (char === ']' && inClass) {
                inClass = false;
            } else if (char === '/' && !inClass) {
                break;
            } else if (char === '\n') {
                break;
            }
        }

        // Regex flags (g, i, m, s, u, y, d)
        while (pos < input.length && /[a-z]/i.test(peek())) {
            advance();
        }

        return new Token(TokenType.STRING, input.substring(startPos, pos), startPos);
    }

    function readTemplateText() {
        const startPos = pos;
        while (pos < input.length) {
            const char = peek();
            if (char === '`') break;
            if (char === '$' && pos + 1 < input.length && input[pos + 1] === '{') break;
            if (char === '\\') {
                advance();
                if (pos < input.length) advance();
            } else {
                advance();
            }
        }
        return new Token(TokenType.STRING, input.substring(startPos, pos), startPos);
    }

    function readTemplateInterpolationStart() {
        const startPos = pos;
        advance(); // $
        advance(); // {
        templateStack.push(0);
        return new Token(TokenType.TEMPLATE_HEAD, '${', startPos);
    }

    function canBeRegExp() {
        if (tokens.length === 0) return true;

        let prev = tokens[tokens.length - 1];
        if (prev.type === TokenType.OPERATOR) return true;
        if (prev.type === TokenType.BRACKET && "({[;,".includes(prev.value)) return true;
        if (prev.type === TokenType.KEYWORD) {
            const regexKeywords = ['return', 'yield', 'case', 'throw', 'else', 'typeof', 'void', 'delete', 'await', 'do', 'in', 'instanceof', 'new'];
            if (regexKeywords.includes(prev.value)) return true;
        }
        return false;
    }

    while (pos < input.length) {
        const char = peek();

        // Comments
        if (char === '/' && input[pos + 1] === '/') {
            const startPos = pos;
            while (pos < input.length && peek() !== '\n') advance();
            tokens.push(new Token(TokenType.COMMENT, input.substring(startPos, pos), startPos));
            continue;
        }
        if (char === '/' && input[pos + 1] === '*') {
            const startPos = pos;
            pos += 2;
            while (pos < input.length) {
                if (peek() === '*' && input[pos + 1] === '/') {
                    pos += 2;
                    break;
                }
                advance();
            }
            tokens.push(new Token(TokenType.COMMENT, input.substring(startPos, pos), startPos));
            continue;
        }

        // RegEx
        if (char === '/' && canBeRegExp()) {
            tokens.push(readRegExp());
            continue;
        }

        // Whitespaces and new lines
        if (/\s/.test(char)) {
            advance();
            continue;
        }

        // Default strings in single and double quotes
        if (char === '"' || char === "'") {
            tokens.push(readStandardString(char));
            continue;
        }

        // Templates
        if (char === '`') {
            const startPos = pos;
            advance();
            tokens.push(new Token(TokenType.STRING, '`', startPos));
            inTemplateText = true;
            tokens.push(readTemplateText());   // can be empty
            continue;
        }

        if (inTemplateText && char === '$' && pos + 1 < input.length && input[pos + 1] === '{') {
            const startPos = pos;
            advance(); // $
            advance(); // {
            inTemplateText = false;
            templateStack.push(0);
            tokens.push(new Token(TokenType.TEMPLATE_HEAD, '${', startPos));
            continue;
        }

        if (templateStack.length > 0 && char === '}') {
            if (templateStack[templateStack.length - 1] === 0) {
                const startPos = pos;
                advance();
                templateStack.pop();
                tokens.push(new Token(TokenType.TEMPLATE_TAIL, '}', startPos));

                inTemplateText = true;
                if (pos < input.length && peek() === '`') {
                    const btPos = pos;
                    advance();
                    tokens.push(new Token(TokenType.STRING, '`', btPos));
                    inTemplateText = false;
                } else {
                    tokens.push(readTemplateText());
                }
                continue;
            }
        }

        // Start of interpolation ${
        if (char === '$' && input[pos + 1] === '{' && templateStack.length > 0) {
            tokens.push(readTemplateInterpolationStart());
            continue;
        }

        // Numbers
        if (/[0-9]/.test(char) || (char === '.' && pos + 1 < input.length && /[0-9]/.test(input[pos + 1]))) {
            tokens.push(readNumber());
            continue;
        }

        // Identifiers | Keywords | Methods
        if (/[a-zA-Z_$]/.test(char)) {
            tokens.push(readIdentifier());
            continue;
        }

        if ("()[]{}".includes(char)) {
            const startPos = pos;
            if (char === '{' && templateStack.length > 0) {
                templateStack[templateStack.length - 1]++;
            } else if (char === '}' && templateStack.length > 0) {
                templateStack[templateStack.length - 1]--;
            }
            tokens.push(new Token(TokenType.BRACKET, advance(), startPos));
            continue;
        }

        if ("+-*/&|^<>!=%~?:.,;".includes(char)) {
            tokens.push(readOperator());
            continue;
        }

        const startPos = pos;
        tokens.push(new Token(TokenType.ERROR, advance(), startPos));
    }

    tokens.push(new Token(TokenType.EOF, "", pos));
    return tokens;
}