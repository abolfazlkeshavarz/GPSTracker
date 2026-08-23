# Tracker carrier PCB — RG-CARR-01 rev A

Two-layer carrier board for the tracker hardware: an **ESP32-S3-WROOM-1** soldered
directly, with the **SIM800C** and **NEO-6M** breakouts on headers, running from a
12 V vehicle supply.

Board: **90 × 60 mm**, 2 layers, 1 oz copper, 1.6 mm FR-4, 4 × Ø3.2 mounting holes
4.0 mm in from each edge.

The full drawing package — dimensioned floorplan, power tree, layout rules and BOM —
is published as an artifact. This file is the text of record.

---

## The module changes the pinout

The photos are of an **ESP32-S3-WROOM-1**, not a classic ESP32. That matters, because
the firmware as written cannot run on it:

```c
#define IGNITION_PIN 34      // WROOM-1 does not break out IO34 at all
```

WROOM-1 exposes IO0–IO21, IO35–IO42 and IO45–IO48. There is no pin 34.

The UART pins (12/13/14/15) *do* exist on S3, but the assignment below also moves
them clear of the USB and PSRAM pins, so native USB flashing and an octal-PSRAM part
both remain possible later.

### Assignment

| Signal | GPIO | Module pin | Goes to | Why this pin |
|---|---|---|---|---|
| GPS UART RX | IO17 | 10 | M2 TX | Free, no strap function |
| GPS UART TX | IO18 | 11 | M2 RX | Free, adjacent to RX |
| GPS PPS (optional) | IO16 | 9 | M2 PPS | Timing input for future sync |
| GSM UART RX | IO5 | 5 | M1 TXD | 2.8 V input clears S3 V<sub>IH</sub>, direct |
| GSM UART TX | IO4 | 4 | M1 RXD | Through divider — see below |
| GSM PWRKEY | IO6 | 6 | Q2 gate | Pull low >1 s to power the modem on |
| GSM RESET | IO7 | 7 | Q3 gate | Recovery from a wedged modem |
| GSM STATUS | IO15 | 8 | M1 STATUS | Input: is the modem actually running |
| Ignition sense | IO1 | 39 | R5/R6 divider | **ADC1** — usable while WiFi is on |
| V<sub>IN</sub> sense | IO2 | 38 | R7/R8 divider | ADC1, reports real battery volts |
| Status LED | IO21 | 23 | D3 | Free |
| Buzzer / relay | IO14 | 22 | J2 | Free |
| Console UART | IO43/44 | 37/36 | Prog. header | UART0, flashing and logs |
| BOOT | IO0 | 27 | SW1 | Strap — button only, no load |
| Reset | EN | 3 | SW2 + RC | 10 k pull-up, 1 µF to GND |

ADC1 is GPIO1–10 on the S3. Both analogue inputs are deliberately on ADC1 because
**ADC2 is unusable while WiFi is active** — putting the ignition sense there would
give readings that fail only when the radio is on, which is a miserable bug to chase.

### Pins to leave alone

| GPIO | Reserved for | Consequence if used |
|---|---|---|
| IO19, IO20 | Native USB D− / D+ | Loses USB flashing and CDC logging |
| IO26–IO32 | SPI flash | Not brought out; shorting them bricks boot |
| IO35, IO36, IO37 | Octal PSRAM on R8 parts | Fine on N4R2/N8R2, fails on N8R8/N16R8 |
| IO0, IO3, IO45, IO46 | Boot straps | Wrong level at reset changes boot mode |
| IO46 | Input only | Silently never drives an output |
| IO34 | — | **Not present on WROOM-1** |

---

## Power

The single thing that decides whether this design works.

```
12 V ──▶ F1 fuse ──▶ Q1 reverse-polarity FET ──▶ D1 TVS
                                                   │
                                    ┌──────────────┴──────────────┐
                                    ▼                             ▼
                          U2 buck → 4.1 V @ 3 A          (same node)
                                    │                             │
                                    ├──▶ M1 SIM800C               │
                                    │    2 A peak burst           │
                                    │    C1 1000 µF alongside     │
                                    │                             ▼
                                    └──────────────────▶ U3 LDO → 3.3 V @ 1 A
                                                                  ├──▶ U1 ESP32-S3
                                                                  └──▶ M2 NEO-6M
```

**Budget at 12 V, worst case:** (4.1 V × 2 A + 3.3 V × 0.45 A) ÷ 0.85 ≈ 11.4 W ≈ 0.95 A.
Average draw is far lower — the 2 A figure is a 577 µs burst at 216 Hz, not a duty cycle.

### Why the modem gets its own rail

A SIM800C pulls up to **2 A in 577 µs bursts** while transmitting. A regulator sized
for the average will sag on every burst, and the classic symptom is a modem that
registers on the network and then resets the instant it tries to send.

The bulk capacitor next to the *modem* — not next to the regulator — is what supplies
that burst. The regulator only has to refill it between bursts.

> **Do not power the SIM800C from 5 V or from the 3.3 V rail.** Its V<sub>BAT</sub>
> range is 3.4–4.4 V. 3.3 V is below the brown-out threshold under load; 5 V is over
> absolute maximum.

U2 is specified at 60 V input (TPS54360) rather than a common 24 V part, because
automotive load dump can exceed 40 V and a TVS alone does not clamp low enough to
protect a 24 V regulator.

### Level shifting

| Direction | Levels | Treatment |
|---|---|---|
| M1 TXD → ESP32 RX | 2.8 V → 3.3 V | Direct. S3 V<sub>IH</sub> is 0.75 × 3.3 = 2.48 V; 2.8 V clears it. |
| ESP32 TX → M1 RXD | 3.3 V → 2.8 V | R1 1 k series, R2 2.7 k to GND → 2.41 V. Above the modem's 1.96 V V<sub>IH</sub>, under its absolute max. |
| Ignition 12 V → IO1 | 12 V → ≤3.1 V | R5 100 k / R6 22 k → 2.16 V at 12 V, 2.59 V at 14.4 V. Add a 3.3 V zener for load dump. |

---

## Layout rules

1. **Bulk capacitance belongs at the modem, not the regulator.** C1 within 10 mm of
   M1's V<sub>BAT</sub> pin, 100 nF ceramic beside it.
2. **Power traces sized for 2 A.** At 1 oz that is 1.5 mm minimum for the 4.1 V rail
   and its return; 2 mm is better. Thin traces here show up as a modem that resets
   under load.
3. **The ESP32 antenna keepout is not optional.** No copper, no pour, no traces on
   either layer under the hatched zone, and keep it at the board edge.
4. **Keep the two radios apart.** > 25 mm between the GSM antenna and the GPS patch.
   GSM bursts at up to 2 W will desensitise a GPS receiver next to them — the symptom
   is a fix that drops every time the tracker reports.
5. **GPS patch faces the sky with nothing above it.** No enclosure metal, no cabling
   routed over M2.
6. **Ground pour on both layers, stitched** with vias every ~10 mm around the edge and
   around the switching node.
7. **Keep the buck's switching loop tight** — U2, inductor, catch diode and input cap
   form the fast loop. Make it physically small before routing anything else.

---

## Bill of materials

| Ref | Part | Value / MPN | Package | Note |
|---|---|---|---|---|
| U1 | MCU module | ESP32-S3-WROOM-1 | SMD-41 | Prefer N4R2/N8R2 to keep IO35–37 free |
| M1 | GSM modem | SIM800C breakout | 2×6 header | Has SIM holder and GSM antenna |
| M2 | GNSS | GY-NEO6MV2 | 1×4 header | Ceramic patch, faces up |
| U2 | Buck regulator | TPS54360 | SO-8 | 60 V input survives load dump |
| U3 | LDO | AP7361C-33 | SOT-223 | 0.36 W dissipation from 4.1 V |
| D1 | TVS | SMBJ26A | SMB | Unidirectional, across V+/GND |
| D2 | Catch diode | SS34 | SMA | Per U2 datasheet |
| D3 | Status LED | green | 0805 | 1 k series |
| Q1 | Reverse-polarity FET | AO3401 | SOT-23 | P-channel, source to V+ |
| Q2, Q3 | Signal FET | 2N7002 | SOT-23 | PWRKEY and RESET drive |
| L1 | Inductor | 10 µH, 4 A sat | shielded | Saturation current, not just rating |
| C1 | Bulk electrolytic | 1000 µF 16 V | Ø10 radial | Low ESR, next to M1 |
| C2, C3 | Input ceramic | 10 µF 50 V | 1210 | X7R, at U2 input |
| R1, R2 | Level divider | 1 k, 2.7 k | 0603 | ESP32 TX → modem RXD |
| R5–R8 | Sense dividers | 100 k, 22 k | 0603 | Ignition and V<sub>IN</sub> to ADC1 |
| J1 | Power/IO terminal | 4-pos 5.08 mm | THT | V+, GND, IGN, spare |
| J2 | Aux header | 1×4 2.54 mm | THT | LED, buzzer, spare I/O |
| SW1, SW2 | Tactile | 6×6 mm | THT | BOOT and EN |

---

## Status

This is a **design package, not fabrication output**. There is no routing, no DRC and
no impedance control. Take it into KiCad, route it, and have someone review the power
stage before ordering boards.

Substitutions are expected — the regulator and FET choices are the parts that matter
functionally, not the exact MPNs. If a 60 V buck is hard to source, the requirement is
"survives load dump", not "is a TPS54360".
