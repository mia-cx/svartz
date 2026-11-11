import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { mount } from "../src/browser";

let unmount: (() => void) | undefined;

function page(config: Parameters<typeof mount>[1]) {
  document.body.innerHTML = `<p>Note</p><button type="button" data-svartz-sign-in>Sign in</button>`;
  unmount = mount(location.pathname, config);
  return document.querySelector<HTMLButtonElement>("[data-svartz-sign-in]")!;
}

afterEach(() => {
  unmount?.();
  document.querySelector("dialog")?.close();
  document.body.innerHTML = "";
});

describe("the sign-in dialog", () => {
  it("offers each enabled provider, returning to this page, and links the privacy notice", async () => {
    history.replaceState(null, "", "/notes/garden/?view=all#reply");
    const trigger = page({
      endpoint: "/notes/_svartz/auth",
      providers: [{ id: "github", label: "GitHub" }],
      privacyNotice: "/notes/privacy/",
    });

    await userEvent.click(trigger);

    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Sign in");
    const github = [...dialog.querySelectorAll("a")].find((link) => link.textContent === "Continue with GitHub")!;
    expect(github.getAttribute("href")).toBe(`/notes/_svartz/auth/start/github/?returnTo=${encodeURIComponent("/notes/garden/?view=all#reply")}`);
    expect([...dialog.querySelectorAll("a")].find((link) => link.textContent === "Privacy notice")?.getAttribute("href")).toBe("/notes/privacy/");
  });

  it("works from the keyboard and hands focus back when it closes", async () => {
    const trigger = page({ endpoint: "/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
    trigger.focus();

    await userEvent.keyboard("{Enter}");
    expect(document.activeElement?.textContent).toBe("Continue with GitHub");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    expect(document.querySelector(".sv-auth-privacy")).toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the page unmounts, so it never follows the reader to the next page", async () => {
    const trigger = page({ endpoint: "/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
    await userEvent.click(trigger);
    expect(document.querySelector("dialog")?.open).toBe(true);

    unmount?.();
    unmount = undefined;

    expect(document.querySelector("dialog")).toBeNull();
  });
});
