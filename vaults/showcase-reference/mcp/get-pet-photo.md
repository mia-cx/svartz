---
title: Get a pet's photo
description: A pet's main photo as an image, with a link to the full gallery.
operation:
  protocol: mcp
  kind: tool
  name: get_pet_photo
  endpoint: https://mcp.harbour.example/mcp
  auth: bearer
  annotations: { readOnlyHint: true }
  inputSchema:
    type: object
    required: [petId]
    properties:
      petId: { type: string, pattern: "^p_[0-9]+$", example: p_42 }
  examples:
    - title: A photo and its gallery
      arguments: { petId: p_42 }
      result:
        content:
          - { type: image, mimeType: image/jpeg, data: "/9j/4AAQSkZJRg==" }
          - { type: resource_link, uri: "https://cdn.harbour.example/p_42/", name: Gallery, mimeType: text/html }
---

The photo arrives as an image content block, not JSON, so the tool declares no output schema.
