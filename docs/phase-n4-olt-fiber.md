# New Phase 4 — OLT & fiber signal (SNMP)

## What it does

- Admin adds each OLT once (Network → OLTs): name, brand, IP, SNMP port, read-only community.
- Every 5 minutes the server reads every ONU's received optical power (SNMP v2c, read only) and stores it.
- Network → Fiber signal lists every ONU, worst first: Good (≥ -25 dBm), Weak (-25 to -27), Critical (below -27, red).
- Customer page shows a coloured RX badge next to the name. Dashboard "Needs attention" lists the critical count.
- When an ONU drops below -27 dBm the owner gets one SMS (OWNER_PHONE). It is not repeated until the ONU recovers (above -26) and fails again.

## Linking an ONU to a customer

Type the ONU's MAC (EPON) or serial (GPON) into the customer's "ONU serial" field. Case and separators do not matter (`aabb.cc00.1102` = `AA:BB:CC:00:11:02`).
For brands without an identity OID (VSOL, C-Data) the Fiber page shows the ONU's row index as "ONU"; type that into the customer instead.

## Brand presets (apps/api/src/modules/olt/olt-profiles.ts)

| Brand       | RX power OID                          | Unit                  | Source           |
| ----------- | ------------------------------------- | --------------------- | ---------------- |
| BDCOM EPON  | 1.3.6.1.4.1.3320.101.10.5.1.5         | 0.1 dB                | NMS-EPON-ONU MIB |
| Huawei GPON | 1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4   | 0.01 dBm              | HUAWEI-XPON-MIB  |
| VSOL EPON   | 1.3.6.1.4.1.37950.1.1.5.12.2.1.14.1.3 | unknown (assumed 0.1) | V1600D MIB       |
| VSOL GPON   | 1.3.6.1.4.1.37950.1.1.6.1.1.3.1.7     | text, dBm             | V1600G MIB       |
| C-Data      | none published: enter the OID         | -                     | -                |

The ONU identity columns (BDCOM ONU MAC, Huawei ONT serial) were not confirmed on real hardware. The **Test** button shows raw values next to the computed dBm; if they look wrong, change the OIDs or "Divide by" under Advanced.

## Limits

- Verified against a fake SNMP agent only, not a real OLT.
- Needs the server to reach the OLT's IP on UDP 161. A cloud server (Render) cannot reach a private OLT address: use a public/VPN address or run the app inside the network.
- An ONU that is powered off usually stops reporting and disappears from the list rather than turning red.

Tests: test/olt-fiber.test.ts (10).
