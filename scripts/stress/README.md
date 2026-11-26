# Large vault benchmark

Run from the repository root with Node 24, pnpm 9, Git, and Chromium. Build the workspace once with `pnpm install --frozen-lockfile && pnpm build`. The report pins the Svartz build and corpora; the runner uses the CLI built from the current checkout. It does not deploy anything.

1. **Default static builds.** Use the default theme and heap limit, with no extra plugins.

   ```sh
   env -u NODE_OPTIONS node scripts/stress/run.mjs --build-only
   ```

2. **Diagnostic builds.** Measure the index, links, and browser behavior after building.

   ```sh
   NODE_OPTIONS=--max-old-space-size=6144 node scripts/stress/run.mjs --build-only --encode-redirects
   STRESS_CHROMIUM=/usr/bin/chromium NODE_OPTIONS=--max-old-space-size=6144 \
     node scripts/stress/run.mjs --measure-only --encode-redirects
   ```

   The diagnostic plugin URI-encodes non-ASCII redirect destinations in the generated index. It never edits notes or Svartz. `STRESS_CHROMIUM` may point to another Chromium executable; omit it to use an installed Playwright Chromium. Append a vault ID to run only that vault. A failed build sets exit status 1 but still lets the other vault run; `--measure-only` reads any artifacts it left and skips the browser if the build failed.

3. **Git version cache.** Run the same large vault with Git history enabled, then a small positive control.

   ```sh
   NODE_OPTIONS=--max-old-space-size=6144 node scripts/stress/run.mjs \
     --build-only --encode-redirects --history knowledge-garden
   NODE_OPTIONS=--max-old-space-size=6144 node scripts/stress/run.mjs \
     --build-only --encode-redirects --history --retain-version-keys knowledge-garden
   env -u NODE_OPTIONS node scripts/stress/run.mjs --history-control
   grep -F '[history]' .stress-cache/knowledge-garden/encoded-heap6144-history{,-retained}/{cold,warm}.log
   grep -F '[history]' .stress-cache/history-control/{cold,warm}.log
   ```

   `--history` fetches full history to the pinned revision. A config hook opts three notes from `vaults.mjs` into versions without changing the checkout. The control creates one note with three commits. A `warm` filename means the runner kept the build directory. Check the compiled and reused counts for actual hits.

   `--retain-version-keys` is a separate diagnostic profile. It preloads a script in the CLI that skips pruning hashed version JSON files from that profile's cache. Cold still starts empty. The repeat can then reuse entries from both Vite passes. Use it only in this benchmark; stock builds should prune stale entries.

4. **Obsidian comparison.** After step 2, point the script at the Obsidian 1.15.1 executable. On Linux without a display, use Xvfb.

   ```sh
   for vault in knowledge-garden my-notes; do
     xvfb-run -a node scripts/stress/obsidian.mjs "$vault" encoded-heap6144 /path/to/obsidian
   done
   ```

   This copies tracked, non-hidden files to a fresh temporary vault and profile without community plugins. It samples up to three distinct links per category and asks Obsidian's metadata cache for the destination and heading or block existence. `obsidian.json` contains the result. Compare it with `links.json`, the rendered page or emitted page component, and the source. A missing note-index edge can still be a working attachment link or a same-note jump. The sample is not a vault-wide accuracy estimate.

## Outputs

Everything written by the harness lives under ignored `.stress-cache/`. `vaults.mjs` pins content; the runner refuses a different revision or a dirty checkout. Never commit the vaults, raw link samples, app binaries, or generated sites.

- `<vault>/<profile>/{cold,warm}.{json,log}`: whole CLI build wall time and peak memory. Cold clears only the profile's generated `site/`; warm retains it. Git fetch, dependency install, and browser work are outside the timers. The runner uses a fresh user systemd scope with `MemoryMax=12G` and `MemorySwapMax=0` when available, reading cgroup-v2 `memory.peak`. Without that counter it records sampled process-tree RSS every 200 ms; without a scope there is no harness-enforced memory cap. These measurements are not interchangeable. Run one benchmark at a time.
- `audit.json`, `links.json`: tracked and visible note counts, publication counts, emitted module/adjacency bytes and offline gzip sizes, and per-occurrence wikilink candidates. A visible path has no dot-prefixed segment; attachment candidates are other visible tracked files with an extension. The embed count is a text scan, not a render count. Indexed note edges exclude attachment and same-note targets.
- `browser.json`: Page Resource Timing after a fresh visit to each of three notes selected by rendered HTML size (25th, 50th, 75th percentile). The loopback server gzips text; external requests are blocked. Transfer size includes HTTP response headers; these are not CDN or navigation-through-cache metrics. Search measures input to result DOM update. The graph measures click to first canvas draw and to two animation frames, then the same for a wheel or pinch zoom. Two frames are a proxy for reaching a painted frame, not a direct paint timestamp. The Pixel 7 viewport/touch profile runs on the same desktop Chromium, without CPU or network throttling.

See [the benchmark report](../../docs/research/large-vaults.md) for the observed results and follow-ups.
