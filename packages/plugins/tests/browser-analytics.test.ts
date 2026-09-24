import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeScript = {
  src: string;
  async: boolean;
  attributes: Record<string, string>;
  listeners: Record<string, () => void>;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (name: string, listener: () => void) => void;
  remove: () => void;
};

const scripts: FakeScript[] = [];

beforeEach(() => {
  vi.resetModules();
  scripts.length = 0;
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { origin: "https://example.test", hostname: "example.test" });
  vi.stubGlobal("document", {
    title: "Public title",
    createElement() {
      return {
        src: "", async: false, attributes: {}, listeners: {},
        setAttribute(this: FakeScript, name: string, value: string) { this.attributes[name] = value; },
        addEventListener(this: FakeScript, name: string, listener: () => void) { this.listeners[name] = listener; },
        remove(this: FakeScript) { scripts.splice(scripts.indexOf(this), 1); },
      } satisfies FakeScript;
    },
    head: { appendChild(script: FakeScript) { scripts.push(script); } },
  });
});

describe("analytics browser resource", () => {
  it("installs Google once and records each Svartz route once", async () => {
    const { mount } = await import("../src/browser-analytics");
    const config = { provider: "google", tagId: "G-123" };
    mount("/blog/one/", config);
    mount("/blog/one/", config);
    mount("/blog/two/", config);
    expect(scripts).toHaveLength(1);
    const events = (window as { dataLayer: unknown[][] }).dataLayer.filter((entry) => entry[0] === "event");
    expect(events).toEqual([
      ["event", "page_view", { page_location: "https://example.test/blog/one/", page_title: "Public title", send_to: "G-123" }],
      ["event", "page_view", { page_location: "https://example.test/blog/two/", page_title: "Public title", send_to: "G-123" }],
    ]);
  });

  it("routes each host vault's Google pageviews to its own tag", async () => {
    const { mount } = await import("../src/browser-analytics");
    mount("/blog/", { provider: "google", tagId: "G-BLOG" });
    mount("/work/", { provider: "google", tagId: "G-WORK" });
    const events = (window as { dataLayer: unknown[][] }).dataLayer.filter((entry) => entry[0] === "event");
    expect(events.map((entry) => (entry[2] as { send_to: string }).send_to)).toEqual(["G-BLOG", "G-WORK"]);
  });

  it("counts a return to the same route after its mount has ended", async () => {
    vi.useFakeTimers();
    try {
      const { mount } = await import("../src/browser-analytics");
      const config = { provider: "google", tagId: "G-456" };
      const dispose = mount("/blog/one/", config);
      dispose();
      vi.runAllTimers();
      mount("/blog/one/", config);
      const events = (window as { dataLayer: unknown[][] }).dataLayer.filter((entry) => entry[0] === "event");
      expect(events).toHaveLength(2);
      expect(scripts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues Umami views until its script loads and disables automatic pageviews", async () => {
    const { mount } = await import("../src/browser-analytics");
    const track = vi.fn();
    const config = { provider: "umami", websiteId: "public-id" };
    mount("/blog/one/", config);
    mount("/blog/two/", config);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.attributes).toMatchObject({
      "data-website-id": "public-id",
      "data-auto-pageview": "false",
      "data-auto-track": "false",
    });
    (window as { umami?: { track: typeof track } }).umami = { track };
    scripts[0]?.listeners.load?.();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track.mock.calls.map(([transform]) => transform({ website: "public-id", title: "Public title" }).url))
      .toEqual(["/blog/one/", "/blog/two/"]);
  });

  it("sends only public Rybbit page metadata once per route", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const { mount } = await import("../src/browser-analytics");
    const config = { provider: "rybbit", siteId: "public-id" };
    mount("/blog/", config);
    mount("/blog/", config);
    expect(scripts).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      site_id: "public-id",
      type: "pageview",
      pathname: "/blog/",
      hostname: "example.test",
      page_title: "Public title",
    });
  });

  it("replaces Cabin's pageview script on navigation", async () => {
    const { mount } = await import("../src/browser-analytics");
    const config = { provider: "cabin" };
    mount("/blog/one/", config);
    const firstScript = scripts[0];
    mount("/blog/two/", config);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(firstScript);
  });
});
