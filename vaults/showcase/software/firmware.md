---
title: Firmware
description: The loop that reads the sensors, and how readings reach the server.
tags: [software]
created_at: 2026-08-28
updated_at: 2026-08-28
---

The board wakes every five minutes, reads each sensor, sends one JSON payload, and sleeps. Everything else is detail.

## Reading loop

```ts title="src/station.ts" {4-6}
export async function sample(bus: I2CBus): Promise<Reading> {
  const climate = await sht45.read(bus);
  const pressure = await bmp390.read(bus);
  if (climate.humidity > 95) {
    await sht45.heat(bus, { seconds: 1 });
  }
  return { ...climate, pressure, takenAt: new Date() };
}
```

Readings post to a small server as JSON:

```json
{
  "station": "fence-post",
  "temperature": 14.2,
  "humidity": 81.5,
  "pressure": 1012.8
}
```

## Flashing

Build and flash from the project root:

```bash
pnpm build
pnpm flash --port /dev/ttyUSB0
```

> [!bug]- Known issue: the first reading after a flash
> The pressure sensor needs one discarded reading after power-on. The firmware now skips it; older builds reported 0 hPa once per boot.

## Sea-level pressure

The altitude correction is short enough to show whole:

```python showLineNumbers
def sea_level_pressure(station_hpa: float, altitude_m: float, temp_c: float) -> float:
    kelvin = temp_c + 273.15
    return station_hpa * (1 - (0.0065 * altitude_m) / (kelvin + 0.0065 * altitude_m)) ** -5.257
```

Call it with `sea_level_pressure(1007.9, 42, 14.2)` and it returns about 1012.8.
