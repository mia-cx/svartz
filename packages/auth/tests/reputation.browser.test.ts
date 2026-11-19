import "../src/browser.css";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { kudosPage, reputationPage } from "../src/reputation-page";

const SETTINGS = { edit: 1, page: 5, agreement: 0.5, kudos: 5, declined: 0, dailyLimit: 100 };

function renderReputation(query = "") {
  document.body.innerHTML = `<main>${reputationPage({
    canWrite: true,
    settings: SETTINGS,
    thresholds: [{ role: "editors", score: 20 }, { role: "a-role-with-a-rather-long-name-for-sure", score: 250 }],
    roles: ["editors", "a-role-with-a-rather-long-name-for-sure"],
    query: new URLSearchParams(query),
    actions: { points: "/notes/_svartz/auth/reputation/points/", threshold: "/notes/_svartz/auth/reputation/threshold/", removeThreshold: "/notes/_svartz/auth/reputation/threshold/remove/" },
  }).html}</main>`;
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

describe("the Reputation panel", () => {
  // Proves every control is reachable from the keyboard, in reading order, under the name it shows.
  it("works from the keyboard, in order", async () => {
    renderReputation();
    const names: string[] = [];
    for (let step = 0; step < 12; step++) {
      await userEvent.keyboard("{Tab}");
      names.push(focused());
    }
    expect(names).toEqual([
      "Merged edit", "Merged new page", "+1 on a comment", "Kudos", "Declined pull request", "Daily limit", "Save points",
      "Remove the threshold for editors", "Remove the threshold for a-role-with-a-rather-long-name-for-sure", "Role", "Score", "Save threshold",
    ]);
  });

  // Proves a refused value comes back as typed, announced on the field it concerns.
  it("announces a refused value on its field", async () => {
    renderReputation("status=points-invalid&invalid=kudos&edit=1&page=5&agreement=0.5&kudos=1000&declined=0&daily-limit=100");
    const field = page.getByLabelText("Kudos");
    await expect.element(field).toHaveValue(1000);
    await expect.element(field).toHaveAttribute("aria-invalid", "true");
    await expect.element(page.getByRole("alert")).toHaveTextContent("Enter Kudos as a number from 0 to 100.");
    await expect.element(field).toHaveAccessibleDescription(/Enter Kudos as a number from 0 to 100/);
  });

  // Proves both panels fit a phone without scrolling sideways, with tap-sized controls.
  it("fits a phone-width screen, as does Kudos", async () => {
    await page.viewport(360, 800);
    for (const render of [() => renderReputation(), () => {
      document.body.innerHTML = `<main>${kudosPage({ points: 5, query: new URLSearchParams(), action: "/notes/_svartz/auth/reputation/kudos/" }).html}</main>`;
    }]) {
      render();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
      for (const target of document.querySelectorAll<HTMLElement>("button, input:not([type=hidden]), select")) {
        expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(24);
      }
    }
  });
});
