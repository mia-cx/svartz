import type { SvartzTheme, ThemeComponentLoader } from "./types";
import { ThemeValidationError } from "./errors";

/** Load every theme component before server rendering or hydration begins. */
export async function materializeTheme(theme: SvartzTheme): Promise<SvartzTheme> {
  const loaded = new Map<ThemeComponentLoader, Promise<{ default: unknown }>>();
  async function load(slot: string, reference: ThemeComponentLoader): Promise<{ default: unknown }> {
    let pending = loaded.get(reference);
    if (!pending) {
      pending = typeof reference === "function" ? reference() : Promise.resolve(reference);
      loaded.set(reference, pending);
    }
    const module = await pending;
    if (module && typeof module === "object" && module.default) return module;
    throw new ThemeValidationError({
      themeId: theme.id,
      message: `Theme component "${slot}" did not load a default Svelte component`,
    });
  }

  const layouts = Object.fromEntries(await Promise.all(
    Object.entries(theme.layouts).map(async ([slot, reference]) => [
      slot,
      reference ? await load(`layouts.${slot}`, reference) : undefined,
    ] as const),
  ));
  const components = Object.fromEntries(await Promise.all(
    Object.entries(theme.components ?? {}).map(async ([slot, reference]) => [
      slot,
      reference ? await load(`components.${slot}`, reference) : undefined,
    ] as const),
  ));
  const routes = await Promise.all(theme.routes.map(async (route) => ({
    ...route,
    component: route.component ? await load(`routes.${route.id}`, route.component) : undefined,
  })));

  return { ...theme, layouts: layouts as SvartzTheme["layouts"], components, routes };
}
