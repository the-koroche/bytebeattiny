export class Visualizer {
    constructor(canvas, player) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext("2d") : null;
        this.player = player;
        this.animationId = null;
        this.running = false;
    }

    start() {
        if (this.animationId) return;

        this.running = true;
        const loop = () => {
            this.render();
            this.animationId = requestAnimationFrame(loop);
        };
        loop();
    }

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    render(clearBackground = true) {
        throw new Error("render() must be implemented");
    }

    destroy() {
        this.stop();
        this.canvas = null;
        this.ctx = null;
        this.player = null;
    }
}