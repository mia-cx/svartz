import Note from './Note.svx';
import { mount, unmount } from 'svelte';
export const render = (target) => mount(Note, { target });
export const dispose = (instance) => unmount(instance);
