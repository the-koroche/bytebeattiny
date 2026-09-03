import { BytebeatPlayer } from "/bbt.js";

export const player = new BytebeatPlayer();
let isInitialized = false;

export async function ensurePlayer(onTimeUpdateCallback) {
    if (!isInitialized) {
        await player.init();
        if (onTimeUpdateCallback) {
            player.onTimeUpdate = onTimeUpdateCallback;
        }
        isInitialized = true;
    }
    return player;
}

export async function loadCode(source, errorElement) {
    await ensurePlayer();
    const result = player.load(source);
    if (!result.success) {
        errorElement.style.display = "block";
        errorElement.innerHTML = result.error;
    } else {
        errorElement.style.display = "none";
    }
}