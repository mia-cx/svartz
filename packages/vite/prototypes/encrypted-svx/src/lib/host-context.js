import { createContext } from 'svelte';
// This public module must keep one createContext key identity.
export const [getHostContext, setHostContext] = createContext();
