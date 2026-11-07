# Engine rules: convert, clean, match

Document 03 names these functions but most have no description. This document writes out what they do, in words, so the rebuild gives the same numbers as the Data guide. It describes behaviour, not code. Where a value matters (a threshold, a list, a column name), it is given exactly.

Tables are lists of rows; a row is a dictionary from column name to value. Results refer to rows by their position in the cleaned table.

## 1 · Data standard (standard.py)

**Areas:** pos (POS), settlement (Settlement), bank (Mutation).

**Standard columns per area** (always proposed as kept):

- pos: id, sales_number, bill_number, branch, split_payment_method, payment_method_ori, payment_method, sales_datetime_out, sales_date, payment_amount, mdr, nett_after_mdr, created_at
- settlement: id, payment_method, merchant_id, merchant_name, branch, transaction_type, approval_code, reference, transaction_date, settled_date, gross_amount, promo_amount, commission, refund_amount, mdr_amount, mdr_percentage, nett_amount, created_at
- bank: id, keterangan, cabang, account, tanggal_transaksi_string, version, tanggal_transaksi, debit, kredit, saldo, created_at

**Required columns** (each table checked on its own):

- pos: branch, payment_amount, sales_datetime_out
- settlement: branch, gross_amount, transaction_date, reference, nett_amount
- bank: keterangan, kredit

**COLUMN_ALIASES** (a raw header in a list fills the standard column on the left, when the file doesn't already have it):

| Standard column | Raw headers that fill it |
| --- | --- |
| branch | outlet, outlet_name, store, store_name, merchant_store_name, cabang, location, branch_name |
| payment_method | method, payment_type, channel, metode_pembayaran |
| payment_amount | amount, total, total_amount, grand_total, nominal, jumlah, paid_amount |
| sales_datetime_out | sales_date_out, sales_datetime, transaction_time, paid_at, datetime, waktu, tanggal_jam, closed_at |
| sales_number | sales_no, order_no, order_number, receipt_no, no_struk |
| merchant_id | mid, merchant_code, merchant_no |
| reference | ref, ref_no, reference_no, ref_id, rrn, transaction_id, trx_id |
| transaction_date | transaction_time, trx_date, trx_time, transaction_datetime, tanggal_transaksi, create_time, date |
| settled_date | settlement_date, payout_date, tanggal_settlement |
| gross_amount | gross, transaction_amount, amount, nominal |
| nett_amount | net, net_amount, nett, settlement_amount, amount_settled, net_settlement |
| keterangan | description, remark, remarks, desc, narration, uraian, keterangan_transaksi |
| kredit | credit, cr, credit_amount, mutasi_kredit |
| debit | db, debit_amount, mutasi_debit |
| tanggal_transaksi | transaction_date, tanggal, date, posting_date, value_date |

An alias only applies to standard columns of the same area (for example "amount" fills payment_amount in POS but gross_amount in settlement). On the Zestly files this gives: POS sales_datetime_out ← sales_date_out; settlement branch ← merchant_store_name, reference ← transaction_id, transaction_date ← create_time, gross_amount ← transaction_amount, nett_amount ← settlement_amount. The bank file already uses the standard names.

**STANDARD lists:** outlets {Menteng: [menteng], Senopati: [senopati]} (only used when POS has no outlet names); providers {DANA: [dana, qris], GOPAY: [gopay]}; which columns are checked: pos.branch → outlets, pos.payment_method_ori → providers, settlement.branch → outlets; payout words: dana, gopay, grab, ovo, shopeepay, airpay.

**COLUMN_INFO** (sent to the AI so it maps by meaning) is listed in document 03 under standard.py.

## 2 · Convert (core/parsing.py)

**Reading a file**

- Delimiter: whichever of , ; tab | appears most often in the first non-empty line (comma if none).
- A UTF-8 byte-order mark is dropped. Rows with only empty cells are dropped.
- Header names are normalised: trimmed, lower case, every run of characters other than a–z and 0–9 becomes "_", leading and trailing "_" removed ("Merchant Store Name" → merchant_store_name).
- Excel: every sheet with at least 2 filled columns becomes its own file. The header row is the first row with at least 60% of the widest row filled (title rows above it are skipped). Dates become ISO text.
- PDF: tables from text PDFs; a table continuing over pages is joined and a repeated header dropped; image-only PDFs are refused.

**Numbers** (Indonesian and international)

- "Rp" and spaces are removed. The rest must be digits, dots and commas only.
- Both . and , present: the one that comes last is the decimal mark ("2.000.000,50" → 2000000.5; "2,000,000.50" → 2000000.5).
- Only dots in groups of three ("1.250.000") → thousands separators. Only commas in groups of three ("1,250,000") → thousands separators.
- Otherwise a comma is a decimal mark ("12,5" → 12.5).
- Whole results are integers.

**Dates and times**

- ISO "2026-10-20", "2026-10-20 13:05", "2026-10-20T13:05:07+07:00": a time without a zone is WIB (+07:00).
- Day first: "20/10/26", "20-10-2026", optionally with "13.05" or "13:05:07". Two-digit years are 20xx.
- Output: "YYYY-MM-DD" for a date, "YYYY-MM-DDTHH:MM:SS+07:00" for a date and time.

**Column types** from up to 200 non-empty values: all true/false/yes/no/ya/tidak → yes/no; all numbers → number; all dates → date, or date & time if any has a time; otherwise text. A column whose name looks like an ID (id, *_id, anything with code, account, number, reference, ref*, no, *_no) is always text.

**Combining files of one area.** All files of an area become one table. Per file, before combining: each raw header is checked against the saved rule's header mapping first, then COLUMN_ALIASES; when it fills a standard column the file doesn't have, a new column with that name is added next to it with the same values (the raw column stays). Different providers can fill the same standard column from different headers.

**Which columns are proposed as kept:** the standard columns, the columns that fill one, and ID columns. An ID column has an ID-like name and either says so (id, *_id, code, account, reference, ref*) or has at least 50% distinct values (a trace number is unique; a table number repeats). If nothing would be kept (an unknown format), everything is kept.

**Upload rule** per area: delimiter, columns [{name, type, keep}], header mapping {raw column: standard column, or "" for don't fill}, version. Applying it: keep only kept columns, cast each value to its type (empty → null), drop exact duplicate rows, count them.

**What needs a decision.** No saved rule → "create". A saved rule and any of these → "update or keep": a new column (not one that only fills a standard column), a kept column missing, a kept column whose type changed (unless it now reads as text), another delimiter, or a header mapping that differs from the saved one. Nothing changed → no question, the saved rule is applied. On Zestly day 8 the POS file has a new column order_channel → one "update" question.

**Wrong area hint.** A file's header is compared with each area's standard columns; the area with the largest share (at least 40%) is the guess. If it isn't the area the file was dropped in, suggest moving it.

**AI at this step** (only when a key is set and KIRA_AI isn't off; the workflow never depends on it): required columns still missing after aliases go to map_columns; extra columns go to judge_columns (keep or drop, with a reason). An AI answer is used only if it names a header that exists.

## 3 · Clean (core/cleaning.py)

**Outlet names come from POS.** The standard outlet names are the distinct POS branch values; spellings that differ only in case, spaces or punctuation count as one, and the most used spelling wins. Without POS outlet names, the outlets list in STANDARD is used.

**Matching an outlet name** (for example a settlement's "Zestly - Central Plz"): first an exact match after removing everything but letters and digits; otherwise take the words of the name, remove the words every POS outlet shares (here "zestly"), and count the words left that each POS outlet also has (after removing the shared words). The outlet with the most common words wins if it has at least one and no other outlet ties. Otherwise no name is proposed (the AI is asked, or the person picks).

**Provider names:** a value maps to a provider when it equals the name or contains one of its words, and exactly one provider fits.

**Recommendations:** one card per checked column that has values not covered by the saved cleaning rules, listing each value, what it becomes and how many rows have it (values that already equal their standard name are left out). Earlier answers on the same card are kept.

**Bank rows that aren't payouts:** a payout is a credit (kredit > 0) whose description contains a payout word. Every other row is grouped by its description with the digits replaced by "#", lower case, spaces collapsed. One card lists each group not decided before, proposed "leave out", with a note: "No known provider name in the description" (credits), "Money going out (debit)" or "No amount: a balance or information line". The person can switch any group to "keep".

**Saving** creates cleaning rules version N+1: maps {"settlement.branch": {raw: standard}} and exclude {"bank": {pattern: true/false}}. An accepted value maps to its standard name; a rejected value, or one left blank, maps to itself so it isn't asked again. Every card needs a decision before saving.

**Applying** (Layer 2): bank rows of an excluded pattern are dropped (counted); mapped values are replaced and the old value kept per cell ("was"), for the "Show before cleaning" view.

## 4 · Match (core/matching.py)

Rules of a stage run in order. A row matched by an earlier rule isn't checked again. Running stage l1 clears l2; any change to the cleaned tables clears both.

**Order and edit.** The order is each rule's position, which a person can change (↑ ↓; POST /matching/{stage}/order with every rule of the stage). Editing a saved rule replaces its kind, params and name, checked like a new rule (PATCH /matching/rules/{id}). If the stage's current results used the rule, or the rules they used now run in another order, those results are cleared (stage l1 also clears l2): the stage is tested and run again. The preview of an edit compares with the other rules (exclude).

**Which settlement rows are sales.** The row's kind is transaction_type (or row_type). A kind containing opening, closing, balance or withdraw is not a sale and is never counted as unmatched. A kind containing withdraw is a withdrawal.

### Stage l1 · POS ↔ settlement (rules PS1, PS2…)

- **ID rule** {posCol, stlCol}: index settlement rows by the stlCol value (as text). For each POS sale in order, take the first unused settlement row with the same value. One settlement row pairs with at most one sale. Zestly: trace_number = external_reference_id.
- **Composite rule** {outlet, method, amountTol, window}: process unpaired POS sales in source order. Only unused settlement sales satisfying every condition are eligible: amount difference within amountTol, equal normalized outlet names when outlet is on, present and equal payment methods when method is on, and the same calendar date or an absolute time difference within window minutes. Custom amount/date columns and required/optional reference conditions still apply; conflicting known references never qualify. Choose the closest settlement time, breaking ties by settlement source order.
- **Multiple eligible candidates (approved 7 November):** POS-to-settlement rules still pair rows when several candidates qualify. ID rules choose the first unused settlement in source order; composite rules use the ordering above. Every POS and settlement row is used at most once, including across later rules. A chosen pair counts as linked even though its real-world identity may be uncertain. Excess rows remain unmatched; amount differences remain visible in the final result. This policy applies to stage l1; bank ambiguity handling is unchanged.
- Totals: pairs, hits per rule, POS total, matched, unmatched POS, unmatched settlement sales.

### Stage l2 · settlement ↔ bank (rules SM1…)

Only bank rows with kredit > 0 are candidates. Each credit is used once.

- **Withdrawal rule** {groupBy (entity_id), requireId, amountTol, maxDays (3)}: group the unlinked settlement sales by (groupBy value, date of transaction_date). For each withdrawal row: amount = its nett_amount (or gross_amount if nett is empty), absolute value; find the first unused credit with |kredit − amount| ≤ amountTol, 0 ≤ (bank date − withdrawal date) ≤ maxDays days, and, if requireId, the last 5 characters of the groupBy value in the bank description (lower case). Link that credit to every sale of the same group and date. The withdrawal row itself is remembered as the link's "via".
- **Reference rule** {amountTol}: for each unlinked sale with a reference, the first unused credit whose description contains the reference (lower case) and whose kredit is within amountTol of nett_amount.
- **Batch rule** {groupBy (merchant_id), requireId, amountTol}: group unlinked sales by groupBy and settled_date; a credit within amountTol of the group's total nett, mentioning the group value if requireId, pays the whole group.
- **Amount rule** {amountTol}: credits within amountTol of the sale's nett that don't mention any settlement reference. Exactly one → linked and marked "needs review"; more than one → the sale is "ambiguous".

### Suggestions (nothing is saved without the person)

Stage l1:

1. If no ID rule is saved: for every pair of text columns that look like IDs (not branch, payment_method, payment_method_ori, sales_date, settled_date; at least 90% distinct values; not all values 3 characters or shorter), count POS values found in the settlement column. The best pair linking at least 30% of POS sales is suggested first: "N of M POS sales have their X in a settlement's Y. An exact ID is the most reliable link."
2. If at least 90% of settlement times are midnight (dates without times): suggest same outlet + amount on the same date (method off).
3. Otherwise, for unpaired sales find the nearest same-outlet, same-amount settlement within a day; the window is the smallest of 1, 5, 15, 60 minutes that covers 90% of them; method is on if 90% of those pairs share the payment method.
4. With rules already saved: a wider window for what's left, and a rule with Rp 1.000 tolerance if amounts differ slightly. Never suggest a rule identical to a saved one.

Stage l2: if there are withdrawal rows, find the first of entity_id, merchant_id, partner_merchant_id, branch that every withdrawal has and that takes more than one value; suggest a withdrawal rule by it (first with requireId, else without) if it links anything: "The provider pays out by withdrawal: N withdrawal rows, each paying one entity_id's sales of a day…". Then reference, batch and amount rules, each only if it adds links (amount only when nothing else was suggested).

### Final result

Every row ends up in a group under the bank credit that paid it:

| Row | Status | Reason |
| --- | --- | --- |
| Sale linked in l1 and its settlement linked in l2 | Matched | (none) |
| Linked by the amount rule, or ambiguous | Needs review | "Matched by amount only" / "Several possible credits" |
| Settlement sale with no POS sale | Mismatched | No POS sale |
| Settlement linked to a POS sale but no credit | Mismatched | Not in bank yet |
| POS sale with no settlement | Mismatched | No settlement |
| Credit no settlement points to | Mismatched | Credit with no settlement |

Groups, in order: each l2 link (credit + its settlements), then "No bank credit yet" (unlinked settlement sales), then "POS without settlement", then one group per unused credit. Totals: rows, matched, mismatched, review, pos, **full** (Matched rows with a POS sale), l1, settlement sales, l2, credits, credits linked, cash (sum of linked credits), many-to-one links.

**Match rate = full ÷ POS sales.** Rows with no POS sale count as "open", not in the rate.

**Export CSV:** status, reason, pos_settlement_rule, settlement_mutation_rule, then every bank column as mutation.<col>, every settlement column as settlement.<col>, every POS column as pos.<col>; all values quoted.

## 5 · Money gaps (core/analysis.py · gaps)

- **Per bank credit linked to settlements:** d = sum of the settlements' nett − kredit. Ignore |d| < 0.5. Fees = fee_withdrawal + fee_handling of those settlements plus those of the store's withdrawal row that day (or that row's gross − nett when the fee columns weren't kept). If fees > 0 and ||d| − fees| < 1,000 → **fee** (expected). Else if kredit is a round thousand and |d| < 1,000 → **rounding** (expected). Else → **payout_diff** (to check).
- **Per record:** settlement with no credit → **not_in_bank** (nett, with "n days before the latest bank date"); credit with nothing → **credit_no_settlement**; POS sale with no settlement → **pos_no_settlement**; settlement with no POS sale → **stl_no_pos** (gross); sale and settlement both present with |gross − payment_amount| ≥ 0.5 → **promo** (expected) if it equals the promo_amount within 1, else **sale_diff**.
- Each kind: count, rupiah affected (absolute), signed net, up to 5 samples. Totals: expected and to check.

Check on with-exceptions days 1–7: to check Rp 10,671,421 (not in bank 9,031,421 + credit with no settlement 1,250,000 + POS with no settlement 171,000 + settlement with no POS 151,000 + amounts differ 68,000); expected Rp 26,361 (rounding 21,897 on 68 credits + fee 4,464).

## 6 · Rate table (core/analysis.py · rate_rows)

- A row is a period (day, the Monday of its week, the month "YYYY-MM", or all) × outlet (optional) × provider (optional) of the **POS sales**, plus the settlements of that outlet and date that have no sale.
- Per row: rows per table; rates POS → settlement, settlement → POS, settlement → bank, bank → settlement, end to end; POS amount and nett, settlement gross, MDR and nett, bank credit; gaps POS − settlement gross and settlement nett − bank.
- Bank money is shared: each credit is split over the records it pays in proportion to their nett, so a group's bank column adds up to the credits without counting a batch twice.
- A credit with no settlement has no outlet, so it isn't a row: it's noted once under the table ("1 bank credit (Rp 1.250.000) in this period isn't linked to any settlement…").
- Default sort: latest period first, then outlet and provider; sorting by a rate puts the worst first; empty values last. "Only rows under 100%" keeps rows where any stage is under 100%.

## 7 · Learning (services/learning.py)

Each decision is noted: an upload rule created, updated or kept; each cleaning card saved; each new matching rule. Running stage l2 closes the round ("Close N"). The Overview shows decisions per close as bars and what the saved rules cover: file formats, names and spellings, kinds of bank rows judged, matching rules, links made by hand, follow-ups resolved. Zestly: close 1 = 7 decisions (3 upload rules + 2 cleaning cards + 2 matching rules); day 8 = 2 (POS rule update + one spelling).

## 8 · Follow-up drafts (services/followup.py)

Kira drafts follow-up notes; a person (or the user approving Kira's save) decides. Nothing is saved by drafting.

- **Which records:** the given record ids, the given keys (sales number, reference), or the scope's records that aren't Matched (optionally one reason). only_empty leaves out records that already have a note.
- **Groups:** records with the same status, reason, outlet and day share one note; for "Not in bank yet" also the same store (entity_id or merchant_id), so a missing payout is one note. Other reasons get one note per record (each sale is its own case).
- **Group total:** for "Not in bank yet" the sum of the settlements' nett; otherwise the records' amounts.
- **Latest bank date** = the latest tanggal_transaksi in the bank table; days waiting = latest bank date − settled_date (or transaction_date).

| Reason | Status | Note (English; Indonesian is the same content) |
| --- | --- | --- |
| Not in bank yet | investigating | "<provider> payout for <outlet> (store <id>) of <day> is not in the bank: <n> settlements, Rp <total>, as of the statement of <latest> (<d> days). Ask <provider> for the status of the <day> payout; check the next bank statement." (one record: "Settlement <reference> (Rp <nett>) from <provider> at <outlet> on <day> is not in the bank …") |
| No settlement | investigating | "POS sale <key> (Rp <amount> at <hh:mm>) at <outlet> has no <provider> settlement. Ask <provider> whether the payment was voided or refunded; if the customer paid another way, correct the payment method in POS." |
| No POS sale | investigating | "<provider> settled Rp <gross> (ref <key>) at <outlet> on <day>, but there is no POS sale. Ask the outlet whether the cashier missed ringing it up; if so, add the sale in POS." |
| Credit with no settlement | investigating | "Bank credit Rp <kredit> on <date> ("<description, 60 chars>") has no settlement or withdrawal behind it. Ask the provider what it pays (a late or manual payout?) before booking it." |
| Needs review | open | "<reason>: check the bank description against reference <ref> before accepting it." |
| Matched with a difference | investigating | "<key> at <outlet> on <day>: <what differs>. Check the POS entry against the <provider> report and correct the wrong one." |

- **With AI** (a key and KIRA_AI not off): one call per 30 groups. The model gets each group's evidence (status, reason, outlet, day, provider, store, an example record with its POS, settlement and bank fields, what differs) and the rule draft, and answers {"notes": {"g0": {"note": at most 260 characters, "status": "open" or "investigating"}}} in the chosen language (Indonesian: casual-professional, never "Anda"). Any group the answer doesn't cover correctly keeps its rule note; "by" says which.
- **Saving:** Save all = POST /analysis/follow-ups/bulk (each item like a single save, one transaction). Kira's save_follow_ups writes one note on the named records (keys, or outlet + day + reason), refuses when nothing is named, at most 1,000.


## Explicit Force Match payout approvals (7 November)

In Match analysis, Force Match opens payout comparison. After choosing a complete unlinked daily payout and unlinked same-store bank candidate, the user reviews all amounts/dates, enters a reason (or edits a suggested reason), and explicitly accepts the payout difference. Dates alone do not explain an amount shortage. A group with several withdrawals cannot be force-matched as a single full payout in this flow.

The approval stores a manual settlement-to-bank link, withdrawal evidence and actor/reason/time. It survives reruns when the same evidence is still unused and unchanged. Changed source rows, withdrawal rows or daily-group membership invalidate it. Accepted payout differences remain under Expected; unrelated sale/settlement differences keep their ordinary verdict. Undo removes the approval and link. A force match is never saved merely by opening the comparison or accepting a suggested reason.
