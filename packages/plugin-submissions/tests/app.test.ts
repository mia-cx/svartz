import { verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appTokens, type AppCredentials } from "../src/app";
import { GITHUB_TIMEOUT_MS } from "../src/github";
import {
  APP_ID,
  APP_KEY,
  type Exchange,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  installationLookup,
  REPO,
  replayGitHub,
  TOKEN,
  tokenExchange,
  useFakeTimeouts,
} from "./github-exchanges";

const KEY_ENV = "SVARTZ_GITHUB_APP_KEY";
const app: AppCredentials = { id: APP_ID, privateKey: { env: KEY_ENV } };
const env = { [KEY_ENV]: APP_KEY.pkcs1 };
const NOW = Date.parse("2026-11-12T12:00:00Z");
const MINUTE = 60_000;
/** GitHub's `expires_at` for a token minted now that lives `minutes`. */
const expiresIn = (minutes: number) => new Date(NOW + minutes * MINUTE).toISOString();

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GitHub App credentials", () => {
  it.each([
    ["GitHub's PKCS#1 download", APP_KEY.pkcs1],
    ["a PKCS#8 key", APP_KEY.pkcs8],
    ["a key pasted into one line with \\n escapes", APP_KEY.pkcs1.replaceAll("\n", "\\n")],
  ])("signs a JWT for the App with %s and exchanges it for an installation token", async (_case, pem) => {
    const github = replayGitHub([installationLookup, tokenExchange(expiresIn(60))]);

    expect(await appTokens(REPO, app)({ [KEY_ENV]: pem })).toBe(INSTALLATION_TOKEN);

    const [header, payload, signature] = github.requests[0]!.authorization!.slice("Bearer ".length).split(".");
    expect(decode(header!)).toEqual({ alg: "RS256", typ: "JWT" });
    // Backdated a minute for clock drift, and within GitHub's ten-minute ceiling.
    expect(decode(payload!)).toEqual({ iat: NOW / 1000 - 60, exp: NOW / 1000 + 9 * 60, iss: APP_ID });
    expect(verify("sha256", Buffer.from(`${header}.${payload}`), APP_KEY.publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
    expect(github.pending).toEqual([]);
  });

  it("reuses the installation token until five minutes before it expires, then mints another", async () => {
    const tokens = appTokens(REPO, app);
    const github = replayGitHub([
      installationLookup,
      tokenExchange(expiresIn(60), "ghs_first"),
      installationLookup,
      tokenExchange(expiresIn(115), "ghs_second"),
    ]);

    expect(await tokens(env)).toBe("ghs_first");
    vi.setSystemTime(NOW + 54 * MINUTE);
    expect(await tokens(env)).toBe("ghs_first");
    expect(github.requests).toHaveLength(2);
    vi.setSystemTime(NOW + 55 * MINUTE);
    expect(await tokens(env)).toBe("ghs_second");
    expect(github.pending).toEqual([]);
  });

  it("uses the configured installation without looking it up", async () => {
    const github = replayGitHub([tokenExchange(expiresIn(60))]);

    expect(await appTokens(REPO, { ...app, installation: INSTALLATION_ID })(env)).toBe(INSTALLATION_TOKEN);
    expect(github.pending).toEqual([]);
  });

  const failing = (exchange: Exchange, status: number): Exchange => ({
    ...exchange,
    response: { status, json: { message: "GitHub's reason", documentation_url: "https://docs.github.com/rest" } },
  });
  const UNAVAILABLE = ["github_unavailable", 503, "Couldn't reach GitHub right now. Try again in a moment."] as const;
  const misconfigured = (reason: string) => ["misconfigured", 503, `This site can't open pull requests yet: ${reason}.`] as const;
  it.each([
    ["no private key is set", {}, [], misconfigured(`its server has no ${KEY_ENV} set`)],
    ["the private key is a personal access token", { [KEY_ENV]: TOKEN }, [], misconfigured(`its server's ${KEY_ENV} isn't a GitHub App private key`)],
    [
      "the private key is damaged",
      { [KEY_ENV]: APP_KEY.pkcs1.replace(/\n.{8}/, "\n") },
      [],
      misconfigured(`its server's ${KEY_ENV} isn't a GitHub App private key`),
    ],
    ["GitHub rejects the App ID or key", env, [failing(installationLookup, 401)], misconfigured("GitHub rejected its App ID or private key")],
    ["the App isn't installed on the repository", env, [failing(installationLookup, 404)], misconfigured(`its GitHub App isn't installed on ${REPO}`)],
    [
      "the installation can't reach the repository",
      env,
      [installationLookup, failing(tokenExchange(expiresIn(60)), 422)],
      misconfigured(`its GitHub App isn't installed on ${REPO}`),
    ],
    ["GitHub fails", env, [installationLookup, failing(tokenExchange(expiresIn(60)), 502)], UNAVAILABLE],
  ] as const)("answers %s with a reason that holds no key material", async (_case, keyEnv, exchanges, [code, status, message]) => {
    const github = replayGitHub(exchanges);

    const error = await appTokens(REPO, app)(keyEnv).catch((error: unknown) => error);

    expect(error).toMatchObject({ code, status, message });
    expect(Object.keys(error as object)).not.toContain("cause");
    expect(github.pending).toEqual([]);
  });

  it("tells the reader to try again when GitHub doesn't answer the exchange in time", async () => {
    useFakeTimeouts();
    const github = replayGitHub([installationLookup, { ...tokenExchange(expiresIn(60)), response: { status: 0, hang: true } }]);

    const minted = appTokens(REPO, app)(env);
    const settled = expect(minted).rejects.toMatchObject({ code: UNAVAILABLE[0], status: UNAVAILABLE[1] });
    // Signing runs off the timer queue: the clock moves only once the exchange is waiting on GitHub.
    await vi.waitFor(() => expect(github.pending).toEqual([]));
    await vi.advanceTimersByTimeAsync(GITHUB_TIMEOUT_MS);
    await settled;
  });
});
