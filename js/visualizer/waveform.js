import { DataVisualizer } from "./data-visualizer.js";

export class WaveformVisualizer extends DataVisualizer {
    constructor(canvas, bbtplayer, bufferSize = 8000) {
        super(canvas, bbtplayer, bufferSize);

        this.colors = {
            mono:  '#ffffff',
            left:  '#00ff88',
            right: '#ff66cc'
        };

        this._lastX = 0;
        this._lastY = null;
        this._lastYLeft = null;
        this._lastYRight = null;
    }

    render(clearBackground = false) {
        const { ctx, canvas } = this;
        const width = canvas.width;
        const height = canvas.height;

        if (width === 0 || height === 0) return;

        if (clearBackground) {
            ctx.clearRect(0, 0, width, height);

            this._lastX = 0;
            this._lastYLeft = null;
            this._lastYRight = null;
        }

        const samplesPerPixel = Math.max(1, this.bufferSize / width);
        const unread = this.getUnreadSamplesCount();
        let colsToDraw = Math.floor(unread / samplesPerPixel);

        if (colsToDraw <= 0) return;

        if (colsToDraw > width) {
            this.skipToLatest(width * samplesPerPixel);
            colsToDraw = width;
        }

        const sampleChunkSize = Math.floor(colsToDraw * samplesPerPixel);
        const centerY = height / 2;
        const amplitude = height * 0.45;

        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(canvas, colsToDraw, 0, width - colsToDraw, height, 0, 0, width - colsToDraw, height);
        ctx.globalCompositeOperation = "source-over";

        ctx.clearRect(width - colsToDraw, 0, colsToDraw, height);

        const startX = width - colsToDraw;

        if (this.isMono) {
            ctx.strokeStyle = this.colors.mono;
            ctx.lineWidth = 1;
            ctx.beginPath();

            let firstPoint = true;
            for (let c = 0; c < colsToDraw; c++) {
                const sampleOffset = Math.floor(c * samplesPerPixel);
                const count = Math.max(1, Math.floor((c + 1) * samplesPerPixel) - sampleOffset);

                const midIdx = sampleOffset + Math.floor(count / 2);
                const val = this.ringLeft[(this.readPos + midIdx) % this.capacity];
                const y = centerY - val * amplitude;
                const x = startX + c;

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else {
            // Left channel
            ctx.strokeStyle = this.colors.left;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let firstLeft = true;
            for (let c = 0; c < colsToDraw; c++) {
                const sampleOffset = Math.floor(c * samplesPerPixel);
                const count = Math.max(1, Math.floor((c + 1) * samplesPerPixel) - sampleOffset);
                const midIdx = sampleOffset + Math.floor(count / 2);
                const val = this.ringLeft[(this.readPos + midIdx) % this.capacity];
                const y = centerY - val * amplitude;
                const x = startX + c;
                if (firstLeft) {
                    ctx.moveTo(x, y);
                    firstLeft = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Right channel
            ctx.strokeStyle = this.colors.right;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let firstRight = true;
            for (let c = 0; c < colsToDraw; c++) {
                const sampleOffset = Math.floor(c * samplesPerPixel);
                const count = Math.max(1, Math.floor((c + 1) * samplesPerPixel) - sampleOffset);
                const midIdx = sampleOffset + Math.floor(count / 2);
                const val = this.ringRight[(this.readPos + midIdx) % this.capacity];
                const y = centerY - val * amplitude;
                const x = startX + c;
                if (firstRight) {
                    ctx.moveTo(x, y);
                    firstRight = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        this.advanceRead(sampleChunkSize);
    }

    destroy() {
        super.destroy();
    }
}