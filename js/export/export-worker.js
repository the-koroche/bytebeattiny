import { renderBytebeat } from "/bbt.js";
import { encodeWav } from "/js/export/wav-encoder.js";

self.onmessage = (event) => {
    const {
        source,
        speed,
        start,
        end
    } = event.data;

    try {
        const result = renderBytebeat(
            source,
            speed,
            { start, end },
            (progress) => {
                self.postMessage({
                    type: "progress",
                    ...progress
                });
            }
        );

        const wav = encodeWav(
            result.buffer,
            result.sampleRate,
            result.channels
        );

        self.postMessage(
            {
                type: "done",
                wav
            },
            [wav]
        );
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error
                ? error.message
                : String(error)
        });
    }
};