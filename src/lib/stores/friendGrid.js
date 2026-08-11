import { writable } from 'svelte/store';

/** Whether the full-screen friend grid overlay is open. */
export const friendGridOpen = writable(false);

export function openFriendGrid() {
	friendGridOpen.set(true);
}

export function closeFriendGrid() {
	friendGridOpen.set(false);
}
