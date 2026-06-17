# Mage — Go-To-Market v1

**Owner:** Agent 8 (Launch PM)
**Purpose:** ICP definition, pricing hypothesis, pitch outline, and competitive framing for the first pilot hotels.

---

## Ideal Customer Profile (ICP)

### Primary ICP: Independent boutique hotels

| Attribute | Detail |
|-----------|--------|
| Size | 20–150 rooms |
| Star rating | 3–5 star |
| Ownership | Independent (not branded chain) |
| IT maturity | Low — no dedicated IT staff, uses a basic PMS (e.g. Cloudbeds, Mews, Opera) |
| Guest profile | Leisure travelers and business travelers who expect a responsive, personalized experience |
| Pain point | Front desk fielding 150–300 routine guest questions per week by phone or text |
| Budget signal | Spends on guest experience (premium amenities, spa, F&B) but not on enterprise software |
| Decision maker | Owner or General Manager — sole decision, no procurement committee |
| Sales cycle | Days to weeks (not months) |

**Why they buy Mage:** Front desk is the bottleneck. Guests can't reach anyone after 10pm. Hiring more staff costs $30K+/year. Mage deflects routine calls and surfaces tasks to the right staff member — without adding headcount or changing anyone's workflow.

---

### Secondary ICP: Full-service hotel groups (one pilot property)

| Attribute | Detail |
|-----------|--------|
| Size | 150–500 rooms |
| Structure | Multi-property group, 2–10 hotels |
| Decision maker | Director of Operations or VP Guest Experience |
| Buying motion | Pilot one property → prove ROI → roll out to group |
| Pain point | Inconsistent guest experience across properties; high staff turnover disrupts service |
| Budget signal | Has allocated budget for guest technology; evaluating 2–3 vendors |

**Why they buy Mage (for a pilot):** Low implementation risk (one-day setup, no system replacement), property-specific knowledge base, RBAC keeps ops clean for a larger team.

---

### Anti-ICP (do not pursue in v1)

| Segment | Why not |
|---------|---------|
| Branded chains (Marriott, Hilton, IHG) | 6–18 month procurement; IT security review; PMS integration must be certified |
| Budget chains / motels | Guest experience not a differentiator; price sensitivity too high |
| Hostels | Low RevPAR; transient guests; community chat > AI assistant |
| Vacation rentals | No staff workforce; different use case entirely |
| Resorts (500+ rooms) | Enterprise complexity; needs full HIMS integration; out of v1 scope |

---

## Problem Narrative

**The front desk is not available 24/7 — but guests are.**

Independent hotels with 20–150 rooms typically staff the front desk 7am–11pm. After hours, calls go unanswered. During peak check-in and check-out windows, the desk is overwhelmed. The result: guests who paid $300/night can't get a quick answer about parking, pool hours, or checkout time.

The workaround is WhatsApp or SMS — but that creates an unstructured inbox the front desk has to monitor on top of everything else.

Meanwhile, hotel staff — especially maintenance, housekeeping, and room service — spend time tracking down which room needs what. There's no structured task queue, no standard operating procedures at their fingertips, and no way to get instant help when they hit an edge case.

**What hotels don't need:** Another enterprise CRM with a 6-month implementation.

**What they need:** A lightweight AI layer that handles routine guest questions, structures guest requests as staff tasks, and gives every team member the tools for their role — set up in a day.

---

## Value Proposition

### For the hotel (owner / GM)
- **Deflect 50–70% of routine front-desk calls** (checkout time, parking, breakfast hours, pool rules, Wi-Fi password) without adding headcount
- **Zero guest friction** — no app download, mobile-first web, magic-link access at check-in
- **One-day setup** — publish hotel knowledge from your existing website; staff onboard in hours
- **PMS-compatible** — magic link sends via your existing check-in flow; no PMS replacement required

### For staff
- **Role-filtered task queue** — maintenance sees maintenance tasks, not room service; no noise
- **AI ops copilot** — from any assigned task, one tap gets step-by-step guidance based on your hotel's SOPs
- **No training required** — familiar task-management UI; existing workflows unchanged

### For guests
- **Always-on AI concierge** — answers routine questions at 2am
- **Service requests tracked** — not lost in a text thread
- **Chat history preserved** — return visits pick up where they left off

---

## Competitive Framing

### vs. Phone / front-desk calls

| Dimension | Status quo | Mage |
|-----------|------------|------|
| Availability | 7am–11pm | 24/7 |
| Routine question handling | Staff time | AI |
| Request tracking | Staff memory / sticky notes | Structured kanban |
| Cost | ~$1,500/mo per evening shift | $299/mo |

**Pitch line:** "Your front desk gets 200 routine calls a month. What if 120 of them answered themselves?"

---

### vs. Generic chatbots (Intercom, Drift, Tidio)

| Dimension | Generic chatbot | Mage |
|-----------|----------------|------|
| Knowledge | Generic FAQ or manual scripting | Crawled from your hotel's website + staff-curated |
| Staff workflow | Separate ticketing system | Integrated kanban in the same product |
| Guest auth | None / email form | Magic-link guest identity with booking validation |
| Hospitality-specific | No | Yes — ActionTypes, PMS hooks, role-based ops |

**Pitch line:** "Hotel-tuned AI trained on your property's own knowledge — not a generic FAQ bot."

---

### vs. Full hospitality CRMs (Revinate, Medallia, Quore)

| Dimension | Enterprise CRM | Mage |
|-----------|---------------|------|
| Implementation time | 3–6 months | 1 day |
| Price | $500–$2,000+/mo | $299/mo |
| Change management | Requires staff training program | Role-filtered UI — no retraining |
| Feature scope | Guest surveys, reputation mgmt, PMS deep integration | Focused: guest chat + staff ops + knowledge |

**Pitch line:** "10x faster to onboard, a fraction of the cost. No 6-month implementation."

---

### vs. WhatsApp / SMS messaging services

| Dimension | WhatsApp/SMS | Mage |
|-----------|-------------|------|
| Incoming requests | Unstructured inbox | Structured task queue |
| AI response | Human only | AI handles routine; escalates to human |
| Staff load | Adds to front-desk queue | Reduces front-desk load |
| Guest history | Per-conversation | Persistent across stay |

**Pitch line:** "Structured AI handling — not another inbox your front desk has to monitor."

---

## Pricing Hypothesis

> To be validated with the first 3 pilot hotels. Adjust based on willingness-to-pay signals.

| Tier | Price | Who it's for | Limits |
|------|-------|-------------|--------|
| **Pilot** | Free (90 days) | First 3 properties — design partners | Unlimited |
| **Standard** | $299/mo | Independent hotels up to 100 rooms | Unlimited guests + staff, 1 property |
| **Growth** | $499/mo | 100–300 rooms or higher volume | Unlimited + priority support + analytics |
| **Multi-property** | Custom | Groups with 3+ properties | Per-property pricing, volume discount |

### Pricing rationale

- One evening front-desk shift ≈ $1,200–$1,800/month (loaded cost). Mage replaces the routine-questions portion of that shift.
- $299 = ~20% of the cost of one shift → straightforward ROI story even if Mage only deflects 1 in 3 routine calls.
- 90-day free pilot removes risk for the GM. By day 60, the ROI is visible in reduced call volume.
- Growth tier captures hotels where a heavier task volume (spa, F&B, larger teams) drives more value.

### What's NOT in v1 pricing scope
- Per-seat pricing (too complex for small hotels to evaluate quickly)
- Usage-based pricing (LLM costs are low enough that flat-rate is simpler to sell)
- Revenue-share or commission (misaligned — hotel wants predictable cost)

---

## Pitch One-Pager Outline

> For the GM or owner of a boutique hotel. Should fit on one printed page or one Notion doc.

---

**[HEADER]**
**Mage** — The AI concierge and staff ops tool built for independent hotels

---

**[HOOK]**
Your front desk fields 200+ routine questions a month:
- "What's the Wi-Fi password?"
- "What time is checkout?"
- "Can I get extra towels?"
- "Where's the nearest pharmacy?"

**What if those answered themselves — at 2am, on a Sunday, without adding staff?**

---

**[HOW IT WORKS]**

1. **Guest scans QR** at check-in → types their question → AI answers using your hotel's real information
2. **Service requests** (maintenance, housekeeping, room service) → go to the right staff member's task queue automatically
3. **Staff tap "Get help"** on any task → AI gives step-by-step guidance based on your SOPs

---

**[SETUP]**
- **1 day** to go live — no new hardware, no PMS replacement
- Works on any phone — no app download for guests
- Staff sign in with a personal key — no shared passwords

---

**[PRICING]**
Free for 90 days. Then $299/month.
One evening front-desk shift costs $1,500/month. You do the math.

---

**[CTA]**
Book a 20-minute demo → [calendly link]

---

## Sales Motion for v1

**Outbound channels (founder-led):**
1. LinkedIn DMs to GMs / owners of boutique hotels (3–5 star, 20–150 rooms)
2. Hospitality conferences: HITEC, Independent Lodging Congress, regional hotel associations
3. Referrals from hotel tech consultants (PMS consultants often know 10–20 properties)

**Qualification call (20 min):**
- "How does your front desk handle guest questions after 10pm?"
- "Do you use WhatsApp or texting to communicate with guests?"
- "How many staff do you have on a typical shift?"

**Demo flow (30 min):**
1. Guest experience: scan QR → register → ask a question → see AI respond
2. Staff experience: sign in → see task queue → use task assist on a sample maintenance request
3. Admin: show knowledge publishing from their website

**Pilot close:**
- Free 90 days, no contract
- Onboarding call: 60 minutes with the GM
- "We'll get you live the same day"

---

## 90-Day Pilot Goals

By end of the 90-day pilot with the first hotel:

| Metric | Target |
|--------|--------|
| Guest registrations | ≥ 25 real guests using Mage |
| AI deflection rate | ≥ 40% of guest questions answered by AI without escalation |
| Staff active | ≥ 80% of eligible staff signed in and using the workspace |
| Task assist usage | ≥ 10 "Get help" sessions per week |
| GM NPS | ≥ 8 / 10 |
| Conversion to paid | GM signs $299/mo contract after trial |

These numbers feed the case study used to close the next 5 hotels.
