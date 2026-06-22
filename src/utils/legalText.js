/**
 * bump. — src/utils/legalText.js
 *
 * Canonical versioned legal text for in-app consent flows.
 * Auth.jsx imports TERMS_TEXT and PRIVACY_SUMMARY for the acceptance screen.
 * Bump version here, then update Auth.jsx + run the re-accept migration.
 *
 * Legal framework:
 *   - FAIS Act 37 of 2002 (SA) — bump. is NOT a licensed FSP; no regulated advice given
 *   - POPIA Act 4 of 2013 (SA) — personal information processing, Section 72 cross-border transfer
 *   - CPA Act 68 of 2008 (SA)  — plain-language disclosure, consumer protections
 *   - Jurisdiction: South Gauteng High Court, Republic of South Africa
 *
 * NOTE: This document is a commercial operational draft. A qualified South African
 * attorney and POPIA/FAIS compliance professional should review before large-scale
 * commercial rollout.
 */

export const TERMS_VERSION   = '1.2'
export const PRIVACY_VERSION = '1.1'

// ── Inline consent text shown in Auth.jsx terms-acceptance screen ─────────────

export const TERMS_TEXT = `BUMP TERMS & CONDITIONS — v1.2
Effective: 1 July 2026

By creating an account or signing in to bump., you agree to the following:

1. PLATFORM PURPOSE
bump. is a personal financial planning, budgeting, analytics, decision-support, and financial coaching platform. It is not a bank, registered financial institution, investment manager, insurer, or brokerage.

2. NOT FINANCIAL ADVICE — FAIS ACT 37 OF 2002
bump. is not a licensed financial services provider (FSP) under the Financial Advisory and Intermediary Services Act 37 of 2002. Nothing on this platform constitutes regulated financial advice, investment advice, tax advice, insurance advice, or any recommendation to purchase or dispose of financial products. All AI-generated insights, budgeting recommendations, projections, forecasts, scenario analyses, and financial observations are informational and educational in nature only. You remain solely responsible for all financial decisions. Consult a licensed financial adviser, tax practitioner, or attorney before acting on any information provided.

3. AI SYSTEMS DISCLAIMER
The platform uses artificial intelligence technology provided by Anthropic PBC (Claude API), a company incorporated in the United States. AI systems may produce inaccurate, incomplete, or contextually inappropriate outputs. bump. makes no warranty that AI outputs are accurate, that forecasts will occur, or that projections will be achieved. You are responsible for reviewing and validating all outputs before relying on them.

4. FINANCIAL PROJECTIONS
All projections, forecasts, cash flow models, and financial scenarios are hypothetical, illustrative, and estimation-based. They are not guarantees of future performance. Real-world outcomes may differ materially from platform outputs due to inflation, interest rates, employment, taxation, markets, and other variables.

5. DATA PROCESSING — POPIA ACT 4 OF 2013
bump. processes your personal and financial data as a responsible party under the Protection of Personal Information Act 4 of 2013 (POPIA).

Your data is used solely to provide the platform services described in the Privacy Policy. It is not sold to third parties. You have the right to access, correct, object to, and request deletion of your personal information. To exercise these rights, contact us at support@bump.money.

Cross-border data transfers (POPIA Section 72): To provide AI-powered features, your data (including uploaded financial information) is transmitted to Anthropic PBC in the United States for processing. The United States does not have a data protection law deemed adequate under POPIA. By accepting these Terms, you expressly consent to this transfer, acknowledging that bump. has implemented reasonable contractual safeguards to protect your information during such processing.

If you believe your rights under POPIA have been infringed, you may lodge a complaint with the Information Regulator of South Africa at inforeg@justice.gov.za or www.inforegulator.org.za.

6. DATA RETENTION
We retain your personal data for as long as your account is active. Following account closure or deletion, we retain data for up to 5 years for legal, regulatory, and audit compliance purposes, after which it is permanently deleted or anonymised.

7. DATA SECURITY
bump. implements commercially reasonable security measures including encrypted storage, access controls, and secure transmission. No electronic system is completely secure. Data transmission carries inherent risk, which you accept by using the platform.

8. CONSULTATION SERVICES
bump. offers one-on-one financial coaching consultations. These sessions are educational and informational in nature and do not constitute regulated financial advice under the FAIS Act. Consultations are payable in advance via Electronic Fund Transfer (EFT) unless otherwise agreed. Booking confirmation is sent within 24 hours of payment verification. Rescheduling requests must be made at least 24 hours before the scheduled session. Cancellations made with less than 24 hours notice forfeit the session fee.

9. SUBSCRIPTIONS AND FREE TRIALS
Where applicable, paid plans are billed on a recurring monthly basis via Paystack. A 30-day free trial may be offered; the first charge occurs after the trial period unless you cancel before billing begins. Subscription pricing, plan features, and billing terms may change with reasonable notice. Cancellations take effect at the end of the current billing cycle.

10. CONSUMER PROTECTION — CPA ACT 68 OF 2008
To the extent applicable, the Consumer Protection Act 68 of 2008 applies. Nothing in these Terms limits any rights you may have under the CPA that cannot lawfully be excluded or limited.

11. LIMITATION OF LIABILITY
To the maximum extent permitted by South African law, bump. shall not be liable for financial losses, investment losses, indirect or consequential damages, lost profits, data loss, AI inaccuracies, forecasting inaccuracies, or reliance on platform outputs. Use of the platform is at your own risk.

12. GOVERNING LAW AND JURISDICTION
These Terms are governed by the laws of the Republic of South Africa. Any dispute shall be subject to the non-exclusive jurisdiction of the South Gauteng High Court.

13. ACCEPTANCE AND CONSENT RECORDING
By ticking the checkbox and proceeding, you confirm you have read, understood, and agree to these Terms & Conditions (v1.2) and the Privacy Policy (v1.1). You also expressly consent to the cross-border transfer of your data to Anthropic PBC (United States) for AI processing as described in clause 5. Your acceptance is recorded with a timestamp for compliance purposes.`

// ── Short privacy summary shown alongside Terms ───────────────────────────────

export const PRIVACY_SUMMARY = `Privacy Policy summary — v1.1 (full policy: bump.money/privacy):

We collect: email, authentication data, uploaded financial statements, transaction information, device and browser information, and usage analytics.

We use this data to: operate the platform, generate budgeting insights and forecasts, facilitate financial coaching sessions, improve AI systems, provide support, and detect fraud or abuse.

Cross-border processing: Your financial data is processed by Anthropic PBC (United States) to power AI features. You consent to this transfer by accepting these Terms.

Data retention: Active accounts retain data indefinitely. After account deletion, data is held for up to 5 years for legal compliance, then permanently deleted.

Your rights under POPIA: You may access, correct, object to, or delete your personal information at any time by contacting support@bump.money. Complaints may be lodged with the Information Regulator at inforeg@justice.gov.za.

Responsible Party: Bump (bump.money) — South Africa
Framework: POPIA Act 4 of 2013 | FAIS Act 37 of 2002`
