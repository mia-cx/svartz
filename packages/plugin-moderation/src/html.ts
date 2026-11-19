/** Escape text for HTML content and double-quoted attributes. */
export const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
