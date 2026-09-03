import { player, loadCode } from "/js/player-manager.js";
import { getVisualizer } from "/js/visualizer-manager.js";
import { downloadFile, getDateFilename } from "/js/download-file.js";
import { renderBytebeat } from "/bbt.js";
import { encodeWav } from "/js/export/wav-encoder.js"

export function setupUI(codeEditor) {
    const exportWorker = new Worker(
        "/js/export/export-worker.js",
        { type: "module" }
    );

    const sampleIndexInput = document.querySelector('#t-value');

    const buttonStop = document.querySelector('#stop-button');
    const buttonRewind = document.querySelector('#rewind-button');
    const buttonReverse = document.querySelector('#reverse-button');
    const buttonPause = document.querySelector('#pause-button');
    const buttonPlay = document.querySelector('#play-button');

    const volumeRange = document.querySelector('#volume-range');
    const volumeValue = document.querySelector('#volume-value');

    const errorText = document.querySelector("#error-text");

    const buttonDownloadCode = document.querySelector("#download-code-button");
    const buttonExportSound = document.querySelector("#export-sound-button");

    // Export sound modal
    const exportOverlay = document.querySelector('#export-sound-overlay');
    const exportSpeedInput = document.querySelector('#export-speed');
    const exportRangeStartInput = document.querySelector('#export-range-start');
    const exportRangeEndInput = document.querySelector('#export-range-end');
    const exportCancelButton = document.querySelector('#export-cancel');
    const exportConfirmButton = document.querySelector('#export-sound');

    const exportProgressBar = document.querySelector('#export-progress-bar');
    const exportProgressValue = document.querySelector('#export-progress-value');

    let isEditingSampleIndex = false;
    let speedBeforeEdit = 0;
    let isInitialized = false;

    if (sampleIndexInput) {
        sampleIndexInput.removeAttribute('readonly');
    }

    async function ensurePlayer() {
        if (!isInitialized) {
            await player.init();

            player.onTimeUpdate = (newT) => {
                if (!isEditingSampleIndex && sampleIndexInput) {
                    sampleIndexInput.value = newT;
                }
            };
            isInitialized = true;
        }
        return player;
    }

    async function setPlaybackSpeed(speed) {
        await ensurePlayer();

        speed = Math.min(Math.max(speed, -64), 64);

        if (speed < 0) {
            buttonReverse.innerHTML = `${Math.min(-speed * 2, 64)}`;
            buttonPlay.innerHTML = '';
            buttonReverse.disabled = -speed === 64;
            buttonPlay.disabled = false;
        } else if (speed > 0) {
            buttonReverse.innerHTML = '';
            buttonPlay.innerHTML = `${Math.min(speed * 2, 64)}`;
            buttonReverse.disabled = false;
            buttonPlay.disabled = speed === 64;
        } else {
            buttonReverse.disabled = false;
            buttonPlay.disabled = false;
            buttonReverse.innerHTML = '';
            buttonPlay.innerHTML = '';
        }
        player.speed = speed;

        const source = codeEditor.textarea.value;
        await loadCode(source, errorText);
    }

    // Player controls
    buttonPlay?.addEventListener('click', () => {
        setPlaybackSpeed(player.speed <= 0 ? 1 : player.speed * 2);
    });

    buttonPause?.addEventListener('click', () => setPlaybackSpeed(0));

    buttonReverse?.addEventListener('click', () => {
        setPlaybackSpeed(player.speed >= 0 ? -1 : player.speed * 2);
    });

    buttonStop?.addEventListener('click', async () => {
        await ensurePlayer();
        player.stop();
        setPlaybackSpeed(0);
        getVisualizer()?.clear?.();
        if (sampleIndexInput) sampleIndexInput.value = 0;
    });

    buttonRewind?.addEventListener('click', async () => {
        await ensurePlayer();
        player.t = 0;
        getVisualizer()?.clear?.();
        if (sampleIndexInput) sampleIndexInput.value = 0;
    });

    // t-input controls
    sampleIndexInput?.addEventListener('focus', async () => {
        await ensurePlayer();
        isEditingSampleIndex = true;
        speedBeforeEdit = player.speed;
        player.speed = 0;
    });

    function applySampleIndexValue() {
        if (!isEditingSampleIndex) return;

        const newValue = parseInt(sampleIndexInput.value, 10);
        if (!isNaN(newValue)) {
            player.t = Math.max(0, newValue);
        } else {
            sampleIndexInput.value = player.t;
        }

        isEditingSampleIndex = false;
        player.speed = speedBeforeEdit;
    }

    sampleIndexInput?.addEventListener('blur', applySampleIndexValue);

    sampleIndexInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applySampleIndexValue();
            sampleIndexInput.blur();
        }
    });

    // Volume control
    volumeRange?.addEventListener('input', () => {
        const val = Number(volumeRange.value);
        player.volume = val / 100;

        if (volumeValue) {
            volumeValue.textContent = `${val}%`;
        }
    });

    volumeRange?.addEventListener('wheel', (e) => {
        e.preventDefault();

        const step = 5;
        let currentVal = Number(volumeRange.value);

        if (e.deltaY < 0) {
            currentVal = Math.min(150, currentVal + step);
        } else {
            currentVal = Math.max(0, currentVal - step);
        }

        volumeRange.value = currentVal;
        volumeRange.dispatchEvent(new Event('input'));
    });

    volumeValue?.addEventListener('click', () => {
        volumeRange.value = 100;
        volumeRange.dispatchEvent(new Event('input'));
    });

    volumeRange.value = 75;
    volumeRange.dispatchEvent(new Event('input'));

    // Code download
    buttonDownloadCode?.addEventListener("click", () => {
        const code = codeEditor.value;
        downloadFile("text/javascript", `${getDateFilename()}.bbt.js`, code);
    });

    // Export Modal Dialog Logic
    exportWorker.onmessage = (event) => {
        const message = event.data;

        if (message.type === "progress") {
            const percent = Math.max(
                0,
                Math.min(100, message.percent)
            );

            if (exportProgressBar) {
                exportProgressBar.value = percent;
            }

            if (exportProgressValue) {
                exportProgressValue.textContent =
                    `${Math.round(percent)}%`;
            }

            return;
        }

        if (message.type === "done") {
            const wavBlob = new Blob(
                [message.wav],
                { type: "audio/wav" }
            );

            downloadFile(
                "audio/wav",
                `${getDateFilename()}.wav`,
                wavBlob
            );

            exportConfirmButton.disabled = false;
            closeExportModal();
            return;
        }

        if (message.type === "error") {
            exportConfirmButton.disabled = false;
            alert(`Export error: ${message.message}`);
        }
    };

    const closeExportModal = () => {
        if (exportOverlay) exportOverlay.style.display = 'none';
    };

    buttonExportSound?.addEventListener('click', () => {
        if (exportOverlay) exportOverlay.style.display = 'flex';
    });

    exportCancelButton?.addEventListener('click', closeExportModal);

    exportOverlay?.addEventListener('click', (e) => {
        if (e.target === exportOverlay) closeExportModal();
    });

    exportConfirmButton?.addEventListener('click', (e) => {
        e.preventDefault();

        const speed = parseFloat(exportSpeedInput?.value ?? 1) || 1;
        const start = parseInt(exportRangeStartInput?.value ?? 0, 10) || 0;
        const end = parseInt(exportRangeEndInput?.value ?? 80000, 10) || 80000;

        if (speed === 0) {
            alert("Export error: speed cannot be zero.");
            return;
        }

        if (end <= start) {
            alert("Export error: end must be greater than start.");
            return;
        }

        if (exportProgressBar) {
            exportProgressBar.value = 0;
        }

        if (exportProgressValue) {
            exportProgressValue.textContent = "0%";
        }

        exportConfirmButton.disabled = true;

        exportWorker.postMessage({
            source: codeEditor.value,
            speed,
            start,
            end
        });
    });
}