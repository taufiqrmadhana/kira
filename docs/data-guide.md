# **Demo data guide**

Two synthetic datasets in exactly the file format of the competition's Zestly files: POS export (POS\_YYYYMMDD.csv, 34 columns), ShopeePay settlement (SET\_YYYYMMDD.csv, 32 columns: opening balance, payments, the store's daily withdrawal, closing balance per store), BCA bank statement (STA\_YYYYMMDD.csv, 12 columns, dated the next day). Ten Zestly outlets, 20–26 October 2026 (Tuesday to Monday, weekends busier). Outlet names, store codes and the price list follow the competition's fictional Zestly data; all IDs, amounts, people and times are random. Both datasets have the same sales; only the planted cases differ.

## **Folders**

| Folder | Contents   |
| :---- | :---- |
| clean-100/day-01-20261020 … day-07-20261026 | 3 files per day; every sale matches |
| clean-100/answer\_key.csv | one row per POS sale: sales number, trace number, amount, the settlement transaction id, the withdrawal id, the bank credit's description and amount, the expected result |
| clean-100/expected\_by\_outlet\_day.csv | POS sales and expected fully matched sales per outlet and day |
| with-exceptions/day-01…day-07 | the same days with six planted cases |
| with-exceptions/day-08-20261027-new-format | the next day, for the live demo: a new POS column and a new spelling of one store |
| with-exceptions/answer\_key.csv, expected\_by\_outlet\_day.csv | as above, with the planted cases marked (column exception) |

## **How the files link (what KIRA has to discover)**

> * POS trace\_number \= settlement external\_reference\_id (one payment per sale).  
> * Each store (entity\_id, 8 digits) gets one Withdrawal row per day in the settlement file: the opening balance plus that day's payments (settlement\_amount \= amount − MDR), rounded down to a thousand; the rest stays in the wallet as the closing balance.  
> * The withdrawal reaches the bank the next day as a credit of the same amount: TRSF E-BANKING CR \<ddmm\>/FTSCY/WS95051 \<amount\> MC \<4 digits\> \<last 5 digits of entity\_id\> \<sales day\>\_1 \<18 digits\> AIRPAY INTERNATION.  
> * MDR: 0.7% on credit card payments, 0 on the others. The bank file also has supplier transfers, bank fees, opening and closing balances (not payouts).  
> * POS outlet names (Zestly Central Plaza Jakarta) differ from the settlement's store names (Zestly \- Central Plaza): one cleaning decision maps them.

KIRA finds both matching rules on its own: ID: trace\_number \= external\_reference\_id and Withdrawal payout by entity\_id.

## **Planted cases (with-exceptions)**

| Code | Day | Outlet | What happened | What KIRA shows   |
| :---- | :---- | :---- | :---- | :---- |
| E1 | 22 Oct | Garden Mall Bandung | 3 sales voided at the provider: no settlement | 3 records Mismatched, "No settlement"; Garden Mall 22 Oct at 97.9%; money gaps: POS sale with no settlement, Rp 171,000 |
| E2 | 23 Oct | Bay View Cilegon | 2 payments the cashier never rang up | 2 records "No POS sale"; money gaps: Settlement with no POS sale, Rp 151,000 |
| E3 | 24 Oct | Harbor Square Surabaya | the store's payout is missing from the bank statement | 142 sales "Not in bank yet"; Harbor Square 24 Oct at 0% (the red row); money gaps: Settled, not in the bank yet, Rp 9,031,421 |
| E4 | 21 Oct | Riverside Center Jogja | 2 sales keyed in POS with the wrong price (the trace number still links them) | Matched by ID, but the compare view shows "Amount differs"; money gaps: Sale and settlement amounts differ, Rp 68,000 |
| E5 | 25 Oct (bank 26 Oct) | none | a ShopeePay credit of Rp 1,250,000 with no withdrawal behind it | 1 Bank credit with no settlement, noted under the match-rate table; money gaps: Rp 1,250,000 |
| E6 | 26 Oct | Lakeside Town Tangerang | ShopeePay took a Rp 5,000 withdrawal fee from the payout | Still matched; money gaps: Withdrawal or handling fee (expected), Rp 4,464 (the fee less the rounding carried in the wallet) |
| Day 8 | 27 Oct | all | POS file has a new column order\_channel; the settlement spells Central Plaza "Zestly \- Central Plz" | KIRA asks 2 things: update the POS upload rule, and one cleaning decision; the saved rules do the rest; day 8 matches 100% (1,198 sales) |

## **Results to expect (checked by running both datasets through KIRA)**

|  | clean-100 | with-exceptions   |
| :---- | :---- | :---- |
| POS sales (7 days) | 8,784 | 8,784 |
| Fully matched (POS → settlement → bank) | 8,784 (100%) | 8,639 (98.3%) |
| POS ↔ settlement linked | 8,784 | 8,781 |
| Settlement ↔ bank linked | 8,784 of 8,784 | 8,641 of 8,783 |
| Bank payouts linked | 70 of 70 | 69 of 70 |
| Agrees with the answer key | 8,784 / 8,784 | 8,784 / 8,784 |
| Money gaps to check | Rp 0 | Rp 10,671,421 |
| Money gaps expected | Rp 23,043 (rounding, 70 payouts) | Rp 26,361 (rounding on 68 payouts, one fee) |
| Decisions on the first close | 7 (3 upload rules, 2 cleaning cards, 2 matching rules) | 7 |

Loaded on https\://kira.madgun.us as clients **Zestly Demo** (with exceptions, days 1–7), **Zestly Demo – Latihan** (the same, for rehearsing) and **Zestly 100%** (clean). Convert all 21 files of a week at once only through the server itself: through the public address a request over 100 seconds is cut. In the demo only day 8 is uploaded (convert about 35 seconds).
