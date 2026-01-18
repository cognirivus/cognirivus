import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const storedValue = browser ? localStorage.getItem('highlights-enabled') !== 'false' : true;

export const highlightsEnabled = writable<boolean>(storedValue);

highlightsEnabled.subscribe((value) => {
	if (browser) {
		localStorage.setItem('highlights-enabled', String(value));
	}
});
