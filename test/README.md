# Nakconel Campaign Test Guide

Open `/nakconel-campaign.html` through the Flask app to test the full campaign flow. A static copy also exists at `test/nakconel-campaign.html` for review.

## Flow

1. Open `/nakconel-campaign.html` while signed out.
2. Confirm it redirects to `/register?next=/nakconel-campaign.html`.
3. Register with Google or email/password using `register.html`.
4. Confirm registration returns to `/nakconel-campaign.html`.
5. Enter name, business, and brand challenge.
6. Select a package and pay through the Paystack popup in NGN.
7. Confirm the success screen appears with the `Contact Team` link pointing to `/contact`.

## Packages

- Brand AI Discovery: USD 20, NGN 32,000
- Brand Evolution: USD 60, NGN 96,000
- Premium Brand Transformation: USD 250, NGN 400,000
