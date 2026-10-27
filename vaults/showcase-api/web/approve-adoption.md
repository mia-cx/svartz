---
title: Approve an adoption
description: The shelter dashboard's Approve button. Records the decision and returns to the adoption.
operation:
  method: POST
  path: /dashboard/adoptions/{adoptionId}?/approve
  client: browser
  parameters:
    - name: adoptionId
      in: path
      type: string
      example: ad_901
    - name: session
      in: cookie
      type: string
      required: true
      description: The signed-in staff member's session.
      example: <session>
  requestBody:
    contentType: application/x-www-form-urlencoded
    schema:
      type: object
      properties:
        note: { type: string, description: Shown to the adopter. }
    example:
      note: See you Saturday!
  responses:
    303:
      description: Back to the adoption, now approved.
      headers:
        Location: /dashboard/adoptions/ad_901
    403:
      description: The staff member can't decide for this shelter.
      contentType: text/html
---

A SvelteKit form action. Only a signed-in staff member's browser sends it, so there is no token.
