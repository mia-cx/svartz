---
title: Retrieve a pet
description: One pet by id, with its photos.
source:
  - https://github.com/harbour-example/api/blob/main/src/routes/pets.ts#L48-L71
  - { label: OpenAPI document, href: "https://api.harbour.example/v2/openapi.json" }
operation:
  protocol: rest
  method: GET
  path: /pets/{petId}
  auth: { scheme: bearer, description: A dashboard token., scopes: [pets:read] }
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
  responses:
    200: { description: The pet., schema: { $ref: Pet } }
    404: { description: No pet with this id., schema: { $ref: Error } }
---

Retrieving an adopted pet still works, so old links keep resolving.
