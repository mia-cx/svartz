---
title: adoptPet
description: File an adoption. The GraphQL twin of POST /adoptions.
tags: [graphql]
operation:
  protocol: graphql
  kind: mutation
  name: adoptPet
  args:
    - name: petId
      type: ID!
      required: true
    - name: applicant
      type: ApplicantInput!
      required: true
      description: Name, email, and whether they have a garden.
  returns: Adoption!
  example:
    query: |
      mutation Adopt($petId: ID!, $applicant: ApplicantInput!) {
        adoptPet(petId: $petId, applicant: $applicant) {
          id
          status
        }
      }
    variables:
      petId: p_42
      applicant:
        name: Ada Okafor
        email: ada@example.com
    response:
      data:
        adoptPet:
          id: ad_901
          status: pending
---
