/*
MIT License

Copyright (c) 2026 Alex Soloviov (aka Theko)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Removes JavaScript-style block (/* ... *\/) and line (// ...) comments
 * from the source code while preserving strings and RegEx literals.
 * @param {string} expr - Raw JavaScript/expression string.
 * @param {Object} [config={}] - Configuration options.
 * @param {boolean} [config.preserveBytebeatDirective=false] - Whether to keep the first /*! ... *\/ comment.
 * @returns {string} Expression with comments removed.
 */
function removeJsComments(expr, config = {}) {
    const preserveBytebeatDirective = config.preserveBytebeatDirective ?? false;

    let result = '';
    let hasSeenBlockComment = false;

    const stateStack = ['NORMAL'];
    let quoteChar = '';
    let inRegexCharClass = false; // Tracks [...] inside RegEx
    const braceDepthStack = [];

    const getCurrentState = () => stateStack[stateStack.length - 1];

    // Helper: checks if '/' after this position starts a RegEx literal rather than division
    const isRegexStartContext = (str) => {
        const trimmed = str.trimEnd();
        if (!trimmed) return true;
        const lastChar = trimmed[trimmed.length - 1];
        return /[(=:;,?!&|^~+*/%<>{\[-]/.test(lastChar) ||
            /\b(return|case|throw|yield|await|typeof|void|delete)$/.test(trimmed);
    };

    for (let i = 0; i < expr.length; i++) {
        const char = expr[i];
        const nextChar = expr[i + 1];
        const currentState = getCurrentState();

        // Single-line comments
        if (currentState === 'LINE_COMMENT') {
            if (char === '\n') {
                stateStack.pop();
                result += char;
            }
            continue;
        }

        // Multi-line comments
        if (currentState === 'BLOCK_COMMENT') {
            if (char === '*' && nextChar === '/') {
                stateStack.pop();
                i++; // Skip '/'
            } else if (char === '\n') {
                result += char;
            }
            continue;
        }

        // Preserved Multi-line comments (/*! ... */)
        if (currentState === 'PRESERVED_BLOCK_COMMENT') {
            result += char;
            if (char === '*' && nextChar === '/') {
                result += nextChar;
                stateStack.pop();
                i++; // Skip '/'
            }
            continue;
        }

        // Regular Expressions
        if (currentState === 'REGEX') {
            result += char;

            if (char === '\\') {
                // Escaped character
                if (nextChar) {
                    result += nextChar;
                    i++;
                }
            } else if (char === '[') {
                inRegexCharClass = true;
            } else if (char === ']' && inRegexCharClass) {
                inRegexCharClass = false;
            } else if (char === '/' && !inRegexCharClass) {
                // End of RegEx literal
                stateStack.pop();
                // Copy RegEx flags (g, i, m, u, y, s, d, v)
                while (i + 1 < expr.length && /[a-z]/i.test(expr[i + 1])) {
                    result += expr[i + 1];
                    i++;
                }
            }
            continue;
        }

        // Strings (including template literals)
        if (currentState === 'STRING') {
            result += char;

            if (char === '\\') {
                if (nextChar) {
                    result += nextChar;
                    i++;
                }
                continue;
            }

            if (quoteChar === '`' && char === '$' && nextChar === '{') {
                result += nextChar;
                i++; // Skip '{'
                stateStack.push('NORMAL');
                braceDepthStack.push(1);
                continue;
            }

            if (char === quoteChar) {
                stateStack.pop();
            }
            continue;
        }

        // Regular code (NORMAL)
        if (currentState === 'NORMAL') {
            // Strings
            if (char === '"' || char === "'" || char === '`') {
                stateStack.push('STRING');
                quoteChar = char;
                result += char;
            }
            // Start of single-line comment
            else if (char === '/' && nextChar === '/') {
                stateStack.push('LINE_COMMENT');
                i++;
            }
            // Start of multi-line comment
            else if (char === '/' && nextChar === '*') {
                const isDirective = preserveBytebeatDirective &&
                                   !hasSeenBlockComment &&
                                   expr[i + 2] === '!';

                hasSeenBlockComment = true;

                if (isDirective) {
                    stateStack.push('PRESERVED_BLOCK_COMMENT');
                    result += char + nextChar;
                } else {
                    stateStack.push('BLOCK_COMMENT');
                }
                i++; // Skip '*'
            }
            // Start of RegEx literal
            else if (char === '/' && isRegexStartContext(result)) {
                stateStack.push('REGEX');
                inRegexCharClass = false;
                result += char;
            }
            // Track curly braces inside ${ ... }
            else {
                if (braceDepthStack.length > 0) {
                    if (char === '{') {
                        braceDepthStack[braceDepthStack.length - 1]++;
                    } else if (char === '}') {
                        braceDepthStack[braceDepthStack.length - 1]--;

                        if (braceDepthStack[braceDepthStack.length - 1] === 0) {
                            braceDepthStack.pop();
                            stateStack.pop(); // Exit NORMAL back to STRING
                            result += char;
                            continue;
                        }
                    }
                }
                result += char;
            }
        }
    }
    return result.trim();
}

/**
 * @param {string} type - Bytebeat type (bytebeat, floatbeat, ...).
 * @param {number} v - Bytebeat output value.
 * @returns {number} Normalizes bytebeat output value to range [-1.0, 1.0].
 */
function normalizeBytebeat(type, v) {
    switch (type) {
        case 'bytebeat':
            return (v & 255) / 127.5 - 1;
        case 'signbeat':
            return v / 128;
        case 'floatbeat':
        case 'funcbeat':
            return Math.max(-1, Math.min(1, v));
        default:
            return 0;
    }
}

/**
 * @typedef {Object} ParsedBytebeat
 * @property {number} sampleRate - The parsed audio sample rate in Hz.
 * @property {string} type - The bytebeat type (e.g., 'bytebeat', 'floatbeat').
 * @property {string} notation - The expression notation ('infix', 'postfix', 'prefix').
 * @property {string} expression - The sanitized source expression code.
 */

/**
 * Parser for Bytebeat source strings and bytebeat directives.
 */
class BytebeatParser {
    /** @type {Record<string, string>} */
    static typeAliases = {
        bb: 'bytebeat', byte: 'bytebeat', unsigned: 'bytebeat', bytebeat: 'bytebeat',
        fb: 'floatbeat', float: 'floatbeat', floatbeat: 'floatbeat',
        sb: 'signbeat', sign: 'signbeat', signed: 'signbeat', signbeat: 'signbeat',
        fun: 'funcbeat', func: 'funcbeat', funcbeat: 'funcbeat', function: 'funcbeat',
    };

    /** @type {Record<string, string>} */
    static notationAliases = {
        js: 'infix', ifx: 'infix', infix: 'infix',
        rpn: 'postfix', pox: 'postfix', post: 'postfix', postfix: 'postfix',
        prx: 'prefix', pre: 'prefix', prefix: 'prefix',
    };

    /** @type {number} */
    static defaultSampleRate = 8000;
    /** @type {string} */
    static defaultType = 'bytebeat';
    /** @type {string} */
    static defaultNotation = 'infix';

    /** @type {RegExp} */
    static #bbtDirectiveBlockRegex = /\/\*!\s*([\s\S]*?)\s*\*\//;

    /**
     * Parses the raw bytebeat source string to extract bytebeat directive and clean expression.
     * * @param {string} source - Raw bytebeat source text.
     * @returns {ParsedBytebeat} Parsed bytebeat directive and output code string.
     */
    static parse(source) {
        const match = source.match(BytebeatParser.#bbtDirectiveBlockRegex);

        let sampleRate = BytebeatParser.defaultSampleRate;
        let type = BytebeatParser.defaultType;
        let notation = BytebeatParser.defaultNotation;

        if (match) {
            const content = match[1].trim();

            if (content.startsWith('{') && content.endsWith('}')) {
                const parsed = BytebeatParser.#parseObjectBBTDirective(content);

                if (parsed.sampleRate) sampleRate = BytebeatParser.#parseSampleRate(parsed.sampleRate);

                if (parsed.type) type = BytebeatParser.#resolveAlias(parsed.type,
                    BytebeatParser.typeAliases, BytebeatParser.defaultType);

                if (parsed.notation) notation = BytebeatParser.#resolveAlias(parsed.notation,
                    BytebeatParser.notationAliases, BytebeatParser.defaultNotation);

            } else {
                const tokens = content.split(/[\s,]+/).filter(Boolean);

                let found = { sampleRate: false, type: false, notation: false };
                for (const token of tokens) {
                    if (!found.sampleRate) {
                        try {
                            sampleRate = BytebeatParser.#parseSampleRate(token);
                            found.sampleRate = true;
                            continue;
                        } catch {}
                    }

                    const lower = token.toLowerCase();

                    if (BytebeatParser.typeAliases[lower] && !found.type) {
                        type = BytebeatParser.typeAliases[lower];
                        found.type = true;
                        continue;
                    }

                    if (BytebeatParser.notationAliases[lower] && !found.notation) {
                        notation = BytebeatParser.notationAliases[lower];
                        found.notation = true;
                        continue;
                    }
                }
            }
        }

        if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
            throw new RangeError(
                `Invalid sample rate: ${sampleRate}. Expected a positive finite number.`
            );
        }

        if (type === 'funcbeat' && notation !== 'infix')
            throw new Error('Invalid type: funcbeat is defined only for infix');

        let expression = removeJsComments(source.replace(BytebeatParser.#bbtDirectiveBlockRegex, '').trim());
        // Convert notation to JS formula if prefix or postfix
        if (notation === 'postfix') {
            expression = BytebeatParser.postfixToFunction(expression);
        } else if (notation === 'prefix') {
            expression = BytebeatParser.prefixToFunction(expression);
        }

        return { sampleRate, type, notation, expression, };
    }

    static #unaryOperators = new Set(["~", "!"]);
    static #binaryOperators = new Set([
        '+', '-', '*', '/',
        '%', '**',
        '&', '|', '^',
        '<<', '>>', '>>>',
        '==', '!=', '<', '>',
        '<=', '>='
    ]);

    static #notationToFunction(expr, mode) {
        let tokens = expr.trim().split(/\s+/).filter(Boolean);
        const prefix = mode === 'prefix';
        if (prefix)
            tokens.reverse();

        const stack = [];
        for (const token of tokens) {
            if (BytebeatParser.#unaryOperators.has(token)) {
                if (stack.length < 1)
                    throw new Error(`Invalid ${mode} expression: insufficient operand for ${token}`);

                const v = stack.pop();
                stack.push(`(${token}${v})`);
            } else if (BytebeatParser.#binaryOperators.has(token)) {
                if (stack.length < 2)
                    throw new Error(`Invalid ${mode} expression: insufficient operands for ${token}`);

                const left = stack.pop();
                const right = stack.pop();

                if (prefix) {
                    stack.push(`(${left} ${token} ${right})`);
                } else {
                    stack.push(`(${right} ${token} ${left})`);
                }
            } else if (BytebeatParser.#isMathFunction(token)) {
                if (stack.length < 1)
                    throw new Error(`Invalid ${mode} expression: insufficient operand for function ${token}`);

                stack.push(`Math.${token}(${stack.pop()})`);
            } else {
                // Number or variable (e.g., 't')
                stack.push(token);
            }
        }

        if (stack.length !== 1)
            throw new Error(`Invalid ${mode} expression: stack remaining size ${stack.length}`);

        return stack[0];
    }


    /**
     * Converts a Reverse Polish Notation (Postfix) expression into a valid JavaScript expression string.
     * * @param {string} expr - Space-separated postfix string (e.g. "t 8 * 255 &").
     * @returns {string} JavaScript expression body.
     * @throws {Error} If expression contains invalid operators or unbalanced stack.
     */
    static postfixToFunction(expr) {
        return BytebeatParser.#notationToFunction(expr, 'postfix');
    }

    /**
     * Converts a Polish Notation (Prefix) expression into a valid JavaScript expression string.
     * * @param {string} expr - Space-separated prefix string (e.g. "* t 8").
     * @returns {string} JavaScript expression body.
     * @throws {Error} If expression contains invalid operators or unbalanced stack.
     */
    static prefixToFunction(expr) {
        return BytebeatParser.#notationToFunction(expr, 'prefix');
    }

    /**
     * Checks if a token is a valid single-argument Math function.
     * * @param {string} token - Token name.
     * @returns {boolean} True if function exists on Math object.
     */
    static #isMathFunction(token) {
        return typeof Math[token] === 'function';
    }

    /**
     * Parses bytebeat directive formatted as JSON-like key-value pairs.
     * * @param {string} content - Raw inner bytebeat directive block string.
     * @returns {Record<string, string>} Dictionary of bytebeat directive key-values.
     */
    static #parseObjectBBTDirective(content) {
        const result = {};
        const inner = content.slice(1, -1);
        const pairs = inner.split(',');

        for (const pair of pairs) {
            const [rawKey, rawValue] = pair.split(':');
            if (rawKey && rawValue) {
                const key = rawKey.trim().replace(/^["']|["']$/g, '');
                const value = rawValue.trim().replace(/^["']|["']$/g, '');
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Resolves value against target alias mapping dictionary.
     * * @param {string} raw - Raw key string.
     * @param {Record<string, string>} aliasMap - Dictionary map of supported aliases.
     * @param {string} defaultValue - Fallback default value.
     * @returns {string} Resolved canonical name.
     */
    static #resolveAlias(raw, aliasMap, defaultValue) {
        const cleaned = raw.trim().toLowerCase();
        return aliasMap[cleaned] ?? defaultValue;
    }

    /**
     * Parses sample rate string including shortcuts like "44k1", "8k", "8.5k", "44.1k".
     * @param {string|number} raw - Input string representation of sample rate.
     * @returns {number} Integer sample rate in Hz.
     */
    static #parseSampleRate(raw) {
        const str = String(raw).trim().toLowerCase();

        if (!str)
            return BytebeatParser.defaultSampleRate;

        // Exact Hz
        if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(str)) {
            return parseFloat(str);
        }

        // <number>k => kHz
        const kilo = str.match(/^(\d+(?:\.\d+)?|\.\d+)k$/);
        if (kilo) {
            return parseFloat(kilo[1]) * 1000;
        }

        // RKM-like notation: <integer>k<integer>
        const rkm = str.match(/^(\d+)k(\d+)$/);
        if (rkm) {
            return Number(`${rkm[1]}.${rkm[2]}`) * 1000;
        }

        throw new Error(`Invalid sample rate format: "${raw}"`);
    }
}

// Source string for the AudioWorklet script, which runs in an isolated audio-rendering thread
const workletSource = `
class BytebeatProcessor extends AudioWorkletProcessor {
    /**
     * @type {Record<string, function(number): number>}
     */
    static normalizers = {
        bytebeat: v => ((v & 255) / 127.5) - 1,
        signbeat: v => v / 128,
        floatbeat: v => Math.max(-1, Math.min(1, v)),
        funcbeat: v => Math.max(-1, Math.min(1, v)),
    };

    constructor() {
        super();
        this.t = 0;
        this.renderFn = null;
        this.normalizeFn = BytebeatProcessor.normalizers.bytebeat;
        this.bbtType = 'bytebeat';
        this.speed = 0;
        this.targetSampleRate = 8000;
        this.contextSampleRate = 44100;

        this.lastT = -1;
        this.lastLeft = 0;
        this.lastRight = 0;
        this.lastIsStereo = false;

        this.samplesSinceLastUpdate = 0;
        this.updateIntervalSamples = 512;

        this.buffer = {
            left: new Float32Array(this.updateIntervalSamples),
            right: new Float32Array(this.updateIntervalSamples)
        };
        this.bufIndex = 0;

        this.port.onmessage = (event) => this.#handleMessage(event.data);
    }

    #handleMessage(data) {
        switch (data.type) {
            case 'init':
                this.#loadExpression(data);
                break;
            case 'speed':
                this.speed = data.speed;
                break;
            case 'set-t':
                this.t = data.value;
                break;
        }
    }

    #loadExpression({ expression, bbtType, sampleRate, ctxSampleRate }) {
        try {
            this.bbtType = bbtType || 'bytebeat';
            this.targetSampleRate = sampleRate || 8000;
            this.contextSampleRate = ctxSampleRate || 44100;
            this.normalizeFn = BytebeatProcessor.normalizers[this.bbtType] ?? BytebeatProcessor.normalizers.bytebeat;

            if (this.bbtType === 'funcbeat') {
                const outerFn = new Function('t', \`with(Math){ \${expression} }\`);
                const userFn = outerFn();
                this.renderFn = typeof userFn === 'function' ? userFn : null;
            } else {
                this.renderFn = new Function('t', \`with(Math){ return \${expression}; }\`);
            }
        } catch {
            this.renderFn = null;
        }
    }

    process(_inputs, outputs) {
        const renderFn = this.renderFn;
        if (!renderFn || this.speed === 0) {
            const output = outputs[0];
            for (let c = 0; c < output.length; c++) output[c].fill(0);
            return true;
        }

        const output = outputs[0];
        const channelCount = output.length;
        const bufferSize = output[0].length;
        const out0 = output[0];
        const out1 = channelCount > 1 ? output[1] : null;

        const normalize = this.normalizeFn;
        const targetSR = this.targetSampleRate;
        const dt = (targetSR / this.contextSampleRate) * this.speed;
        const isFuncbeat = this.bbtType === 'funcbeat';

        let t = this.t;
        let lastT = this.lastT;
        let lastLeft = this.lastLeft;
        let lastRight = this.lastRight;
        let lastIsStereo = this.lastIsStereo;

        const bufLeft = this.buffer.left;
        const bufRight = this.buffer.right;
        let bufIndex = this.bufIndex;

        for (let i = 0; i < bufferSize; i++) {
            const currentT = t | 0;

            if (currentT !== lastT) {
                let value;
                try {
                    value = isFuncbeat
                        ? renderFn(currentT / targetSR, targetSR)
                        : renderFn(currentT);

                    if (typeof value !== 'number' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
                        value = 0;
                    }
                } catch {
                    value = 0;
                }

                lastIsStereo = Array.isArray(value) || ArrayBuffer.isView(value);

                let leftRaw = lastIsStereo ? value[0] : value;
                let rightRaw = lastIsStereo ? (value[1] ?? value[0]) : value;

                if (!Number.isFinite(leftRaw))  leftRaw = 0;
                if (!Number.isFinite(rightRaw)) rightRaw = 0;

                lastLeft = Math.max(-1, Math.min(1, normalize(leftRaw)));
                lastRight = Math.max(-1, Math.min(1, normalize(rightRaw)));
                lastT = currentT;
            }

            if (bufIndex < this.updateIntervalSamples) {
                bufLeft[bufIndex] = lastLeft;
                bufRight[bufIndex] = lastRight;
                bufIndex++;
            }

            out0[i] = lastLeft;
            if (out1) out1[i] = lastRight;

            t += dt;
        }

        this.t = t;
        this.lastT = lastT;
        this.lastLeft = lastLeft;
        this.lastRight = lastRight;
        this.lastIsStereo = lastIsStereo;
        this.bufIndex = bufIndex;

        this.samplesSinceLastUpdate += bufferSize;
        if (this.samplesSinceLastUpdate >= this.updateIntervalSamples) {
            this.port.postMessage({
                type: 't-update',
                t: lastT,
                isMono: !lastIsStereo,
                buffer: {
                    left: bufLeft,
                    right: bufRight,
                }
            }, [bufLeft.buffer, bufRight.buffer]);

            this.buffer.left = new Float32Array(this.updateIntervalSamples);
            this.buffer.right = new Float32Array(this.updateIntervalSamples);
            this.bufIndex = 0;
            this.samplesSinceLastUpdate = 0;
        }

        return true;
    }
}

registerProcessor('bytebeat-processor', BytebeatProcessor);
`;

/**
 * Controller class managing AudioContext, AudioWorklet initialization, and playback controls.
 */
class BytebeatPlayer {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        /** @type {AudioWorkletNode|null} */
        this.workletNode = null;
        /** @type {GainNode|null} */
        this.gainNode = null;
        /** @type {AnalyserNode|null} */
        this.analyser = null;

        this._sampleRate = BytebeatParser.defaultSampleRate;
        this._type = BytebeatParser.defaultType;
        this._expression = '';
        this._speed = 0;
        this._t = 0;
        this._workletUrl = null;
        this.eventbus = new EventTarget();

        this.isReady = false;
        /** @type {((t: number) => void)|null} */
        this.onTimeUpdate = null;
    }

    /**
     * Initializes the player, Web Audio API context, and registers AudioWorklet processor.
     * * @param {AudioContext} [audioContext=null] - Optional existing AudioContext instance.
     * @param {number} [gain=0.75] - Initial output volume level.
     * @returns {Promise<void>}
     */
    async init(audioContext = null, gain = 0.75) {
        if (this.isReady) return;

        this.ctx = audioContext ?? new (window.AudioContext || window.webkitAudioContext)();

        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
            this.eventbus.dispatchEvent(new CustomEvent('ctx-resumed'));
            console.debug("[BBT] AudioContext resumed");
        }

        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = gain;

        const blob = new Blob([workletSource], { type: 'application/javascript' });
        this._workletUrl = URL.createObjectURL(blob);

        await this.ctx.audioWorklet.addModule(this._workletUrl);

        this.workletNode = new AudioWorkletNode(this.ctx, 'bytebeat-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });

        this.workletNode.port.onmessage = ({ data }) => {
            if (data.type === 't-update') {
                this._t = data.t;
                this.eventbus.dispatchEvent(new CustomEvent('t-update',
                    { detail: { t: this._t }}));

                if (data.buffer) {
                    this.eventbus.dispatchEvent(new CustomEvent('buffer-data',
                        { detail: { buffer: data.buffer }}));
                }

                this.onTimeUpdate?.(this._t);
            }
        };

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;

        this.workletNode.connect(this.analyser);
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);

        this.isReady = true;
        this.eventbus.dispatchEvent(new CustomEvent('initialized'));
    }

    /**
     * Loads and parses a raw source string containing bytebeat directive and math formulas.
     * * @param {string} source - Bytebeat source code with bytebeat directives.
     * @returns {{success: boolean, parsed?: ParsedBytebeat, error?: string}} Operation status details.
     */
    load(source) {
        try {
            const parsed = BytebeatParser.parse(source);

            if (parsed.type === 'funcbeat') {
                const fn = new Function('t', `with(Math){ ${parsed.expression} }`);
                const result = fn();
                if (typeof result !== 'function') {
                    throw new Error('Funcbeat expression must return a function');
                }
            } else {
                new Function('t', `with(Math){ return ${parsed.expression}; }`);
            }

            this._expression = parsed.expression;
            this._type = parsed.type;
            this._sampleRate = parsed.sampleRate;

            this._syncWorklet();
            this.eventbus.dispatchEvent(new CustomEvent('loaded'));
            return { success: true, parsed };
        } catch (err) {
            console.warn("[BBT] Failed to parse. ", err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Sends the current state and parameters to the active AudioWorklet thread instance.
     * @private
     */
    async _syncWorklet() {
        if (!this.workletNode || !this.ctx) return;
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
            this.eventbus.dispatchEvent(new CustomEvent('ctx-resumed'));
            console.debug("[BBT] AudioContext resumed");
        }

        this.workletNode.port.postMessage({
            type: 'init',
            expression: this._expression,
            bbtType: this._type,
            sampleRate: this._sampleRate,
            ctxSampleRate: this.ctx.sampleRate,
            speed: this._speed,
        });
    }

    /** Starts playback at normal speed. */
    play() {
        if (this.speed === 0) {
            this.speed = 1;
        }
    }

    /** Pauses playback. */
    pause() { this.speed = 0; }

    /** Stops playback and resets the global step counter t to 0. */
    stop() { this.speed = 0; this.t = 0; }

    /** @param {number} value - Gain output volume level. */
    set volume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = value;
        }
    }

    /** @returns {number|undefined} Gain output volume level. */
    get volume() { return this.gainNode?.gain.value; }

    /** @param {number} value - Time parameter step index. */
    set t(value) {
        this._t = value;
        this.workletNode?.port.postMessage({ type: 'set-t', value });
    }

    /** @returns {number} Current time step index t. */
    get t() { return this._t; }

    /** @param {number} value - Speed factor (1 = normal, -1 = reverse, 0 = paused). */
    set speed(value) {
        this._speed = value;
        this.workletNode?.port.postMessage({ type: 'speed', speed: value });
    }

    /** @returns {number} Current playback speed multiplier. */
    get speed() { return this._speed; }

    /** @returns {number} Sample rate provided by parser from load() */
    get sampleRate() { return this._sampleRate; }

    /** @returns {string} Bytebeat type provided by parser from load() */
    get type() { return this._type; }

    /** @returns {string} Expression without comments provided by parser from load() */
    get expression() { return this._expression; }

    /**
     * Cleans up node connections and revokes active dynamic blob object URLs.
     */
    destroy() {
        this.pause();
        this.workletNode?.disconnect();
        this.gainNode?.disconnect();
        if (this._workletUrl) URL.revokeObjectURL(this._workletUrl);
        this.isReady = false;
        console.debug('[BBT] Destroyed');
    }
}

/**
 * Renders a bytebeat source expression into normalized audio buffers.
 *
 * @param {string} source - Bytebeat source expression to parse and render.
 * @param {number} [speed=1] - Time-step increment; negative values render in reverse.
 * @param {{start: number, end: number}} [tRange={start: 0, end: 44100}] - Start and end time-step bounds.
 * @param {((progress: {processedT: number, processedSamples: number, totalSamples: number, percent: number}) => void)|null} [onProgress=null] - Optional progress callback.
 * @returns {{buffer: {left: Float32Array, right: Float32Array|null}, sampleRate: number, channels: number, type: string, notation: string}} Rendered audio data and metadata.
 * @throws {Error} If speed is zero or the source cannot be parsed or compiled.
 */
function renderBytebeat(
    source,
    speed = 1,
    tRange = { start: 0, end: 44100 },
    onProgress = null
) {
    if (speed === 0) {
        throw new Error('Speed cannot be zero');
    }

    const parsed = BytebeatParser.parse(source);
    const { expression, type, sampleRate } = parsed;

    let renderFn;
    if (type === 'funcbeat') {
        const outerFn = new Function('t', `with(Math){ ${expression} }`);
        const userFn = outerFn();
        if (typeof userFn !== 'function') {
            throw new Error('Funcbeat expression must return a function');
        }
        renderFn = userFn;
    } else {
        renderFn = new Function('t', `with(Math){ return ${expression}; }`);
    }

    const start = tRange.start;
    const end = tRange.end;
    const step = speed;
    const totalSamples = Math.max(0, Math.ceil(Math.abs(end - start) / Math.abs(step)));

    const leftBuffer = new Float32Array(totalSamples);
    let rightBuffer = null;
    let isStereo = false;
    const isFuncbeat = type === 'funcbeat';
    const normalize = normalizeBytebeat;
    const progressChunk = 1000;

    let writeIdx = 0;
    let t = start;

    // Mono phase
    while ((step > 0 ? t < end : t > end) && !isStereo) {
        const currentT = Math.floor(t);
        let rawValue;
        try {
            rawValue = isFuncbeat
                ? renderFn(currentT / sampleRate, sampleRate)
                : renderFn(currentT);
        } catch {
            rawValue = 0;
        }

        const hasStereoSignal = Array.isArray(rawValue) || ArrayBuffer.isView(rawValue);

        if (hasStereoSignal) {
            // Goto stereo phase
            isStereo = true;
            rightBuffer = new Float32Array(totalSamples);
            rightBuffer.set(leftBuffer.subarray(0, writeIdx));

            let leftRaw = rawValue[0];
            let rightRaw = rawValue[1] ?? rawValue[0];
            if (typeof leftRaw !== 'number' || !Number.isFinite(leftRaw)) leftRaw = 0;
            if (typeof rightRaw !== 'number' || !Number.isFinite(rightRaw)) rightRaw = 0;

            leftBuffer[writeIdx] = normalize(type, leftRaw);
            rightBuffer[writeIdx] = normalize(type, rightRaw);
            writeIdx++;

            if (onProgress && (writeIdx % progressChunk === 0 || writeIdx === totalSamples)) {
                onProgress({
                    processedT: currentT,
                    processedSamples: writeIdx,
                    totalSamples,
                    percent: Math.round((writeIdx / totalSamples) * 100)
                });
            }

            t += step;
            break; // Goto stereo phase
        } else {
            let leftRaw = rawValue;
            if (typeof leftRaw !== 'number' || !Number.isFinite(leftRaw)) leftRaw = 0;
            leftBuffer[writeIdx] = normalize(type, leftRaw);
            writeIdx++;

            if (onProgress && (writeIdx % progressChunk === 0 || writeIdx === totalSamples)) {
                onProgress({
                    processedT: currentT,
                    processedSamples: writeIdx,
                    totalSamples,
                    percent: Math.round((writeIdx / totalSamples) * 100)
                });
            }

            t += step;
        }
    }

    // Stereo phase
    while (isStereo && (step > 0 ? t < end : t > end)) {
        const currentT = Math.floor(t);
        let rawValue;
        try {
            rawValue = isFuncbeat
                ? renderFn(currentT / sampleRate, sampleRate)
                : renderFn(currentT);
        } catch {
            rawValue = 0;
        }

        let leftRaw, rightRaw;
        if (Array.isArray(rawValue) || ArrayBuffer.isView(rawValue)) {
            leftRaw = rawValue[0];
            rightRaw = rawValue[1] ?? rawValue[0];
        } else {
            leftRaw = rawValue;
            rightRaw = rawValue;
        }

        if (typeof leftRaw !== 'number' || !Number.isFinite(leftRaw)) leftRaw = 0;
        if (typeof rightRaw !== 'number' || !Number.isFinite(rightRaw)) rightRaw = 0;

        leftBuffer[writeIdx] = normalize(type, leftRaw);
        rightBuffer[writeIdx] = normalize(type, rightRaw);
        writeIdx++;

        if (onProgress && (writeIdx % progressChunk === 0 || writeIdx === totalSamples)) {
            onProgress({
                processedT: currentT,
                processedSamples: writeIdx,
                totalSamples,
                percent: Math.round((writeIdx / totalSamples) * 100)
            });
        }

        t += step;
    }

    return {
        buffer: {
            left: leftBuffer,
            right: rightBuffer
        },
        sampleRate,
        channels: isStereo ? 2 : 1,
        type,
        notation: parsed.notation,
    };
}

export { BytebeatParser, BytebeatPlayer,
    removeJsComments, normalizeBytebeat, renderBytebeat };