/**
 * bump. — src/utils/legalText.js
 *
 * Canonical versioned legal text for in-app consent flows.
 * Auth.jsx imports TERMS_TEXT and PRIVACY_SUMMARY for the acceptance screen.
 * All versions must be bumped here and in Auth.jsx simultaneously.
 *
 * Legal framework:
 *   - FAIS Act 37 of 2002 (SA) — bump. is NOT a licensed FSP; no regulated advice given
 *   - POPIA Act 4 of 2013 (SA) — personal information processing basis and rights
 *   - CPA Act 68 of 2008 (SA)  — plain-language disclosure, consumer protections
 *   - Jurisdiction: South Gauteng High Court, Republic of South Africa
 *
 * NOTE: This document is a commercial operational draft. A qualified South African
 * attorney and POPIA/FAIS compliance professional should review before large-scale
 * commercial rollout.
 */

export const TERMS_VERSION   = '1.1'
export const PRIVACY_VERSION = '1.0'

// ── Inline consent text shown in Auth.jsx terms-acceptance screen ─────────────
// Deliberately concise for readability. Full document is linked separately.

export const TERMS_TEXT = `BUMP TERMS & CONDITIONS — v1.1
Effective: 2026

By creating an account or signing in to bump., you agree to the following:

1. PLATFORM PURPOSE
bump. is a personal financial planning, budgeting, analytics, and decision-support platform. It is not a bank, registered financial institution, investment manager, insurer, or brokerage.

2. NOT FINANCIAL ADVICE — FAIS ACT 37 OF 2002
bump. is not a licensed financial services provider (FSP) under the Financial Advisory and Intermediary Services Act 37 of 2002. Nothing on this platform constitutes regulated financial advice, investment advice, tax advice, insurance advice, or any recommendation to purchase or dispose of financial products. All AI-generated insights, budgeting recommendations, projections, forecasts, scenario analyses, and financial observations are informational and educational in nature only. You remain solely responsible for all financial decisions. Consult a licensed financial adviser, tax practitioner, or attorney before acting on any information provided.

3. AI SYSTEMS DISCLAIMER
The platform uses artificial intelligence technology provided by Anthropic (Claude API). AI systems may produce inaccurate, incomplete, or contextually inappropriate outputs. Bump makes no warranty that AI outputs are accurate, that forecasts will occur, or that projections will be achieved. You are responsible for reviewing and validating all outputs before relying on them.

4. FINANCIAL PROJECTIONS
All projections, forecasts, cash flow models, and financial scenarios are hypothetical, illustrative, and estimation-based. They are not guarantees of future performance. Real-world outcomes may differ materially from platform outputs due to inflation, interest rates, employment, taxation, markets, and other variables.

5. DATA PROCESSING — POPIA ACT 4 OF 2013
bump. processes your personal and financial data as a responsible party under the Protection of Personal Information Act 4 of 2013. Your data is used solely to provide the platform services described in the Privacy Policy. It is not sold to third parties. You have the right to access, correct, and request deletion of your personal information. To exercise these rights, contact us at support@bump.money.

6. DATA SECURITY
bump. implements commercially reasonable security measures. No electronic system is completely secure. Data transmission carries inherent risk, which you accept by using the platform.

7. SUBSCRIPTIONS AND FREE TRIALS
Paid plans are billed on a recurring monthly basis via Paystack. A 30-day free trial may be offered; the first charge occurs after the trial period unless you cancel before billing begins. Subscription pricing, plan features, and billing terms may change. Cancellations take effect at the end of the current billing cycle.

8. CONSUMER PROTECTION — CPA ACT 68 OF 2008
To the extent applicable, the Consumer Protection Act 68 of 2008 applies. Nothing in these Terms limits any rights you may have under the CPA that cannot lawfully be excluded or limited.

9. LIMITATION OF LIABILITY
To the maximum extent permitted by South African law, bump. shall not be liable for financial losses, investment losses, indirect or consequential damages, lost profits, data loss, AI inaccuracies, forecasting inaccuracies, or reliance on platform outputs. Use of the platform is at your own risk.

10. GOVERNING LAW AND JURISDICTION
These Terms are governed by the laws of the Republic of South Africa. Any dispute shall be subject to the non-exclusive jurisdiction of the South Gauteng High Court.

11. ACCEPTANCE AND CONSENT RECORDING
By ticking the checkbox and proceeding, you confirm you have read, understood, and agree to these Terms & Conditions (v1.1) and the Privacy Policy (v1.0). Your acceptance is recorded with a timestamp for compliance purposes.`


// ── Tax estimator disclaimer (shown at top of Tax tab) ───────────────────────
// Must be kept current with the tax year being estimated and any SARS rule changes.

export const TAX_DISCLAIMER = `IMPORTANT — ESTIMATE ONLY

This tax estimator is a planning guide, not a formal tax assessment or tax return. All figures are approximate and based solely on the information you provide. Results may differ materially from your actual SARS assessment due to:

- fringe benefits, allowances, or income not captured here
- provisional tax calculations or penalties
- ring-fencing of losses (rental or trade)
- capital gains tax (not included in this tool)
- SARS adjustments or audit outcomes

bump. is not a registered tax practitioner under the Tax Administration Act 28 of 2011. Nothing produced by this tool constitutes tax advice. Tax rates and brackets are sourced from the SARS Budget Tax Guide and are updated annually — always verify figures with SARS or a qualified tax practitioner before filing.

Before submitting your return to SARS eFiling, consult a registered tax practitioner.`

// ── Short privacy summary shown alongside Terms ───────────────────────────────

export const PRIVACY_SUMMARY = `Privacy Policy summary (full policy available at bump.money/privacy):

We collect: email, authentication data, uploaded financial data, transaction information, device/browser information, and usage analytics.

We use this data to: operate the platform, generate budgeting insights and forecasts, improve AI systems, provide support, and detect fraud/abuse.

Your financial data is processed through automated AI systems (Anthropic Claude API) for categorisation and analysis.

Data is stored on secure third-party cloud infrastructure. We retain data for operational, legal, and security purposes. You may request access, correction, or deletion of your data.

For privacy enquiries: support@bump.money
Responsible Party: Bump (bump.money) — South Africa
Framework: POPIA Act 4 of 2013`
