# AGRISENSE Project Notes

## Purpose
Support small-scale farmers in Kenya with accessible market information, transport cost estimation, weather guidance, post-harvest storage discovery and practical planning.

## Main modules
1. Public landing page and farmer workspace
2. Farmer profile and harvest planning details
3. Verified market-price comparison and period movement
4. Transport and net proceeds calculator
5. Evidence-based market outlook interface
6. Storage directory examples
7. County weather intelligence
8. Community price observations and browser price alerts
9. Farm-planning advisory

## Suggested next development tasks
- Add an administrator dashboard to approve/reject pending price reports.
- Integrate official or contracted market data sources and display source, date, market and unit for every price.
- Connect Google Maps Routes API through a backend secret to estimate distance and route costs.
- Connect an AI forecasting provider and validate that each forecast horizon has sufficient verified data.
- Add verified storage-facility contacts, locations, capacities, availability and charges.
- Add farmer registration and authentication before using the anonymous browser profile for accounts.
- Add crop-specific planting and harvest guidance reviewed by Kenyan agricultural extension experts.
- Integrate Kenya Meteorological Department seasonal bulletins alongside short-range weather forecasts.
- Add SMS through a provider such as Africa's Talking after obtaining consent and configuring a sender ID.
- Add administrator roles, report-verification audit history, and automated tests.

## Current limitations
- Market data comes only from community observations marked verified; sample dashboard values are illustrative.
- Price outlooks do not generate numerical predictions. AI provider integration is not configured.
- Storage cards are examples, not verified facility listings.
- Transport distance is entered by the farmer; route calculation is not configured.
- Farmer profiles and price alerts are scoped to a browser-generated anonymous ID; this is not account registration.
- Browser price alerts require the app to be open. SMS and scheduled server alerts are not configured.
