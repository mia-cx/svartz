import type { AnalyticsConfig } from "@svartz/core";

type Tracker = {
  lastPath?: string;
  mounts: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
  track: (pathname: string) => void;
};
const trackers = new Map<string, Tracker>();

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  plausible?: ((event: string, options?: unknown) => void) & { init?: (options: unknown) => void; q?: unknown[] };
  umami?: { track: () => void };
  goatcounter?: { no_onload?: boolean; endpoint?: string; count?: (options: { path: string }) => void };
  tinylytics?: { triggerUpdate: () => void };
  _paq?: unknown[][];
  va?: (...args: unknown[]) => void;
  vaq?: unknown[][];
};

const browserWindow = () => window as AnalyticsWindow;

function appendScript(src: string, attributes: Record<string, string> = {}, onload?: () => void): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
  if (onload) script.addEventListener("load", onload, { once: true });
  document.head.appendChild(script);
  return script;
}

function manualTracker(start: (ready: (send: (path: string) => void) => void) => void): Tracker {
  const queue: string[] = [];
  let send: ((path: string) => void) | undefined;
  start((callback) => {
    send = callback;
    for (const pathname of queue.splice(0)) callback(pathname);
  });
  return { mounts: 0, track(pathname) { send ? send(pathname) : queue.push(pathname); } };
}

function createTracker(config: AnalyticsConfig): Tracker {
  switch (config.provider) {
    case "google":
      return manualTracker((ready) => {
        const w = browserWindow();
        w.dataLayer ??= [];
        w.gtag = (...args) => { w.dataLayer!.push(args); };
        w.gtag("js", new Date());
        w.gtag("config", config.tagId, { send_page_view: false });
        appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.tagId)}`);
        ready((pathname) => w.gtag?.("event", "page_view", {
          page_location: `${location.origin}${pathname}`,
          page_title: document.title,
        }));
      });
    case "plausible":
      return manualTracker((ready) => {
        const w = browserWindow();
        w.plausible ??= Object.assign((...args: unknown[]) => { w.plausible!.q ??= []; w.plausible!.q.push(args); }, { q: [] });
        const scriptSrc = config.scriptSrc ?? `${config.host ?? "https://plausible.io"}/js/script.manual.js`;
        appendScript(scriptSrc, { "data-domain": location.hostname }, () => {
          if (config.scriptSrc) w.plausible?.init?.({ autoCapturePageviews: false });
          ready((pathname) => w.plausible?.("pageview", config.scriptSrc
            ? { url: `${location.origin}${pathname}` }
            : { u: `${location.origin}${pathname}` }));
        });
      });
    case "umami":
      return manualTracker((ready) => {
        appendScript(`${config.host ?? "https://cloud.umami.is"}/script.js`, {
          "data-website-id": config.websiteId,
          "data-auto-pageview": "false",
        }, () => ready(() => browserWindow().umami?.track()));
      });
    case "goatcounter":
      return manualTracker((ready) => {
        const w = browserWindow();
        const host = config.host ?? "goatcounter.com";
        const endpoint = `https://${config.websiteId}.${host}/count`;
        w.goatcounter = { no_onload: true, endpoint };
        appendScript(config.scriptSrc ?? "https://gc.zgo.at/count.js", { "data-goatcounter": endpoint }, () => {
          ready((pathname) => w.goatcounter?.count?.({ path: pathname }));
        });
      });
    case "posthog":
      return manualTracker((ready) => {
        void import("posthog-js").then(({ default: posthog }) => {
          posthog.init(config.apiKey, {
            api_host: config.host ?? "https://us.i.posthog.com",
            capture_pageview: false,
            autocapture: false,
            disable_session_recording: true,
          });
          ready((pathname) => posthog.capture("$pageview", {
            $current_url: `${location.origin}${pathname}`,
            $pathname: pathname,
          }));
        }).catch((error: unknown) => console.error("[svartz:plugin] PostHog failed to load", error));
      });
    case "matomo":
      return manualTracker((ready) => {
        const w = browserWindow();
        w._paq ??= [];
        const host = config.host.replace(/\/+$/, "");
        w._paq.push(["setTrackerUrl", `${host}/matomo.php`], ["setSiteId", config.siteId]);
        appendScript(`${host}/matomo.js`);
        ready((pathname) => w._paq?.push(
          ["setCustomUrl", pathname],
          ["setDocumentTitle", document.title],
          ["trackPageView"],
        ));
      });
    case "tinylytics": {
      let first = true;
      appendScript(`https://tinylytics.app/embed/${encodeURIComponent(config.siteId)}.js?spa`);
      return { mounts: 0, track() {
        if (first) { first = false; return; }
        browserWindow().tinylytics?.triggerUpdate();
      } };
    }
    case "cabin": {
      let script: HTMLScriptElement | undefined;
      return { mounts: 0, track() {
        script?.remove();
        script = appendScript(`${config.host ?? "https://scripts.withcabin.com"}/hello.js`);
      } };
    }
    case "clarity":
      appendScript(`https://www.clarity.ms/tag/${encodeURIComponent(config.projectId)}`);
      return { mounts: 0, track() {} };
    case "vercel": {
      const w = browserWindow();
      w.va ??= (...args) => { (w.vaq ??= []).push(args); };
      appendScript("/_vercel/insights/script.js");
      return { mounts: 0, track() {} };
    }
    case "rybbit":
      return { mounts: 0, track(pathname) {
        // The HTTP API sends page metadata only. The browser script can enable
        // session replay and copy capture from dashboard settings.
        void fetch(`${config.host ?? "https://app.rybbit.io"}/api/track`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            site_id: config.siteId,
            type: "pageview",
            pathname,
            hostname: location.hostname,
            page_title: document.title,
          }),
          keepalive: true,
        }).catch((error: unknown) => console.error("[svartz:plugin] Rybbit pageview failed", error));
      } };
  }
}

/** Browser resource entry point. No tracker loads without resolved consumer config. */
export function mount(pathname: string, options?: unknown): () => void {
  const config = options as AnalyticsConfig;
  const key = JSON.stringify(config);
  let tracker = trackers.get(key);
  if (!tracker) {
    tracker = createTracker(config);
    trackers.set(key, tracker);
  }
  if (tracker.releaseTimer) clearTimeout(tracker.releaseTimer);
  tracker.releaseTimer = undefined;
  tracker.mounts++;
  if (tracker.lastPath !== pathname) {
    tracker.track(pathname);
    tracker.lastPath = pathname;
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    tracker.mounts--;
    if (tracker.mounts === 0) {
      tracker.releaseTimer = setTimeout(() => { tracker.lastPath = undefined; }, 0);
    }
  };
}
