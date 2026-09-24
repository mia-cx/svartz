import Note from './Note.svx';
import { mount, unmount } from 'svelte';
export const render = (target, options) => mount(Note, { target, ...options });
export const dispose = (instance) => unmount(instance);
