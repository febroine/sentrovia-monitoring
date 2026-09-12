# Design QA — Sentrovia digital observatory authentication

**Source visual truth**

- Owner-selected concept: `design/runs/digital-observatory-auth-20260912/concept-a.png` (1672 × 941 generated pixels).
- Approved working slice: login captures and slice approval bound in the designflow run.
- Final combined comparison: `design/runs/digital-observatory-auth-20260912/captures/qa-auth-rollout.png`.
- Panel order: concept A, final login, onboarding welcome, onboarding administrator.

**Rendered implementation**

- High-resolution review: `login-2k-final.png`, `onboarding-welcome-2k-final.png`, and `onboarding-admin-2k-final.png` at 2560 × 1440.
- Login: `login-wide-final.png` at 1440 × 900 and `login-phone-final.png` at 390 × 844.
- Onboarding welcome: `onboarding-welcome-wide-final.png` and `onboarding-welcome-phone-final.png` at the same viewports.
- Onboarding administrator: `onboarding-admin-wide-final.png` and `onboarding-admin-phone-final.png` at the same viewports.
- CSS viewport equals screenshot pixels in all captures; DPR 1, dark scheme, reduced motion. No density rescaling was required for implementation views. Concept A was normalized with contain-fit for the 2×2 comparison.
- State: signed-out login; isolated first-run onboarding readiness. The current real workspace remains initialized and was not modified.

**Full-view comparison evidence**

- The final login preserves the selected centered form, observatory basin, calm sky and single teal action. The generated placeholder logo and online-status claim were intentionally replaced by the repository wordmark and truthful self-hosted context.
- The owner-requested `SECURE ACCESS` eyebrow and line are absent in the final login.
- Onboarding welcome uses the same composition and material while replacing the former long marketing page with one actual setup objective and one action.
- Administrator setup retains the same background, wordmark, control geometry and teal action. The wider scrim is deliberately stronger around six fields but leaves the observatory crop visible on phone.

**Focused form evidence**

- Typography: existing IBM Plex Sans is used throughout. Heading roles remain bounded (32–56.8px by view); labels are approximately 12.8–13.1px with visible association.
- Spacing/layout: login remains capped at 29rem; administrator is capped at 46rem. Controls use a consistent 48–54px height, 9px radius and 12–20px relational gaps.
- Colors/tokens: #020611 canvas, #2dd4bf single primary action, muted blue-white supporting copy and restrained blue-gray control borders remain consistent.
- Image quality: `public/sentrovia-digital-observatory-hd.webp` is a local 3840 × 2160 near-lossless WebP generated for this project. The original 1672 × 941 pixel-art plate was replaced in the live shell after its large-screen softness was reported. Fine stars, architecture, mountain contours, trees and reflections now survive a 2560px viewport without blocky source scaling. Text and controls remain live HTML; the UI is not flattened into the image.
- Copy/content: all text describes actual login or first-administrator setup. No remember-me, forgot-password, fake telemetry, testimonials or marketing metric was added.

**Responsive, accessibility and interaction evidence**

- All default wide and 390px views reported `scrollWidth === clientWidth` and `scrollHeight === clientHeight`; no page scroll or horizontal overflow.
- All three 2560 × 1440 quality-review states also reported equal client/scroll dimensions and no console errors.
- At widths below 360px, the administrator grid becomes one column and may use natural vertical scrolling to preserve usable control widths.
- Entering administrator setup focuses the first-name field. A stubbed username validation failure moves focus to username and renders a field-linked error. Password visibility exposes and updates `aria-pressed` and its accessible label.
- Default capture runs had no browser console errors. The validation test produced only the intentionally stubbed HTTP 400 resource response.

**Findings**

- No actionable P0, P1 or P2 difference remains.
- P3: the administrator screen intentionally shows less landscape detail on desktop because its larger task surface needs stronger contrast; the mobile crop retains more of the observatory signature.
- Independent review initially found the public `Product` link still targeting the removed onboarding marketing section and noted incomplete password guidance. Both were corrected before final acceptance; `/about#product` is now a real target and the visible rule matches the server schema.

**Comparison history**

- Pass 1: onboarding administrator scrim hid too much of the visual signature (P2). Reduced broad-scrim opacity and shortened the phone password placeholder.
- Pass 2: desktop and phone renders preserved the shared auth language, controls remained readable, and no P0/P1/P2 issue remained.
- Quality repair: replaced the 1672 × 941 / 77.5KB compressed pixel-art background with a smooth 3840 × 2160 source, raised the Next.js requested image quality from 88 to 94, rebuilt Docker, and inspected login plus both onboarding states at 2560 × 1440.

**Implementation checklist**

- Typecheck, focused auth lint and Docker production build passed.
- Login and both onboarding steps were inspected at desktop and phone sizes.
- Independent scoped review completed; the reported navigation and password-guidance issues were repaired and reverified.

final result: passed
