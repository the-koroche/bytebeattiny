import { player } from "/js/player-manager.js";
import { WaveformVisualizer } from "/js/visualizer/waveform.js";
import { FFTVisualizer } from "/js/visualizer/fft.js";

export const visualizerCanvas = document.querySelector('#visualizer');
const visualizerType = document.querySelector('#visualizer-type');
const visualizerBufLess = document.querySelector('#visualizer-less');
const visualizerBufMore = document.querySelector('#visualizer-more');
const visualizerBufSizeText = document.querySelector('#visualizer-buffer-size');

let visualizer = null;
let bufferSize = 8192;

export function getVisualizer() {
    return visualizer;
}

const visualizers = {
    none: () => null,
    fft: () => new FFTVisualizer(visualizerCanvas, player),
    waveform: () => new WaveformVisualizer(visualizerCanvas, player)
};

function updateBufferSizeText() {
    if (bufferSize >= 1024) {
        visualizerBufSizeText.innerHTML = `2<sup>${Math.floor(Math.log2(bufferSize))}</sup>`;
    } else {
        visualizerBufSizeText.textContent = bufferSize;
    }
}

function recreateVisualizer() {
    visualizer?.destroy();

    visualizer = visualizers[visualizerType.value]();
    visualizer?.resize(bufferSize);
    visualizer?.start();

    updateBufferSizeText();
}

visualizerType.addEventListener("change", recreateVisualizer);

visualizerBufMore.addEventListener("click", () => {
    visualizerBufLess.disabled = false;

    if (bufferSize >= 2**18) {
        return;
    } else if (bufferSize >= 2**17) {
        visualizerBufMore.disabled = true;
    }

    bufferSize *= 2;
    visualizer?.resize(bufferSize);

    updateBufferSizeText();
});

visualizerBufLess.addEventListener("click", () => {
    visualizerBufMore.disabled = false;

    if (bufferSize <= 256) {
        return;
    } else if (bufferSize <= 512) {
        visualizerBufLess.disabled = true;
    }

    bufferSize /= 2;
    visualizer?.resize(bufferSize);

    updateBufferSizeText();
});

recreateVisualizer();