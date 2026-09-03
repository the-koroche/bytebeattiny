/**
 * Encode interleaved PCM WAV data.
 *
 * @param {{left: Float32Array, right?: Float32Array}} buffer
 * @param {number} sampleRate
 * @param {1|2} [channels=2]
 * @param {8|16|24|32} [bitsPerSample=16]
 * @returns {ArrayBuffer}
 */
export function encodeWav(buffer, sampleRate, channels = 2, bitsPerSample = 16) {
	if (!buffer || !(buffer.left instanceof Float32Array)) {
		throw new TypeError('buffer.left must be a Float32Array');
	}
	if (channels !== 1 && channels !== 2) {
		throw new RangeError('channels must be 1 or 2');
	}
	if (![8, 16, 24, 32].includes(bitsPerSample)) {
		throw new RangeError('bitsPerSample must be 8, 16, 24, or 32');
	}
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
		throw new RangeError('sampleRate must be positive');
	}
	if (channels === 2 && !(buffer.right instanceof Float32Array)) {
		throw new TypeError('buffer.right must be a Float32Array for stereo audio');
	}

	const frames = buffer.left.length;
	if (channels === 2 && buffer.right.length !== frames) {
		throw new RangeError('left and right channels must have the same length');
	}

	const bytesPerSample = bitsPerSample / 8;
	const blockAlign = channels * bytesPerSample;
	const dataSize = frames * blockAlign;
	const wav = new ArrayBuffer(44 + dataSize);
	const view = new DataView(wav);

	const writeString = (offset, value) => {
		for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
	};
	writeString(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, Math.round(sampleRate), true);
	view.setUint32(28, Math.round(sampleRate) * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeString(36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	const writeSample = (sample) => {
		sample = Math.max(-1, Math.min(1, sample));
		if (bitsPerSample === 8) {
			view.setUint8(offset, Math.round((sample + 1) * 127.5));
		} else if (bitsPerSample === 16) {
			view.setInt16(offset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
		} else if (bitsPerSample === 24) {
			const value = sample < 0 ? Math.round(sample * 8388608) : Math.round(sample * 8388607);
			view.setUint8(offset, value & 0xff);
			view.setUint8(offset + 1, (value >> 8) & 0xff);
			view.setUint8(offset + 2, (value >> 16) & 0xff);
		} else {
			view.setInt32(offset, sample < 0 ? Math.round(sample * 2147483648) : Math.round(sample * 2147483647), true);
		}
		offset += bytesPerSample;
	};

	for (let i = 0; i < frames; i++) {
		writeSample(buffer.left[i]);
		if (channels === 2) writeSample(buffer.right[i]);
	}
	return wav;
}
