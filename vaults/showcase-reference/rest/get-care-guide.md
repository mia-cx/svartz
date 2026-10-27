---
title: Get a care guide
description: A species' care guide, as Markdown.
operation:
  protocol: rest
  method: GET
  path: /care-guides/{species}
  auth: none
  parameters:
    - { name: species, in: path, schema: { type: string, enum: [dog, cat, rabbit, bird, other] }, example: rabbit }
  responses:
    200:
      description: The guide.
      contentType: text/markdown
      example: "# Rabbits\n\nRabbits need space to run every day.\n"
    404: { description: No guide for this species yet. }
---

Guides are written by shelter staff and change rarely, so cache them.
