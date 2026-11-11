/** Test data both the browser tests and the Node harness use. Nothing here may import Node-only code. */
import type { Identity } from "@svartz/auth";
import type { Anchor } from "../src/anchor";

export const ENDPOINT = "/notes/_svartz/annotations";

/** A comment as tests seed it; `id` and `createdAt` order the list. */
export interface SeedComment {
  readonly id: string;
  readonly vault?: string;
  readonly page: string;
  readonly author: Identity;
  readonly body: string;
  readonly anchor: Anchor;
  readonly createdAt: string;
  readonly agreedBy?: readonly Identity[];
}

/** People with every profile field, and with only what Google gives. */
export const ADA: Identity = {
  id: "github:1815",
  provider: "github",
  name: "Ada Lovelace",
  handle: "ada",
  avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23c084fc'/%3E%3C/svg%3E",
  profileUrl: "https://github.com/ada",
};
export const GRACE: Identity = { id: "google:1906", provider: "google", name: "Grace Hopper" };
