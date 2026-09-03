import { Visualizer } from "./visualizer.js";

export class FFTVisualizer extends Visualizer {
    #freqData = null;
    #useLogScale = true;
    #minFreq = 20;

    constructor(canvas, player, options = {}) {
        super(canvas, player);

        this.colors = {
            mono: [255, 255, 255],
            fill: [255, 255, 255, 50]
        };

        this.#useLogScale = options.useLogScale !== undefined ? options.useLogScale : true;
        if (options.minFreq) this.#minFreq = options.minFreq;

        this._updateAnalyser();
    }

    _updateAnalyser(bufferSize) {
        if (!this.player?.analyser) return;

        if (bufferSize) {
            let fftSize = Math.pow(2, Math.round(Math.log2(bufferSize)));
            fftSize = Math.max(32, Math.min(32768, fftSize));
            this.player.analyser.fftSize = fftSize;
        }

        const binCount = this.player.analyser.frequencyBinCount;
        if (!this.#freqData || this.#freqData.length !== binCount) {
            this.#freqData = new Uint8Array(binCount);
        }
    }

    #cubicInterp(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    render(clearBackground = true) {
        const analyser = this.player?.analyser;
        if (!analyser) return;

        const { ctx, canvas } = this;
        const width = canvas.width;
        const height = canvas.height;

        if (width === 0 || height === 0) return;

        if (this.#freqData?.length !== analyser.frequencyBinCount) {
            this._updateAnalyser();
        }

        analyser.getByteFrequencyData(this.#freqData);

        if (clearBackground) {
            ctx.clearRect(0, 0, width, height);
        }

        const binCount = this.#freqData.length;
        const fftSize = analyser.fftSize;
        const sampleRate = this.player.audioContext?.sampleRate || 44100;
        const maxFreq = sampleRate / 2;

        if (this.#useLogScale) {
            const minFreq = this.#minFreq;
            if (minFreq >= maxFreq) return;

            const freqs = new Float64Array(binCount);
            for (let i = 0; i < binCount; i++) {
                freqs[i] = i * sampleRate / fftSize;
            }

            const getAmplitude = (freq) => {
                if (freq <= freqs[0]) return this.#freqData[0] / 255;
                if (freq >= freqs[binCount - 1]) return this.#freqData[binCount - 1] / 255;

                let left = 0;
                let right = binCount - 1;
                while (right - left > 1) {
                    const mid = (left + right) >> 1;
                    if (freqs[mid] <= freq) left = mid;
                    else right = mid;
                }

                if (freq === freqs[left]) return this.#freqData[left] / 255;
                if (freq === freqs[right]) return this.#freqData[right] / 255;

                const idx0 = Math.max(0, left - 1);
                const idx1 = left;
                const idx2 = right;
                const idx3 = Math.min(binCount - 1, right + 1);

                const y0 = this.#freqData[idx0] / 255;
                const y1 = this.#freqData[idx1] / 255;
                const y2 = this.#freqData[idx2] / 255;
                const y3 = this.#freqData[idx3] / 255;

                const t = (freq - freqs[left]) / (freqs[right] - freqs[left]);

                return this.#cubicInterp(y0, y1, y2, y3, t);
            };

            const points = [];

            for (let px = 0; px < width; px++) {
                const normX = px / width; // 0..1
                const freq = minFreq * Math.pow(maxFreq / minFreq, normX);
                let amp = getAmplitude(freq);

                if (amp < 0) amp = 0;
                if (amp > 1) amp = 1;
                const y = height - amp * height;
                points.push({ x: px, y });
            }

            if (points.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(points[0].x, height);
            for (const p of points) {
                ctx.lineTo(p.x, p.y);
            }
            ctx.lineTo(points[points.length - 1].x, height);
            ctx.closePath();
            const [r, g, b, a] = this.colors.fill;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.strokeStyle = `rgb(${this.colors.mono.join(",")})`;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();

            return;
        }

        const barWidth = width / binCount;
        ctx.fillStyle = `rgb(${this.colors.mono.join(",")})`;
        for (let i = 0; i < binCount; i++) {
            const value = this.#freqData[i] / 255;
            const barHeight = height * value;
            const x = i * barWidth;
            const y = height - barHeight;
            ctx.fillRect(x, y, Math.max(1, barWidth + 1), barHeight);
        }
    }

    resize(bufferSize) {
        this._updateAnalyser(bufferSize);
    }

    destroy() {
        this.#freqData = null;
        super.destroy();
    }
}