Demo and presentation
Six minutes, live in front of the judges, including the background. Aim for about 1.5 minutes of context and 4 minutes of product, with 30 seconds spare. The judges score the working product, not the slides, so most of the time is spent in the app, clicking through one story.
What the judges score, and where the demo shows it
Criterion
	Show this

	Problem and solution fit
	Real file formats (ShopeePay settlement, BCA statement, POS export), 10 outlets, a week of data, a payout that never arrived
	Build quality
	Day 8 uploaded live and matched in about a minute; every number links to its rows; validated against the answer key (100% on the clean set, every planted case found)
	Insight and originality
	Money differences labelled (rounding and fees expected, missing payout to check); match rate from both sides; tick & tie; learning from every decision
	Real-world value
	One click from "98.3% matched" to "Harbor Square's payout of 24 Oct is missing, Rp 9.03 million" with a follow-up assigned
	Build direction
	Deep Domain AI (how a reconciliation expert works) and Adaptive (decisions per close drop from 7 to 2)
	Use of Codex
	One slide: tasks done through Codex per person, reviewed and merged (keep the evidence while building)
	Before you go on stage
* Sign in on the demo laptop beforehand (shopeeavengers / shopeeavengers) and open the tabs below in order.
* Client Zestly Demo has days 1–7 loaded and matched; day 8 is not uploaded yet. Have the folder day-08-20261027-new-format (3 files) open in the file manager, ready to drag.
* Rehearse on Zestly Demo – Latihan (same data). After a rehearsal it has day 8 in it; ask Taufiq or Claude to reload it, or rehearse the day-8 part only once.
* Browser zoom 110–125%, or the tutorial's "Large text for presenting". Close other tabs and notifications. Phone hotspot ready.
* Ask Kira the demo questions once during the last rehearsal so you know the answers; keep a screenshot of each answer in case the model is slow.
* Record a full run as a video backup.
Bookmarks (the address keeps the view):
#
	Opens
	Link

	1
	Overview of Zestly Demo
	https://kira.madgun.us/#/overview?c=zestly-demo
	2
	Workflow, step 1 (for day 8)
	https://kira.madgun.us/#/workflow?c=zestly-demo&step=1
	3
	Match rate table, only rows under 100%
	https://kira.madgun.us/#/analysis?c=zestly-demo&tab=rate&view=table&period=day&by=outlet&below=1
	4
	Linked tables, Harbor Square, 24 Oct, Settlement ↔ Bank
	https://kira.madgun.us/#/analysis?c=zestly-demo&tab=map&view=linked&stage=l2&from=2026-10-24&to=2026-10-24&outlet=Zestly+Harbor+Square+Surabaya
	5
	Follow-up list
	https://kira.madgun.us/#/analysis?c=zestly-demo&tab=followup
	The script (6:00)
Time
	Screen
	Do
	Say (adapt to your own words)

	0:00–1:30
	slides or Overview (1)
	—
	Zestly has 10 outlets and about 1,250 ShopeePay sales a day. Each sale shows up three times: in the POS, in ShopeePay's settlement, and in the bank a day later as one transfer per store, minus fees, rounded to the thousand. Finance matches this by hand in Excel, hours a day, and a missing payout is found at month end. KIRA does the matching, explains every rupiah that doesn't agree, and learns from every decision.
	1:30–1:45
	Overview (1)
	point at the ring and the learning panel
	This is last week: 8,784 sales, 98.3% traced all the way to the bank. The first close needed 7 decisions from us.
	1:45–2:45
	Workflow step 1 (2)
	drag the three day-8 files in; Convert; the POS rule card says a new column order_channel → Update; step 3 shows one new spelling "Zestly - Central Plz" → Accept, Save; step 4: Test, Generate both stages
	Today's files arrive. The POS export has a new column and ShopeePay spells one store differently. KIRA recognises everything it has seen before and asks only about what's new: two questions. (Convert takes about 30 seconds: talk while it runs.)
	2:45–3:00
	Overview (1)
	point at the learning bars
	Seven decisions on the first close, two today. Every decision became a rule.
	3:00–3:30
	Match rate table (3)
	"Only rows under 100%" is on; point at Harbor Square, 24 Oct, 0%
	Match rate per outlet per day, from both sides of each stage. One row is red: Harbor Square on 24 October.
	3:30–4:00
	Linked tables (4)
	the settlements are there, the bank side is empty; point at tick & tie and at "Where the money differences come from" (open the rate tab if needed)
	Its 142 sales are settled by ShopeePay, but the payout never reached the bank: Rp 9.03 million. KIRA labels every difference: the rounding and the Rp 5,000 withdrawal fee are expected; this one needs a look.
	4:00–4:30
	chat panel
	ask: "kenapa Harbor Square tanggal 24 Oktober 0%?"
	Kira checks the data, explains, and highlights the records. It never changes anything without our approval.
	4:30–4:50
	Follow-up (5)
	in the chat ask "isi follow-up notes buat Harbor Square 24 Oktober, assign ke Andrew": Kira drafts one note for the 142 records (payout of 24 Oct not in the bank, Rp 9.031.421, 3 days, ask ShopeePay) and asks to save it; Approve, then show Follow-up → Investigating (about 15 s with the model: talk over it). Without the chat: with Harbor Square 24 Oct selected, Draft notes for this list, then Save 142 notes
	Kira drafts the follow-up from the evidence: what's missing, how much, since when, who to ask. We check it and save; nothing is saved without us. It stays on the record when we run again.
	4:50–5:10
	anywhere
	ask Kira something off-topic ("menu McD apa?"), then click Tutorial → Start for two steps → Esc
	It stays on reconciliation. And a new team member learns the app from Kira itself, asking questions as it goes.
	5:10–5:40
	slide
	—
	Impact: a week of 8,784 sales reconciled in about a minute, Rp 10.7 million flagged with its evidence, decisions down from 7 to 2. Built by four of us with Codex: N tasks.
	5:40–6:00
	—
	—
	spare
	Plan B for each risky step:
* Convert is slow or the upload fails: skip to the Overview of Zestly Demo – Latihan, which you prepared with day 8 already done, and show the learning bars there.
* Kira is slow (over 15 s): keep talking over the linked tables, then show the answer; if it fails, show the screenshot.
* The site is down: play the video.
Questions Kira should get (tested on the demo data)
Ask
	Expect

	kenapa Harbor Square tanggal 24 Oktober 0%?
	payout for that store-day not in the bank statement; settlements and the withdrawal exist; suggest checking the next bank statement or asking ShopeePay; highlights the records
	selisih uang dari mana aja?
	rounding and the withdrawal fee (expected), Rp 9.03 million not in bank yet, a Rp 1.25 million credit with no settlement, 3 sales with no settlement, 2 settlements with no sale, 2 amounts keyed wrong
	outlet mana yang paling bermasalah minggu ini?
	Harbor Square: 82.1% for the week (653 of 795 sales traced), all of it the missing 24 Oct payout (Rp 9.03 million); the other outlets 99.7–100%
	apa yang udah kamu pelajari?
	3 file formats, 10 outlet spellings, kinds of bank rows, 2 matching rules; decisions per close falling
	menu mcdonald apa?
	declines in one line and offers to check the data
	Likely questions from the judges
Question
	Answer

	How do you know the matches are right?
	The matching itself is rules, not guesses: an exact shared ID for POS ↔ settlement and the provider's withdrawal for settlement ↔ bank. On the demo data we checked every sale against the answer key: all 8,784 on the clean set, and every planted case found on the other. Each link can be opened to its rows.
	What does the AI actually decide?
	Nothing by itself. It suggests (column mappings, names, rules, explanations) and answers; every change waits for a person's approval and is logged.
	What if the provider changes its file?
	The upload rule notices the new or missing column and asks once; AI maps renamed columns by meaning and says why.
	Does it get better over time?
	Yes: every decision is saved as a rule (formats, names, bank row kinds, matching rules, links made by hand), and the learning panel shows decisions per close falling.
	What about scale?
	A week of 8,784 sales converts and matches in about a minute on a small server. Beyond tens of thousands of rows a day we would store the analysis per run in the database instead of memory.
	Is the data safe?
	Each client has its own database, sign-in is required, the model only sees what the tools return, secrets are never shown, and the guardrails keep Kira on reconciliation and ignore instructions hidden in files.
	How is this different from existing reconciliation tools?
	They show whether rows matched. KIRA explains why they didn't and what to do, puts a label on every rupiah that doesn't agree, learns from every decision, and has an assistant that can do the work with approval.
	Why DeepSeek?
	Cheap and good at tool use; any model works through LiteLLM.
	Use of Codex (keep the evidence while building)
* Note each Codex task (person, feature, merged or not). At the end: a count per person and two or three example prompts with their diffs.
* Mention it honestly: what Codex wrote, what the team reviewed and changed. If tools other than Codex were used before the event (for example for this documentation), say so if asked.
