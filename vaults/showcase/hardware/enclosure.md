---
title: Enclosure
description: A radiation shield, a dry box, and the wiring between them.
tags: [hardware]
created_at: 2026-08-24
updated_at: 2026-08-24
---

The electronics live in two places: the sensors in a vented radiation shield, and the board and battery in a sealed box below it.

## Radiation shield

Direct sun on a temperature sensor adds several degrees. The shield is a stack of white plates with gaps between them, so air moves through and sunlight doesn't. ==Never mount the sensor inside the sealed box.== It reads the box, not the weather.

![[sensors#Humidity]]

## Build checklist

- [x] Print eight shield plates in white ASA
- [x] Drill cable glands into the dry box
- [x] Solder the sensor breakout to a four-wire lead
- [ ] Seal the lid with a new gasket
- [ ] Mount the post 1.5 m above grass
  - [ ] Check the spot gets no afternoon shade from the shed

## Wiring

1. Run the four-wire lead from the shield to the box.
2. Connect `VCC`, `GND`, `SDA`, and `SCL` to the board.
3. Tie the rain gauge to `GPIO 4` with a 10 kΩ pull-up.
