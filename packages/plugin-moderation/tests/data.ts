/** Test data both the browser tests and the Node harness use. Nothing here may import Node-only code. */
import type { Identity } from "@svartz/auth";

/** Where the router answers unless a test says otherwise; writes must name it as their `Origin`. */
export const ORIGIN = "https://notes.test";

/** The pages the build published, by slug: the garden note, and Grace's user page. */
export const PAGES = {
  garden: { title: "Garden", href: "/notes/garden/" },
  "users/grace": { title: "grace", href: "/notes/users/grace/" },
} as const;

/** A reader who reports. */
export const ADA: Identity = { id: "github:1815", provider: "github", name: "Ada Lovelace", handle: "ada" };
/** The moderator wherever a test names one. */
export const ALAN: Identity = { id: "github:1912", provider: "github", name: "Alan Turing", handle: "alan" };
/** Whoever is reported. */
export const GRACE: Identity = { id: "github:1906", provider: "github", name: "Grace Hopper", handle: "grace" };
