# Svartz 2.6.0 on two large Obsidian vaults

Neither vault published with the default static config. A diagnostic build produced 959 static note pages. Opening one downloaded about 3 MB compressed before any search or graph interaction. The 1,479-note vault still failed to publish. Reproduce with [the stress harness](../../scripts/stress/README.md).

## Corpora and setup

| Corpus | Pinned revision and license | Tracked → indexed notes | Deepest note folder | Attachment candidates → indexed | Wikilinks / approximate embeds |
| --- | --- | ---: | ---: | ---: | ---: |
| [oldwinter/knowledge-garden](https://github.com/oldwinter/knowledge-garden/tree/f37f4db8d1a7f59ca46923132f0a4eb63fa6d701) | `f37f4db8d1a7f59ca46923132f0a4eb63fa6d701`, [MIT](https://github.com/oldwinter/knowledge-garden/blob/f37f4db8d1a7f59ca46923132f0a4eb63fa6d701/LICENSE) | 961 → 959 | 4 | 54 (0.32 MB) → 14 | 4,097 / 56 |
| [AlexiaChen/my-notes](https://github.com/AlexiaChen/my-notes/tree/0b5ac57a9392ca6d70b33678a29b01c691f3e39f) | `0b5ac57a9392ca6d70b33678a29b01c691f3e39f`, [MIT](https://github.com/AlexiaChen/my-notes/blob/0b5ac57a9392ca6d70b33678a29b01c691f3e39f/LICENSE) | 1,479 → 1,479 | 5 | 1,636 (516 MB) → 1,626 | 432 / 1,679 |

`knowledge-garden` is a daily-use Chinese knowledge garden with dense wikilinks and aliases; `my-notes` is a technical notebook with many images, long math-heavy notes, and block references. The two excluded garden Markdown files have dot-prefixed paths. Attachment counts are file counts, not embed counts. License checks verified the repositories' declared terms at the pins; the harness does not redistribute the source or fetch externally embedded media.

I could not verify a pinned public source for [Fork My Brain](https://notes.nicolevanderhoeven.com/Fork+My+Brain) or a licensed source checkout for [docs.oldmartijntje.nl](https://docs.oldmartijntje.nl/). I did not scrape either published site. [Blue Book](https://github.com/lyz-code/blue-book/tree/e494de6c0d30b338b3117025819be35bdf1e5af6) declared CC0 and had 1,123 tracked Markdown paths, but I could not establish it was an Obsidian vault. I could not establish a content license for the Obsidian Hub mirror.

Svartz source: [`711f3906`](https://github.com/mia-cx/svartz/commit/711f3906a713c8b9a5a572d0f34c85e90c3bc3d1) (2.6.0), frozen workspace lockfile, static target, [default Minimal theme](../../packages/config/src/resolver.ts#L29). Debian x86-64, AMD Ryzen 9 7950X, 24 logical CPUs available, 31 GiB host RAM, Node 24.19.0, pnpm 9.14.2, Chromium 156.0.8078.108, Obsidian 1.15.1. Each CLI build ran in its own `systemd-run --user --scope` with `MemoryMax=12G` and `MemorySwapMax=0`. Peak is cgroup-v2 `memory.peak`, including the process tree and memory charged to the scope, not V8 heap or RSS. One cold/repeat pair per successful profile; no OS cache flush or repeated-run confidence bounds.

## Builds

| Vault / profile | Cold wall / peak | Repeat wall / peak | Outcome |
| --- | ---: | ---: | --- |
| `knowledge-garden`, default | 82.22 s / 4.57 GiB | — | Invalid non-ASCII redirect `Location`; prerender fails. |
| `my-notes`, default | 122.73 s / 3.18 GiB | — | V8 heap limit, `SIGABRT`. |
| `knowledge-garden`, encoded redirects + 6 GiB Node old-space | 84.09 s / 4.64 GiB | 80.72 s / 4.75 GiB | 959 rendered note pages; 435 MB total static output. No history plugin. |
| `my-notes`, encoded redirects + 6 GiB Node old-space | 335.41 s / 12.00 GiB | — | Bundled and reached prerender, then failed on `prerender_invalid_url`. The scope hit its memory ceiling; this was not an observed cgroup kill. |
| `knowledge-garden`, same diagnostic + Git versions | 109.10 s / 4.85 GiB | 107.24 s / 5.13 GiB | 21 versions across three notes. Each Vite pass on both runs compiled 21 and reused 0. |
| `knowledge-garden`, same Git versions + retain both passes' cache keys | 105.81 s / 5.26 GiB | 92.13 s / 5.39 GiB | Each cold pass compiled 21; each warm pass reused all 21. Benchmark-only. |
| One-note version cache control, default heap | 7.20 s / 1.84 GiB | 7.50 s / 1.57 GiB | Cold first pass compiled 3 and reused 0; repeat first pass compiled 0 and reused 3. |

The history run reads 87 commits up to the garden pin and opts three notes in without modifying the checkout. Neither vault opted into versions in its own frontmatter. With normal pruning, the repeat retained the cache directory but missed every entry. The retain-keys diagnostic removed 13.68 s (13%) from a single cold/warm pair and verifies that the compiled versions can be reused. It measures the full build, not just version compilation. The small control verifies normal reuse when both passes use the same keys.

## Payload and browser

Sizes are decimal. These are emitted modules and serialized structures, not separate browser requests. The `my-notes` artifacts were emitted before its failed prerender.

| Artifact | `knowledge-garden` raw / gzip | `my-notes` raw / gzip |
| --- | ---: | ---: |
| Index module | 5.54 MB / 1.31 MB | 42.90 MB / 14.70 MB |
| Search module (documents + MiniSearch) | 4.13 MB / 1.28 MB | 44.81 MB / 14.56 MB |
| Search document array | 1.74 MB / 0.53 MB | 19.33 MB / 6.95 MB |
| Serialized MiniSearch index | 2.38 MB / 0.76 MB | 25.45 MB / 7.62 MB |
| Graph adjacency (nodes / outgoing edges) | 197 kB / 30 kB (959 / 2,245) | 116 kB / 27 kB (1,479 / 248) |

Browser results come only from the garden diagnostic build without history. Three fresh visits per device at the 25th, 50th, and 75th percentile by HTML size: 346–353 kB raw HTML, 31–34 kB gzip. The rest of the page brought the total to **2.98–3.02 MB transferred on desktop** and **2.93–3.02 MB on the phone profile** (headers included), or 10.95–11.04 MB decoded across both. Two shared JavaScript chunks alone carried 2.65 MB gzip in each sample. This is a cost of opening a note, not a cost of querying search afterward. No local HTTP errors or uncaught page errors in the six sampled visits. `my-notes` has no browser measurements because there was no published site.

| Interaction | Desktop median (range) | Pixel 7 emulation median (range) |
| --- | ---: | ---: |
| First search (`Obsidian`), input → result DOM | 220 ms (191–233) | 197 ms (197–244) |
| Later searches (`知识管理`, `zettelkasten`), input → result DOM | 3.4 ms (2.1–4.6) | 3.6 ms (2.2–4.2) |
| Open full graph → first canvas draw | 91 ms (87–111) | 89 ms (84–115) |
| Open full graph → two animation frames | 142 ms (135–162) | 223 ms (195–251) |
| Wheel / pinch → first changed zoom draw | 0.7 ms (0.6–0.9) | 0.4 ms (0.4–1.1) |
| Wheel / pinch → two animation frames | 41 ms (36–45) | 289 ms (264–292) |

Each search returned eight result options. First search includes loading the engine in that page; the warm measurements use different queries on the same page, so the gap is not a controlled same-query comparison. The graph probes detect drawing and zoom changes, not force-layout settling or steady-state FPS. Phone emulation exercises the touch path but runs on the same CPU and loopback network as desktop; the pinch and wheel timings are not a hardware comparison. External media was blocked for the measurement, so its download size and availability are unmeasured.

## Link comparison with Obsidian

Svartz's extractor counted 4,097 wikilink occurrences in the garden (167 labeled, 27 heading, 0 block) and 432 in `my-notes` (3 labeled, 164 heading, 26 block). Of these, **1,694** and **128**, respectively, had no indexed note target. In the garden, 20 of those have an indexed attachment with the same basename and 12 are local fragments. In `my-notes`, 125 are local fragments, leaving three named occurrences with no indexed note target. These are not broken-link totals. The Obsidian comparison sampled 18 category rows for the garden and 14 for `my-notes` (a link can match more than one category). The sample is diagnostic, not representative; no sampled bare link had duplicate note stems, so it does not establish parity for ambiguous links.

| Case | Result |
| --- | --- |
| Deep and labeled note links | Both chose `Extras/Documents/Obsidian JSON Canvas 1.0 规范.md` from the explicit labeled path in `Obsidian canvas 使用 cursor生成.md`, four folders down. Both chose `AI/图解深度学习/第2章-神经网络.md` from `第1章-绪论.md:227`. No wrong note target among the sampled ordinary links. |
| Unwritten or absent targets | Both failed to find the sampled `[[生活化减脂]]` and `[[路径依赖]]` garden notes, and `[[noreturn]]` in `my-notes`. A missing target in both is not evidence of a Svartz resolution bug. |
| Attachment, not a note | Obsidian chose `Atlas/Categories/_ 分类 categories.base` from `Atlas/Bases/∑ BASE.md:21`. Svartz had no note edge but rendered a link to the published 416 B file. This verifies the file link, not an interactive Bases view. |
| Bare frontmatter alias | From `📂 文件夹结构总览.md:68`, Svartz mapped `[[📥 Inbox]]` to `Cards/一元化收集.md`; Obsidian's file resolver returned no destination. Same pattern for `独立思考` and `knowledge graph`. These are alternate names, not the `[[filename\|label]]` syntax; the Svartz behavior is broader, not a sampled broken web link. |
| Same-note heading | `Sources/AIGC/kubectl 命令执行流程图.md:14` points to the heading on line 21. Obsidian recognized it. The published page has a heading ID (`️-整体架构图`) but replaces the jump with a blank disabled span. In `my-notes`, Obsidian recognized the jump in `CloudStack完全安装指南.md:997` to line 1246; Svartz emitted no note target for it. |
| Same-note and cross-note blocks | Obsidian recognized the `^0e4b33` block (`Python神经网络编程.md:220`, link at line 237). The Svartz component prints the literal block marker and emits no jump. From `区块链生态系统的分层.md:114`, both selected `区块链扩容之Optimistic Rollups.md`; Svartz's component links to `#03d1ca` but the destination component prints `^03d1ca` as text at the block from source line 73, without that ID. This is a wrong fragment, not a wrong note. |

## Ranked follow-ups

1. **Blocker: publication errors from content URLs.** In the garden, `/+-常青笔记阅读笔记/` redirects to a path containing Chinese characters and `∑`. [Route allocation](../../packages/plugins/src/internal/routes.ts#L173) stores the raw destination; [the catch-all route](../../packages/cli/app/src/routes/%5B...slug%5D/+page.ts#L10) passes it into the HTTP `Location` header. Encoding the diagnostic destination alone let the garden publish. A second case survives that workaround: `my-notes`' `backend/DevOps/Prometheus/Prometheus教程04-使用Grafana可视化指标.md:22` has a bare `http://localhost:9090` next to full-width punctuation. The emitted autolink includes the following prose in its authority (`http://localhost:9090%EF%BC%89%EF%BC%8C…`), which the SvelteKit crawl rejects. Start with URL encoding at the redirect response boundary and a fixture for autolinking CJK punctuation; do not silently drop unrelated crawl failures.
2. **High: build memory on attachment-heavy vaults.** The default heap aborted, and allowing 6 GiB old-space left the whole job at the 12 GiB scope ceiling without finishing. Profile [parallel note compilation and attachment buffering](../../packages/plugins/src/emit-artifacts.ts#L178) and Vite separately before assigning the peak to either. The same run emitted two large index modules as well as the note and asset artifacts; a bigger heap alone is not a publishability fix.
3. **High: loading one note downloads vault-wide data.** [Indexing](../../packages/plugins/src/index-content.ts#L240) puts note text into the index, and the [search module](../../packages/plugins/src/emit-artifacts.ts#L136) adds documents and a serialized MiniSearch index. The [vault module imports both](../../packages/vite/src/artifacts.ts#L212); [first text search loads MiniSearch](../../packages/ui/src/lib/search.ts#L77). Separate the page's routing/navigation data from search payloads, then remeasure first search and note transfer together. The garden's graph adjacency alone is only 30 kB gzip, but a full graph on the touch path took 195–251 ms to the frame proxy; profile that path independently of transfer.
4. **High: Obsidian heading and block links lose the destination anchor.** [The resolver](../../packages/plugins/src/resolve-links.ts#L29) makes URL fragments with a heading slugger and falls back to disabled markup for unresolved wikilinks. Treat same-note fragments as local links and pair block IDs with emitted anchors. Test both the destination route and the existence of the rendered target ID.
5. **Medium: version cache pruning defeats reuse across Vite passes.** A file-read trace on another unchanged repeat observed 42 distinct lookups, all `ENOENT`. The client pass requested the exact 21 keys on disk before the build; the server pass requested 21 different keys and [pruned](../../packages/plugin-history/src/versions.ts#L130) the client set first. The client then pruned the server set. Keeping both sets restored all 42 lookups on repeat. Find which [fingerprint input](../../packages/plugin-history/src/cache.ts#L65) differs between passes before deciding whether to share keys or prune after both passes.
