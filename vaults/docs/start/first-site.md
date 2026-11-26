---
title: "Your first site"
order: 2
description: "Add a note, preview the site, and find the static build."
---

After [[start/installation|initializing a project]], replace `vault/index.md` with your home note. If you named your vault in `init`, its folder has that name instead of `vault`.

```md
---
title: Field notes
description: Notes from the garden.
---

This is my garden notebook. Start with [[Tomatoes]].
```

Add a second file named `vault/Tomatoes.md` with a paragraph about tomatoes. You can open the `vault` folder in Obsidian and edit there.

Run `npm run dev` and open the printed URL. Follow the Tomatoes link. Stop the dev server with Ctrl+C, then check a production build:

```sh
npm run build
npm run preview
```

The starter vault has the ID `notes`. Upload `.svartz/vaults/notes/dist/` to a static host when ready. See [[writing/publication|What gets published]] before pointing the config at an existing vault.
