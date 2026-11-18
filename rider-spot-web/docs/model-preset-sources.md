# Rider Spot motorcycle model maintenance catalog (2026-11-18)

## Scope and limitations

- 72 model entries across 9 brands. The list includes legacy/imported models that may not be sold in Korea currently. It is a **selection catalog**, not a claim that these 72 models are all equally common or officially distributed.
- Model-year and market variants can have different service schedules, parts, and prices. The year-specific source tag on Honda PCX125 (2021+) refers **specifically to its 2025 European manual**. It is not proof that every 2021–2026 bike has the same interval.
- Estimated prices are broad **Korean market ranges for the displacement/drive category**, including rough parts and labor. They are **not exact per-model dealer quotes**. Riders can override the estimate for their own selected model, per part.
- Tire, brake pad, and chain distances in the catalog are *advisory review/usage estimates*, **not manufacturer-prescribed mandatory replacement mileage**. Inspect tread depth, brake wear, and chain/drive wear. Do not change a part solely because of the number. Actual schedules are governed by model/year manual and conditions.
- No odometer reading or repair history is generated when a model is selected. The next-due distance is calculated only if a real previous service event has a known odometer. Model cost estimates do not become expense history.
- Electric models omit engine oil and CVT belt. Chain-drive models list a chain instead of a belt.

## Primary service schedule references

1. Honda PCX125 WW125S/A 2025 European owner's manual:
   https://2rom-prd-data.hondamotopub.com/om/HMEE/WW125S_A%20%28PCX%29/2025/WW125SA_OM_32K1YE00_web.pdf
   - Maintenance table: engine oil at initial 1,000 km and subsequent every 6,000 km. Drive belt inspection at 12,000 km and replacement at 24,000 km; important note that market and model year may vary.
2. Honda PCX125 older Korean manual:
   https://2rom-prd-data.hondamotopub.com/om/HKO/PCX/2010/10PCX125_32KWN600_0.pdf
   - Belt inspected at 8,000 km increments; replacement at 24,000 km.
3. Yamaha NMAX 125 GPD125 owner manual:
   https://www.manualzz.com/doc/91139001/yamaha-nmax-125-scooter-owner-s-manual
   - V-belt indicator interval of 18,000 km; verify the exact year/market model.

## Korean cost references

- https://ddalbae.kr/guide/repair-cost-guide
- https://gtbikemall.com/maintenance-cost
- https://vroomservice.kr/sub/mechanic.php

These sources cover broad components and labor costs. The catalog rounds ranges to reflect uncertainty; it intentionally does not assert that identical cost estimates correspond to manufacturer quotes for different models.

## User data migration and identity

- Add nullable `rider_vehicle_profiles.model_key`, no destructive changes to `vehicle_name`, odometer, or service logs.
- Model-specific edits are stored in `rider_model_maintenance_settings`, with owner RLS and composite key (user, model, part).
- Existing `rider_maintenance_cycles` remain intact; when a user initially selects a model, old entries are safely copied to the **previous inferred model** where appropriate. They are never silently deleted.
- Changing model must not transfer the previous model's saved interval/cost to the newly chosen model.
- Editing an expected budget must never write a real paid `maintenance_logs.cost_won` amount.
- Changing model must not reset the manually recorded odometer or clear service records.

## Future data quality improvements

- Add year/market-specific subclasses for more models as official owner manuals are verified.
- Localized real cost data can eventually be derived from explicit opt-in anonymized aggregates, not from users' private individual repair histories.
- Use versioned price/interval data and retain source URLs per part when adding better-quality manufacturer schedules.
