import { writable } from 'svelte/store';

/**
 * Right-click context menu state.
 *  - kind: 'friend' (the only one for now)
 *  - data: { x, y, accountId, userId, displayName, state, location, isFriend, ... }
 *  - items: list of action descriptors shown
 */
export const contextMenu = writable(/** @type {{open: boolean, x: number, y: number, data: any, items: any[]} | null} */ (null));

/** @param {{x:number,y:number,data:any,items:any[]}} opts */
export function showContextMenu(opts) {
	contextMenu.set({ open: true, ...opts });
}

export function hideContextMenu() {
	contextMenu.set(null);
}
