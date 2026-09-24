# #49 Consumer comments and analytics

Wire the existing Giscus layout to decoded consumer configuration. Keep analytics optional and owned by a core plugin's browser resource, with one browser installation per provider configuration and one pageview per client navigation. Pass only the public path and title to manual trackers. Mask Svartz content for Clarity so future decrypted content cannot enter a recording.

## Work

- [x] Tests: config decoding, provider installation and navigation lifecycle, comments visibility, and full workspace checks.
- [x] Capture knowledge: recorded resource options, tracker ownership, and Clarity masking in the plugin rule.
- [x] Documentation: documented Giscus and analytics config, provider setup, and encrypted-content boundary.
- [ ] Review & Close: inspect repeated mounts, host navigation, privacy, types, packed build, and issue status; file a stacked PR.

## Implementation

1. Type and resolve Giscus and analytics consumer settings without dropping them in config decoding.
2. Contribute the analytics browser module only when configured. Give the module serialized provider settings through the existing resource loader.
3. Keep provider scripts singleton per browser document. Track a route once after navigation, and release owned listeners on unmount.
4. Make Giscus cleanup remove its script and frame. Keep `comments: false` authoritative.
