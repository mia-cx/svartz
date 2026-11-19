import "../src/browser.css";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accountPage, type AccountView } from "../src/account";

const GITHUB = { id: "github:583231", provider: "github", name: "The Octocat", handle: "octocat", linkedAt: "2026-11-01T10:00:00.000Z" } as const;
const DISCORD = { id: "discord:80351110224678912", provider: "discord", name: "Nelly", handle: "nelly_with_a_very_long_discord_username", linkedAt: "2026-11-02T10:00:00.000Z" } as const;

function render(query = "") {
  const view: AccountView = {
    account: { id: "a1", handle: "octocat", name: "The Octocat", createdAt: "2026-11-01T10:00:00.000Z", roles: [], identity: GITHUB },
    standing: { score: 12.5, next: { role: "editors", score: 20 } },
    identities: [GITHUB, DISCORD],
    sessions: [
      { id: "s1", identity: GITHUB.id, provider: "github", createdAt: "2026-11-19T10:00:00.000Z" },
      { id: "s2", identity: DISCORD.id, provider: "discord", createdAt: "2026-11-18T10:00:00.000Z" },
    ],
    session: "s1",
    providers: ["github", "google", "discord", "x"],
    query: new URLSearchParams(query),
    actions: {
      profile: "/notes/_svartz/auth/account/profile/",
      unlink: "/notes/_svartz/auth/account/unlink/",
      signOutEverywhere: "/notes/_svartz/auth/account/sign-out-everywhere/",
      link: (provider) => `/notes/_svartz/auth/account/link/${provider}/`,
    },
  };
  document.body.innerHTML = `<main>${accountPage(view).html}</main>`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** The accessible name of whatever has focus: its label, aria-label or text. */
function focused(): string {
  const element = document.activeElement as HTMLElement;
  const label = element.id ? document.querySelector(`label[for="${element.id}"]`)?.textContent : undefined;
  return label ?? element.getAttribute("aria-label") ?? element.textContent!.trim();
}

describe("the account page", () => {
  // Proves every control is reachable from the keyboard, in reading order, under the name it shows.
  it("works from the keyboard, in order", async () => {
    render();
    const names: string[] = [];
    for (let step = 0; step < 7; step++) {
      await userEvent.keyboard("{Tab}");
      names.push(focused());
    }
    expect(names).toEqual([
      "Display name",
      "Handle",
      "Save profile",
      "Unlink Discord @nelly_with_a_very_long_discord_username",
      "Link Google",
      "Link X",
      "Sign out everywhere",
    ]);
  });

  // Proves a refused change is announced and points the handle field at the problem.
  it("announces a refused handle on the field it concerns", async () => {
    render("status=handle-taken&name=Mona&handle=hubot");
    const field = page.getByLabelText("Handle");
    await expect.element(field).toHaveValue("hubot");
    await expect.element(field).toHaveAttribute("aria-invalid", "true");
    await expect.element(page.getByRole("alert")).toHaveTextContent("@hubot is taken. Choose another handle.");
    await expect.element(field).toHaveAccessibleDescription(/@hubot is taken/);
  });

  // Proves the page fits a phone without scrolling sideways, long handles included.
  it("fits a phone-width screen", async () => {
    await page.viewport(360, 800);
    render();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
    for (const target of document.querySelectorAll<HTMLElement>("button, input:not([type=hidden])")) {
      expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(24);
    }
  });
});
