export type ColorMode = 'light' | 'dark';

/** localStorage key for the reader's explicit choice. Absent means "follow the OS". */
export const COLOR_MODE_KEY = 'svartz:color-mode';

/**
 * Inline `<head>` script. Pins the stored mode on <html> before first paint so
 * dark readers never see a light flash. Without a stored mode the OS decides
 * through `color-scheme: light dark`.
 */
export const COLOR_MODE_SCRIPT = `(()=>{try{const m=localStorage.getItem(${JSON.stringify(COLOR_MODE_KEY)});if(m==='light'||m==='dark')document.documentElement.classList.add(m)}catch{}})()`;

/** The mode the page currently renders in. */
export function currentColorMode(): ColorMode {
	const root = document.documentElement;
	if (root.classList.contains('dark')) return 'dark';
	if (root.classList.contains('light')) return 'light';
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Pin a mode on <html>, remember it, and tell listeners (comments, graphs). */
export function setColorMode(mode: ColorMode): void {
	const root = document.documentElement;
	root.classList.remove('light', 'dark');
	root.classList.add(mode);
	try {
		localStorage.setItem(COLOR_MODE_KEY, mode);
	} catch {
		// Private browsing: the choice lasts for this page only.
	}
	window.dispatchEvent(new CustomEvent('svartz:color-mode', { detail: mode }));
}
