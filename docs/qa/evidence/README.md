# QA evidence

One folder per test case from [`../../QA-HANDOFF.md`](../../QA-HANDOFF.md), e.g. `A3/`:

```
A3/
├── booking.json            # localStorage value of caldera.bookings.v1 (only the tested booking)
├── activity-log.json       # Checkout activity drawer → Copy log
├── network-captures.json   # DevTools → Network → failing request → Response
├── screenshot-1.png
└── notes.md                # steps, expected, actual (failures only)
```

Never add `.env` or the value of `flywire.checkoutDemo.apiKey`.
