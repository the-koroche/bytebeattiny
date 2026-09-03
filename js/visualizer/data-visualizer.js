import { Visualizer } from "./visualizer.js";

export class DataVisualizer extends Visualizer {
    constructor(canvas, bbtplayer, bufferSize = 8000) {
        super(canvas, bbtplayer);

        this.bufferSize = bufferSize;
        this.capacity = 262144; // 2^18 ring buffer

        this.ringLeft = new Float32Array(this.capacity);
        this.ringRight = new Float32Array(this.capacity);

        this.writePos = 0;
        this.readPos = 0;
        this.isMono = true;

        this._onBufferData = this._onBufferData.bind(this);
        this.player?.eventbus?.addEventListener("buffer-data", this._onBufferData);
    }

    _onBufferData(e) {
        const buffer = e.detail?.buffer;
        if (!buffer?.left?.length) return;

        const { left, right, isMono } = buffer;
        this.isMono = isMono;
        const len = left.length;

        for (let i = 0; i < len; i++) {
            const idx = (this.writePos + i) % this.capacity;
            this.ringLeft[idx] = left[i];
            this.ringRight[idx] = (!isMono && right) ? right[i] : left[i];
        }

        this.writePos = (this.writePos + len) % this.capacity;

        if (this.getUnreadSamplesCount() > this.capacity - 2000) {
            this.readPos = (this.writePos - this.bufferSize + this.capacity) % this.capacity;
        }
    }

    getUnreadSamplesCount() {
        return (this.writePos - this.readPos + this.capacity) % this.capacity;
    }

    getPeakLeft(offset, count) {
        let max = 0;
        for (let i = 0; i < count; i++) {
            const idx = (this.readPos + offset + i) % this.capacity;
            const val = Math.abs(this.ringLeft[idx]);
            if (val > max) max = val;
        }
        return Math.min(1, max);
    }

    getPeakRight(offset, count) {
        let max = 0;
        for (let i = 0; i < count; i++) {
            const idx = (this.readPos + offset + i) % this.capacity;
            const val = Math.abs(this.ringRight[idx]);
            if (val > max) max = val;
        }
        return Math.min(1, max);
    }

    getMinMaxLeft(offset, count) {
        let min = 0, max = 0;
        for (let i = 0; i < count; i++) {
            const idx = (this.readPos + offset + i) % this.capacity;
            const val = this.ringLeft[idx];
            if (val < min) min = val;
            if (val > max) max = val;
        }
        return { min, max };
    }

    getMinMaxRight(offset, count) {
        let min = 0, max = 0;
        for (let i = 0; i < count; i++) {
            const idx = (this.readPos + offset + i) % this.capacity;
            const val = this.ringRight[idx];
            if (val < min) min = val;
            if (val > max) max = val;
        }
        return { min, max };
    }

    fillDensityHistogram(offset, count, centerY, amplitude, height, countsL, countsR) {
        for (let i = 0; i < count; i++) {
            const idx = (this.readPos + offset + i) % this.capacity;

            let valL = Math.max(-1, Math.min(1, this.ringLeft[idx]));
            let yL = (centerY - valL * amplitude) | 0;
            if (yL >= 0 && yL < height) countsL[yL]++;

            if (!this.isMono) {
                let valR = Math.max(-1, Math.min(1, this.ringRight[idx]));
                let yR = (centerY - valR * amplitude) | 0;
                if (yR >= 0 && yR < height) countsR[yR]++;
            }
        }
    }

    advanceRead(count) {
        this.readPos = (this.readPos + count) % this.capacity;
    }

    skipToLatest(keepSamples) {
        const keep = Math.min(keepSamples, this.getUnreadSamplesCount());
        this.readPos = (this.writePos - keep + this.capacity) % this.capacity;
    }

    clear() {
        this.ringLeft.fill(0);
        this.ringRight.fill(0);
        this.writePos = 0;
        this.readPos = 0;
    }

    resize(bufferSize) {
        this.bufferSize = bufferSize;
    }

    destroy() {
        this.player?.eventbus?.removeEventListener("buffer-data", this._onBufferData);
        super.destroy();
    }
}