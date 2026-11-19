/** `text` safe in HTML text and in a double- or single-quoted attribute. */
export const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
