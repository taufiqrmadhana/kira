KIRA API contract
Base URL: https://<host>/api. JSON in and out unless noted. Generated from the running app (FastAPI OpenAPI) and a real run on the sample files, so every example is an actual response (shortened: long lists show two items, long text is cut).
Conventions
* Sign-in. With KIRA_PASSWORD set, every call needs the kira_session cookie from POST /api/login. Without it: 401 {"detail": "Sign in required"} (pages redirect to /login.html?next=…).
* Client. Header X-Kira-Client: <client id> picks the client's database (kira-<id>.db). No header = the default client.
* Person. Header X-Kira-User: <name> is written to the audit log (default KIRA_USER).
* Errors. 409 {"detail": "…"} when a request doesn't fit the workflow step (WorkflowError), 400 for bad input, 422 for a wrong body shape (FastAPI validation), 401 signed out.
* Writes are serialized by one write lock and committed before the response is sent.
* Record ids (i), row numbers (n) and link ids (M1-0042, M2-0007) are stable only within one matching run.
Sign-in
POST /api/login
Login
Body Login:
Field
	Type
	Required
	Default

	username
	string
	yes


	password
	string
	yes


	POST /api/logout
Logout
GET /api/me
Me
Example response (200):
{
"user": "local",
"auth": false
}

Clients
GET /api/clients
List Clients
Example response (200):
[
{
 "id": "",
 "name": "Main workspace"
}
]

POST /api/clients
Save Client
Body Client:
Field
	Type
	Required
	Default

	name
	string
	yes


	id
	string or null
	no


	Example request:
{
"name": "Kopi Nusantara"
}

Example response (200):
{
"id": "kopi-nusantara",
"name": "Kopi Nusantara"
}

1 · Upload
GET /api/files
List Files
Example response (200):
[
{
 "id": 1,
 "type": "bank",
 "name": "mutasi_bca_2026-10-26.csv",
 "folder": "Sample day 1",
 "sheet": null,
 "size": 4492,
 "rows": 21,
 "looks_like": "bank",
 "wrong_area": false,
 "uploaded_by": "Nadia Aulia",
 "uploaded_at": "2026-11-04T14:50:57.857511"
},
{
 "id": 5,
 "type": "pos",
 "name": "extra_pos.csv",
 "folder": "Manual",
 "sheet": null,
 "size": 86,
 "rows": 1,
 "looks_like": null,
 "wrong_area": false,
 "uploaded_by": "Nadia Aulia",
 "uploaded_at": "2026-11-04T14:50:57.872686"
},
"… 3 more"
]

POST /api/files/{type_}
Upload
Parameter
	In
	Type
	Required
	Default

	type_
	path
	string
	yes


	x-kira-user
	header
	string or null
	no


	Body: multipart/form-data with uploads (one or more files) and folder (text, optional).
POST /api/files/samples/{day}
Add Samples
Parameter
	In
	Type
	Required
	Default

	day
	path
	integer
	yes


	x-kira-user
	header
	string or null
	no


	Example response (200):
[
{
 "name": "mutasi_bca_2026-10-26.csv",
 "status": "added",
 "ids": [
  1
 ]
},
{
 "name": "pos_2026-10-26.csv",
 "status": "added",
 "ids": [
  2
 ]
},
"… 2 more"
]

GET /api/files/{file_id}/download
Download
Parameter
	In
	Type
	Required
	Default

	file_id
	path
	integer
	yes


	Example response (200):
id,branch,payment_amount,sales_datetime_out
x1,Menteng,5000,2026-10-26T09:00:00+07:00


POST /api/files/{file_id}/move
Move
Parameter
	In
	Type
	Required
	Default

	file_id
	path
	integer
	yes


	x-kira-user
	header
	string or null
	no


	Body Move:
Field
	Type
	Required
	Default

	to
	string
	yes


	Example request:
{
"type": "settlement"
}

Example response (422):
{
"detail": [
 {
  "type": "missing",
  "loc": [
   "body",
   "to"
  ],
  "msg": "Field required",
  "input": {
   "type": "settlement"
  }
 }
]
}

DELETE /api/files/{file_id}
Remove
Parameter
	In
	Type
	Required
	Default

	file_id
	path
	integer
	yes


	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"ok": true
}

2 · Convert
POST /api/convert
Run Convert
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"at": "2026-11-04T14:50:57.907238+00:00",
"stale": false,
"proposals": {
 "pos": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "4 keys"
   },
   "… 13 more"
  ],
  "delimiter": ",",
  "diff": null,
  "rows": 36,
  "files": 1,
  "samples": {
   "id": "2646816c-1030-4096-8977-1019106fe00c",
   "sales_number": "SLS-MTG-261026-0080",
   "bill_number": "MTG-261026-80",
   "branch": "Menteng",
   "split_payment_method": "false",
   "payment_method_ori": "qris",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T10:07:50+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": "56500",
   "mdr": "396",
   "nett_after_mdr": "56104",
   "created_at": "2026-10-26T23:59:00+07:00",
   "table_no": "T1",
   "…": "1 more keys"
  },
  "rename": {}
 },
 "settlement": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "3 keys"
   },
   "… 17 more"
  ],
  "delimiter": ",",
  "diff": null,
  "rows": 35,
  "files": 2,
  "samples": {
   "id": "0622b4e4-bb81-4d02-8e8d-0590212c0174",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881204",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "MENTENG",
   "transaction_type": "SALE",
   "approval_code": "965220",
   "reference": "AR-261026-01",
   "transaction_date": "2026-10-26T10:07:54+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": "56500",
   "promo_amount": "5000",
   "commission": "0",
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "rename": {}
 },
 "bank": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "3 keys"
   },
   "… 10 more"
  ],
  "delimiter": ";",
  "diff": null,
  "rows": 21,
  "files": 1,
  "samples": {
   "id": "3dca2e2b-59d1-49fc-8b6a-43e264dd34fb",
   "keterangan": "SETORAN TUNAI CABANG PUSAT 261026",
   "cabang": "Pusat",
   "account": "6130881204",
   "tanggal_transaksi_string": "26/10/26 13.00",
   "version": "1",
   "tanggal_transaksi": "2026-10-26T13:00:00+07:00",
   "debit": "0,00",
   "kredit": "2.000.000,00",
   "saldo": "26.850.000,00",
   "created_at": "2026-10-26T07:30:00+07:00",
   "page": "1"
  },
  "rename": {}
 }
},
"decisions": {
 "pos": "new",
 "settlement": "new",
 "bank": "new"
}
}

GET /api/convert
Conversion
Example response (200):
{
"at": "2026-11-04T14:50:57.907238+00:00",
"stale": false,
"proposals": {
 "pos": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "4 keys"
   },
   "… 13 more"
  ],
  "delimiter": ",",
  "diff": null,
  "rows": 36,
  "files": 1,
  "samples": {
   "id": "2646816c-1030-4096-8977-1019106fe00c",
   "sales_number": "SLS-MTG-261026-0080",
   "bill_number": "MTG-261026-80",
   "branch": "Menteng",
   "split_payment_method": "false",
   "payment_method_ori": "qris",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T10:07:50+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": "56500",
   "mdr": "396",
   "nett_after_mdr": "56104",
   "created_at": "2026-10-26T23:59:00+07:00",
   "table_no": "T1",
   "…": "1 more keys"
  },
  "rename": {}
 },
 "settlement": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "3 keys"
   },
   "… 17 more"
  ],
  "delimiter": ",",
  "diff": null,
  "rows": 35,
  "files": 2,
  "samples": {
   "id": "0622b4e4-bb81-4d02-8e8d-0590212c0174",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881204",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "MENTENG",
   "transaction_type": "SALE",
   "approval_code": "965220",
   "reference": "AR-261026-01",
   "transaction_date": "2026-10-26T10:07:54+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": "56500",
   "promo_amount": "5000",
   "commission": "0",
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "rename": {}
 },
 "bank": {
  "proposed": [
   {
    "…": "4 keys"
   },
   {
    "…": "3 keys"
   },
   "… 10 more"
  ],
  "delimiter": ";",
  "diff": null,
  "rows": 21,
  "files": 1,
  "samples": {
   "id": "3dca2e2b-59d1-49fc-8b6a-43e264dd34fb",
   "keterangan": "SETORAN TUNAI CABANG PUSAT 261026",
   "cabang": "Pusat",
   "account": "6130881204",
   "tanggal_transaksi_string": "26/10/26 13.00",
   "version": "1",
   "tanggal_transaksi": "2026-10-26T13:00:00+07:00",
   "debit": "0,00",
   "kredit": "2.000.000,00",
   "saldo": "26.850.000,00",
   "created_at": "2026-10-26T07:30:00+07:00",
   "page": "1"
  },
  "rename": {}
 }
},
"decisions": {
 "pos": "new",
 "settlement": "new",
 "bank": "new"
}
}

GET /api/upload-rules
Upload Rules
Example response (200):
{
"current": {
 "pos": null,
 "settlement": null,
 "bank": null
},
"pending": [
 {
  "type": "pos",
  "decision": "new",
  "delimiter": ",",
  "columns": [
   {
    "…": "4 keys"
   },
   {
    "…": "4 keys"
   },
   "… 13 more"
  ],
  "diff": null,
  "rename": {},
  "current_version": null
 },
 {
  "type": "settlement",
  "decision": "new",
  "delimiter": ",",
  "columns": [
   {
    "…": "4 keys"
   },
   {
    "…": "3 keys"
   },
   "… 17 more"
  ],
  "diff": null,
  "rename": {},
  "current_version": null
 },
 "… 1 more"
]
}

POST /api/upload-rules/{type_}
Decide
Parameter
	In
	Type
	Required
	Default

	type_
	path
	string
	yes


	x-kira-user
	header
	string or null
	no


	Body Decision:
Field
	Type
	Required
	Default

	choice
	string
	yes


	columns
	array or null
	no


	rename
	object or null
	no


	3 · Clean
GET /api/cleaning
Cleaning
Example response (200):
{
"standard": {
 "outlets": {
  "Menteng": [
   "menteng"
  ],
  "Senopati": [
   "senopati"
  ]
 },
 "providers": {
  "DANA": [
   "dana",
   "qris"
  ],
  "GOPAY": [
   "gopay"
  ]
 },
 "columns": {
  "pos": {
   "branch": "outlets",
   "payment_method_ori": "providers"
  },
  "settlement": {
   "branch": "outlets"
  },
  "bank": {}
 },
 "payout_words": [
  "dana",
  "gopay",
  "… 4 more"
 ]
},
"rules": null,
"recommendations": [
 {
  "id": "pos.branch",
  "table": "pos",
  "column": "branch",
  "kind": "map",
  "decision": null,
  "items": [
   {
    "…": "3 keys"
   },
   {
    "…": "3 keys"
   }
  ],
  "choices": [
   "Menteng",
   "Senopati"
  ],
  "title": "Use standard outlet names in branch",
  "why": "2 values in POS branch are other spellings of your POS outlet names."
 },
 {
  "id": "pos.payment_method_ori",
  "table": "pos",
  "column": "payment_method_ori",
  "kind": "map",
  "decision": null,
  "items": [
   {
    "…": "3 keys"
   },
   {
    "…": "3 keys"
   },
   "… 3 more"
  ],
  "choices": [
   "DANA",
   "GOPAY"
  ],
  "title": "Use standard provider names in payment_method_ori",
  "why": "5 values in POS payment_method_ori differ from your standard provider list."
 },
 "… 2 more"
]
}

POST /api/cleaning/recommendations/{rec_id}
Decide
Parameter
	In
	Type
	Required
	Default

	rec_id
	path
	string
	yes


	Body RecDecision:
Field
	Type
	Required
	Default

	decision
	string or null
	yes


	mapping
	object or null
	no


	exclude
	object or null
	no


	Example request:
{
"decision": "accept"
}

Example response (200):
{
"id": "pos.branch",
"table": "pos",
"column": "branch",
"kind": "map",
"decision": "accept",
"items": [
 {
  "from": "SENOPATI",
  "to": "Senopati",
  "rows": 3
 },
 {
  "from": "MENTENG",
  "to": "Menteng",
  "rows": 2
 }
],
"choices": [
 "Menteng",
 "Senopati"
],
"title": "Use standard outlet names in branch",
"why": "2 values in POS branch are other spellings of your POS outlet names."
}

POST /api/cleaning/save
Save
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"version": 1,
"maps": {
 "pos.branch": {
  "SENOPATI": "Senopati",
  "MENTENG": "Menteng"
 },
 "pos.payment_method_ori": {
  "qris": "DANA",
  "QRIS-DANA": "DANA",
  "GOPAY WALLET": "GOPAY",
  "QRIS DANA": "DANA",
  "e-wallet gopay": "GOPAY"
 },
 "settlement.branch": {
  "MENTENG": "Menteng",
  "SENOPATI": "Senopati",
  "Rasa Collective - Senopati": "Senopati",
  "Rasa Collective - Menteng": "Menteng"
 }
},
"exclude": {
 "bank": {
  "setoran tunai cabang pusat #": true,
  "trsf db # cv kopi nusantara": true
 }
},
"created_by": "Nadia Aulia",
"created_at": "2026-11-04T14:50:58.051258"
}

GET /api/tables/{layer}/{type_}
Table
Parameter
	In
	Type
	Required
	Default

	layer
	path
	string
	yes


	type_
	path
	string
	yes


	limit
	query
	integer
	no
	100
	offset
	query
	integer
	no
	0
	4 · Match
GET /api/matching/rules
Rules
Example response (200):
[
{
 "id": "PS1",
 "stage": "l1",
 "kind": "composite",
 "params": {
  "outlet": true,
  "method": true,
  "amountTol": 0,
  "window": 1
 },
 "name": "Outlet + method + amount · 1 min",
 "position": 1,
 "created_by": "Nadia Aulia",
 "created_at": "2026-11-04T14:50:58.099509",
 "conditions": [
  "Same outlet",
  "Same payment method",
  "… 2 more"
 ]
},
{
 "id": "SM1",
 "stage": "l2",
 "kind": "ref",
 "params": {
  "amountTol": 0
 },
 "name": "Reference + amount",
 "position": 1,
 "created_by": "Nadia Aulia",
 "created_at": "2026-11-04T14:50:58.154019",
 "conditions": [
  "Bank description contains the settlement reference",
  "Credit equals net amount exactly"
 ]
}
]

GET /api/matching/{stage}/suggestions
Suggestions
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	Example response (200):
[
{
 "stage": "l1",
 "kind": "composite",
 "params": {
  "outlet": true,
  "method": true,
  "amountTol": 0,
  "window": 1
 },
 "why": "92% of POS sales have a settlement with the same outlet and amount within 1 min.",
 "name": "Outlet + method + amount · 1 min",
 "conditions": [
  "Same outlet",
  "Same payment method",
  "… 2 more"
 ],
 "matches_alone": 33,
 "total": 36,
 "extra_after_saved": 33
}
]

POST /api/matching/{stage}/rules
Save Rule
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	x-kira-user
	header
	string or null
	no


	Body NewRule:
Field
	Type
	Required
	Default

	kind
	string
	no
	"composite"
	params
	object
	no
	{}
	name
	string
	no
	""
	Example request:
{
"kind": "composite",
"params": {
 "outlet": true,
 "method": true,
 "amountTol": 0,
 "window": 1
},
"name": ""
}

Example response (200):
{
"id": "PS1",
"stage": "l1",
"kind": "composite",
"params": {
 "outlet": true,
 "method": true,
 "amountTol": 0,
 "window": 1
},
"name": "Outlet + method + amount · 1 min",
"position": 1,
"created_by": "Nadia Aulia",
"created_at": "2026-11-04T14:50:58.099509+00:00",
"conditions": [
 "Same outlet",
 "Same payment method",
 "… 2 more"
]
}

POST /api/matching/{stage}/preview
Preview
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	Body NewRule:
Field
	Type
	Required
	Default

	kind
	string
	no
	"composite"
	params
	object
	no
	{}
	name
	string
	no
	""
	Example request:
{
"kind": "composite",
"params": {
 "outlet": true,
 "method": true,
 "amountTol": 0,
 "window": 1
}
}

Example response (200):
{
"name": "Outlet + method + amount · 1 min",
"conditions": [
 "Same outlet",
 "Same payment method",
 "… 2 more"
],
"matches_alone": 33,
"total": 36,
"extra_after_saved": 33
}

DELETE /api/matching/rules/{rule_id}
Delete Rule
Parameter
	In
	Type
	Required
	Default

	rule_id
	path
	string
	yes


	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"ok": true
}

POST /api/matching/{stage}/test
Test
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	Body RuleSet:
Field
	Type
	Required
	Default

	rule_ids
	array or null
	no


	Example response (200):
{
"stage": "l1",
"rules": [
 "PS1"
],
"matched": 33,
"total": 36,
"unmatched_left": 3,
"unmatched_right": 2,
"hits": {
 "PS1": 33
},
"ambiguous": []
}

POST /api/matching/{stage}/run
Run
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	x-kira-user
	header
	string or null
	no


	Body RuleSet:
Field
	Type
	Required
	Default

	rule_ids
	array or null
	no


	Example response (200):
{
"stage": "l1",
"run_id": 1,
"rules": [
 "PS1"
],
"matched": 33,
"total": 36,
"unmatched_left": 3,
"unmatched_right": 2,
"hits": {
 "PS1": 33
},
"ambiguous": []
}

GET /api/matching/{stage}/insights
Why the stage isn't at 100%: unmatched rows grouped by cause, with samples and an AI explanation.
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	Example response (200):
{
"v": 2,
"stage": "l1",
"run_id": 1,
"title": "POS ↔ Settlement",
"matched": 33,
"total": 36,
"unmatched_left": 3,
"unmatched_right": 2,
"rules": [
 {
  "id": "PS1",
  "name": "Outlet + method + amount · 1 min",
  "conditions": [
   "Same outlet",
   "Same payment method",
   "… 2 more"
  ]
 }
],
"buckets": [
 {
  "code": "no_amount",
  "title": "No settlement with the same amount",
  "hint": "Amounts differ: a fee, discount, rounding or a partial payment.",
  "count": 2,
  "samples": [
   {
    "…": "2 keys"
   },
   {
    "…": "2 keys"
   }
  ]
 },
 {
  "code": "stl_no_pos",
  "title": "Settlement rows with no POS sale",
  "hint": "A sale missing from the POS export, or from another day.",
  "count": 2,
  "samples": [
   {
    "…": "1 keys"
   },
   {
    "…": "1 keys"
   }
  ]
 },
 "… 1 more"
],
"ai": null,
"better_rule": null
}

GET /api/matching/results
Results
Parameter
	In
	Type
	Required
	Default

	rows
	query
	boolean
	no
	false
	Example response (200):
{
"totals": {
 "rows": 41,
 "matched": 16,
 "mismatched": 25,
 "review": 0,
 "pos": 36,
 "full": 16,
 "l1": 33,
 "stl": 35,
 "l2": 16,
 "credits": 19,
 "credits_linked": 16,
 "cash": 5324854,
 "many_to_one": 0
},
"by_day": {
 "2026-10-26": {
  "pos": 36,
  "matched": 16,
  "review": 0,
  "mismatched": 20
 }
}
}

GET /api/matching/export
Export
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Example response (200):
"status","reason","pos_settlement_rule","settlement_mutation_rule","mutation.id","mutation.keterangan","mutation.cabang","mutation.account","mutation.tanggal_transaksi_string","mutation.version","mutation.tanggal_transaksi","mutation.debit","mutation.kredit","mutation.saldo","mutation.created_at","settlement.id","settlement.payment_method","settlement.merchant_id","settlement.merchant_name","settl…

5 · Analysis
GET /api/analysis/summary
Totals, per outlet, per day and per outlet per day for the scope, plus every value the filters can take.
Parameter
	In
	Type
	Required
	Default

	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"scope": {
 "outlet": "Menteng"
},
"totals": {
 "pos": 18,
 "matched": 7,
 "review": 0,
 "mismatched": 11,
 "amount": 6525000,
 "matched_amount": 2448500,
 "open": 1,
 "records": 19,
 "by_status": {
  "Matched": 7,
  "Needs review": 0,
  "Mismatched": 12
 },
 "stl": 17,
 "stl_to_bank": 7,
 "credits_linked": 7,
 "cash": 2426359
},
"outlets_total": {
 "pos": 18,
 "matched": 7,
 "review": 0,
 "mismatched": 11,
 "amount": 6525000,
 "matched_amount": 2448500,
 "open": 1
},
"unassigned": {
 "credits": 0,
 "amount": 0
},
"by_day": {
 "2026-10-26": {
  "pos": 18,
  "matched": 7,
  "review": 0,
  "mismatched": 11,
  "amount": 6525000,
  "matched_amount": 2448500,
  "open": 1
 }
},
"by_outlet": {
 "Menteng": {
  "pos": 18,
  "matched": 7,
  "review": 0,
  "mismatched": 11,
  "amount": 6525000,
  "matched_amount": 2448500,
  "open": 1
 }
},
"cells": {
 "Menteng": {
  "2026-10-26": {
   "pos": 18,
   "matched": 7,
   "review": 0,
   "mismatched": 11,
   "amount": 6525000,
   "matched_amount": 2448500,
   "open": 1
  }
 }
},
"days": [
 "2026-10-26"
],
"outlets": [
 "Menteng"
],
"facets": {
 "days": [
  "2026-10-26"
 ],
 "outlets": [
  "Menteng",
  "Senopati"
 ],
 "providers": [
  "DANA",
  "E-WALLET",
  "… 1 more"
 ],
 "reasons": {
  "Not in bank yet": 17,
  "No settlement": 3,
  "Credit with no settlement": 3,
  "No POS sale": 2
 }
}
}

GET /api/analysis/records
One page of result records. No sort = the results' order, grouped under their bank credit.
Parameter
	In
	Type
	Required
	Default

	sort
	query
	string
	no
	""
	desc
	query
	boolean
	no
	false
	offset
	query
	integer
	no
	0
	limit
	query
	integer
	no
	100
	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"total": 25,
"offset": 0,
"limit": 2,
"status_counts": {
 "Matched": 16,
 "Needs review": 0,
 "Mismatched": 25
},
"columns": {
 "pos": [
  {
   "name": "id",
   "type": "text"
  },
  {
   "name": "sales_number",
   "type": "text"
  },
  "… 11 more"
 ],
 "settlement": [
  {
   "name": "id",
   "type": "text"
  },
  {
   "name": "payment_method",
   "type": "text"
  },
  "… 16 more"
 ],
 "bank": [
  {
   "name": "id",
   "type": "text"
  },
  {
   "name": "keterangan",
   "type": "text"
  },
  "… 9 more"
 ]
},
"records": [
 {
  "i": 16,
  "g": 16,
  "status": "Mismatched",
  "reason": "Not in bank yet",
  "r1": "PS1",
  "r2": "",
  "label": "No bank credit yet",
  "group_size": 19,
  "group_nett": null,
  "pos": {
   "id": "3b6b314f-d7aa-4413-8167-2b9005103b19",
   "sales_number": "SLS-SNP-261026-0089",
   "bill_number": "SNP-261026-89",
   "branch": "Senopati",
   "split_payment_method": false,
   "payment_method_ori": "DANA",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T10:51:23+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 165000,
   "mdr": 1155,
   "nett_after_mdr": 163845,
   "created_at": "2026-10-26T23:59:00+07:00",
   "__was": {
    "…": "2 keys"
   }
  },
  "stl": {
   "id": "048fbffb-a630-48de-8e2d-9ae950bb9b10",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881205",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "Senopati",
   "transaction_type": "SALE",
   "approval_code": "451747",
   "reference": "AR-261026-04",
   "transaction_date": "2026-10-26T10:51:27+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": 165000,
   "promo_amount": 0,
   "commission": 0,
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "day": "2026-10-26",
  "outlet": "Senopati",
  "provider": "DANA",
  "…": "5 more keys"
 },
 {
  "i": 17,
  "g": 16,
  "status": "Mismatched",
  "reason": "Not in bank yet",
  "r1": "PS1",
  "r2": "",
  "label": "No bank credit yet",
  "group_size": 19,
  "group_nett": null,
  "pos": {
   "id": "8e9a1337-82e1-401b-8156-d91008db5296",
   "sales_number": "SLS-MTG-261026-0170",
   "bill_number": "MTG-261026-170",
   "branch": "Menteng",
   "split_payment_method": false,
   "payment_method_ori": "DANA",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T18:25:03+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 89000,
   "mdr": 623,
   "nett_after_mdr": 88377,
   "created_at": "2026-10-26T23:59:00+07:00",
   "__was": {
    "…": "1 keys"
   }
  },
  "stl": {
   "id": "f48722eb-43d1-4752-8b15-b2c71624ecd6",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881204",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "Menteng",
   "transaction_type": "SALE",
   "approval_code": "383236",
   "reference": "AR-261026-19",
   "transaction_date": "2026-10-26T18:25:10+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": 89000,
   "promo_amount": 5000,
   "commission": 0,
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "day": "2026-10-26",
  "outlet": "Menteng",
  "provider": "DANA",
  "…": "5 more keys"
 }
],
"banks": {}
}

GET /api/analysis/export
Export
Parameter
	In
	Type
	Required
	Default

	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	x-kira-user
	header
	string or null
	no


	Example response (200):
"status","reason","pos_settlement_rule","settlement_mutation_rule","mutation.id","mutation.keterangan","mutation.cabang","mutation.account","mutation.tanggal_transaksi_string","mutation.version","mutation.tanggal_transaksi","mutation.debit","mutation.kredit","mutation.saldo","mutation.created_at","settlement.id","settlement.payment_method","settlement.merchant_id","settlement.merchant_name","settl…

GET /api/analysis/rates
The match-rate table: one row per period (day, week, month or all), outlet and provider, plus the total.
Parameter
	In
	Type
	Required
	Default

	period
	query
	string
	no
	"day"
	by_outlet
	query
	boolean
	no
	true
	by_provider
	query
	boolean
	no
	false
	below
	query
	boolean
	no
	false
	search
	query
	string
	no
	""
	sort
	query
	string
	no
	""
	desc
	query
	boolean
	no
	false
	offset
	query
	integer
	no
	0
	limit
	query
	integer
	no
	100
	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"total": 2,
"offset": 0,
"limit": 2,
"totals": {
 "pos": 36,
 "pos_linked": 33,
 "full": 16,
 "stl": 35,
 "stl_pos": 33,
 "stl_bank": 16,
 "bank": 16,
 "bank_linked": 16,
 "pos_amount": 11737500,
 "pos_nett": 11640170,
 "stl_gross": 11303000,
 "stl_mdr": 94291,
 "stl_nett": 11188709,
 "bank_credit": 5324854.0,
 "…": "7 more keys"
},
"unassigned": {
 "credits": 3,
 "amount": 5168790
},
"rows": [
 {
  "period": "2026-10-26",
  "outlet": "Menteng",
  "provider": "",
  "pos": 18,
  "pos_linked": 16,
  "full": 7,
  "stl": 17,
  "stl_pos": 16,
  "stl_bank": 7,
  "bank": 7,
  "bank_linked": 7,
  "pos_amount": 6525000,
  "pos_nett": 6470515,
  "stl_gross": 6090500,
  "…": "10 more keys"
 },
 {
  "period": "2026-10-26",
  "outlet": "Senopati",
  "provider": "",
  "pos": 18,
  "pos_linked": 17,
  "full": 9,
  "stl": 18,
  "stl_pos": 17,
  "stl_bank": 9,
  "bank": 9,
  "bank_linked": 9,
  "pos_amount": 5212500,
  "pos_nett": 5169655,
  "stl_gross": 5212500,
  "…": "10 more keys"
 }
]
}

GET /api/analysis/side/{stage}/{table}
One side of the linked tables (stage l1: pos | settlement, l2: settlement | bank), with link ids and status.
Parameter
	In
	Type
	Required
	Default

	stage
	path
	string
	yes


	table
	path
	string
	yes


	link_status
	query
	string
	no
	""
	links
	query
	string
	no
	""
	search
	query
	string
	no
	""
	sort
	query
	string
	no
	""
	desc
	query
	boolean
	no
	false
	offset
	query
	integer
	no
	0
	limit
	query
	integer
	no
	100
	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"total": 3,
"offset": 0,
"limit": 2,
"counts": {
 "Linked": 33,
 "Review": 0,
 "Not found": 3
},
"columns": [
 {
  "name": "id",
  "type": "text"
 },
 {
  "name": "sales_number",
  "type": "text"
 },
 "… 11 more"
],
"aggregates": {
 "payment_amount": {
  "sum": 1033000,
  "min": 186500,
  "max": 435500,
  "count": 3
 },
 "mdr": {
  "sum": 9024,
  "min": 1865,
  "max": 4110,
  "count": 3
 },
 "nett_after_mdr": {
  "sum": 1023976,
  "min": 184635,
  "max": 432451,
  "count": 3
 }
},
"rows": [
 {
  "n": 7,
  "rec": 35,
  "key": "SLS-SNP-261026-0101",
  "day": "2026-10-26",
  "outlet": "Senopati",
  "rule": "",
  "link": "",
  "status": "Not found",
  "row": {
   "id": "a54fe3fd-8e8a-494a-8a4a-a258f17a47f4",
   "sales_number": "SLS-SNP-261026-0101",
   "bill_number": "SNP-261026-101",
   "branch": "Senopati",
   "split_payment_method": false,
   "payment_method_ori": "GOPAY",
   "payment_method": "E-WALLET",
   "sales_datetime_out": "2026-10-26T12:04:14+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 186500,
   "mdr": 1865,
   "nett_after_mdr": 184635,
   "created_at": "2026-10-26T23:59:00+07:00",
   "__was": {
    "…": "1 keys"
   }
  }
 },
 {
  "n": 15,
  "rec": 36,
  "key": "SLS-MTG-261026-0125",
  "day": "2026-10-26",
  "outlet": "Menteng",
  "rule": "",
  "link": "",
  "status": "Not found",
  "row": {
   "id": "4f466497-423e-4ff6-8f98-3ac289812daa",
   "sales_number": "SLS-MTG-261026-0125",
   "bill_number": "MTG-261026-125",
   "branch": "Menteng",
   "split_payment_method": false,
   "payment_method_ori": "GOPAY",
   "payment_method": "E-WALLET",
   "sales_datetime_out": "2026-10-26T14:18:27+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 411000,
   "mdr": 4110,
   "nett_after_mdr": 406890,
   "created_at": "2026-10-26T23:59:00+07:00"
  }
 }
]
}

GET /api/analysis/gaps
Where the money differences of the selection come from: rounding, fees, promos (explained) and not in bank yet, credits without a settlement, sales without a settlement… (to check), each with samples.
Parameter
	In
	Type
	Required
	Default

	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"kinds": [
 {
  "kind": "not_in_bank",
  "label": "Settled, not in the bank yet",
  "explained": false,
  "count": 19,
  "amount": 5863855.0,
  "net": 5863855.0,
  "samples": [
   {
    "…": "5 keys"
   },
   {
    "…": "5 keys"
   },
   "… 3 more"
  ]
 },
 {
  "kind": "credit_no_settlement",
  "label": "Bank credit with no settlement",
  "explained": false,
  "count": 3,
  "amount": 5168790.0,
  "net": -5168790.0,
  "samples": [
   {
    "…": "5 keys"
   },
   {
    "…": "5 keys"
   },
   "… 1 more"
  ]
 },
 "… 2 more"
],
"explained": 0,
"unexplained": 12664145.0,
"latest_bank_date": "2026-10-26"
}

GET /api/analysis/follow-ups
Records that aren't matched, with their follow-up (follow: open, investigating or resolved).
Parameter
	In
	Type
	Required
	Default

	follow
	query
	string
	no
	""
	search
	query
	string
	no
	""
	offset
	query
	integer
	no
	0
	limit
	query
	integer
	no
	100
	date_from
	query
	string
	no
	""
	date_to
	query
	string
	no
	""
	outlet
	query
	string
	no
	""
	provider
	query
	string
	no
	""
	status
	query
	string
	no
	""
	reason
	query
	string
	no
	""
	q
	query
	string
	no
	""
	amount_min
	query
	number or null
	no


	amount_max
	query
	number or null
	no


	keys
	query
	string
	no
	""
	ids
	query
	string
	no
	""
	Example response (200):
{
"total": 25,
"offset": 0,
"counts": {
 "open": 25,
 "investigating": 0,
 "resolved": 0
},
"banks": {},
"records": [
 {
  "i": 16,
  "g": 16,
  "status": "Mismatched",
  "reason": "Not in bank yet",
  "r1": "PS1",
  "r2": "",
  "label": "No bank credit yet",
  "group_size": 19,
  "group_nett": null,
  "pos": {
   "id": "3b6b314f-d7aa-4413-8167-2b9005103b19",
   "sales_number": "SLS-SNP-261026-0089",
   "bill_number": "SNP-261026-89",
   "branch": "Senopati",
   "split_payment_method": false,
   "payment_method_ori": "DANA",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T10:51:23+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 165000,
   "mdr": 1155,
   "nett_after_mdr": 163845,
   "created_at": "2026-10-26T23:59:00+07:00",
   "__was": {
    "…": "2 keys"
   }
  },
  "stl": {
   "id": "048fbffb-a630-48de-8e2d-9ae950bb9b10",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881205",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "Senopati",
   "transaction_type": "SALE",
   "approval_code": "451747",
   "reference": "AR-261026-04",
   "transaction_date": "2026-10-26T10:51:27+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": 165000,
   "promo_amount": 0,
   "commission": 0,
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "day": "2026-10-26",
  "outlet": "Senopati",
  "provider": "DANA",
  "…": "5 more keys"
 },
 {
  "i": 17,
  "g": 16,
  "status": "Mismatched",
  "reason": "Not in bank yet",
  "r1": "PS1",
  "r2": "",
  "label": "No bank credit yet",
  "group_size": 19,
  "group_nett": null,
  "pos": {
   "id": "8e9a1337-82e1-401b-8156-d91008db5296",
   "sales_number": "SLS-MTG-261026-0170",
   "bill_number": "MTG-261026-170",
   "branch": "Menteng",
   "split_payment_method": false,
   "payment_method_ori": "DANA",
   "payment_method": "QRIS",
   "sales_datetime_out": "2026-10-26T18:25:03+07:00",
   "sales_date": "2026-10-26",
   "payment_amount": 89000,
   "mdr": 623,
   "nett_after_mdr": 88377,
   "created_at": "2026-10-26T23:59:00+07:00",
   "__was": {
    "…": "1 keys"
   }
  },
  "stl": {
   "id": "f48722eb-43d1-4752-8b15-b2c71624ecd6",
   "payment_method": "QRIS",
   "merchant_id": "ARN-00881204",
   "merchant_name": "RASA COLLECTIVE",
   "branch": "Menteng",
   "transaction_type": "SALE",
   "approval_code": "383236",
   "reference": "AR-261026-19",
   "transaction_date": "2026-10-26T18:25:10+07:00",
   "settled_date": "2026-10-26",
   "gross_amount": 89000,
   "promo_amount": 5000,
   "commission": 0,
   "refund_amount": "0",
   "…": "5 more keys"
  },
  "day": "2026-10-26",
  "outlet": "Menteng",
  "provider": "DANA",
  "…": "5 more keys"
 }
]
}

POST /api/analysis/follow-ups
Set Follow Up
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Body FollowUpIn:
Field
	Type
	Required
	Default

	rid
	string
	yes


	status
	string
	no
	"open"
	note
	string
	no
	""
	assignee
	string
	no
	""
	Example request:
{
"rid": "pos:SLS-SNP-261026-0089",
"status": "investigating",
"assignee": "Andrew",
"note": "Asked DANA"
}

Example response (200):
{
"status": "investigating",
"note": "Asked DANA",
"assignee": "Andrew",
"by": "Nadia Aulia",
"at": "2026-11-04T14:50:58.381732+00:00"
}

GET /api/analysis/manual-links
Manual Links
Example response (200):
[
{
 "id": 1,
 "stage": "l1",
 "left": [
  7
 ],
 "right": [
  21
 ],
 "left_keys": [
  "SLS-SNP-261026-0101"
 ],
 "right_keys": [
  "NU-261026-03"
 ],
 "note": "Same amount and outlet",
 "by": "Nadia Aulia",
 "at": "2026-11-04T14:50:58.393705",
 "valid": true
}
]

POST /api/analysis/manual-links
Links rows by hand (rows the rules didn't link). Applied on top of the latest runs; survives re-runs.
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Body ManualIn:
Field
	Type
	Required
	Default

	stage
	string
	yes


	left
	array of integer
	yes


	right
	array of integer
	yes


	note
	string
	yes


	Example request:
{
"stage": "l1",
"left": [
 7
],
"right": [
 21
],
"note": "Same amount and outlet"
}

Example response (200):
{
"id": 1,
"stage": "l1",
"left": [
 7
],
"right": [
 21
],
"left_keys": [
 "SLS-SNP-261026-0101"
],
"right_keys": [
 "NU-261026-03"
],
"note": "Same amount and outlet",
"by": "Nadia Aulia",
"at": "2026-11-04T14:50:58.393705+00:00",
"valid": true
}

DELETE /api/analysis/manual-links/{link_id}
Remove Manual Link
Parameter
	In
	Type
	Required
	Default

	link_id
	path
	integer
	yes


	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"ok": true
}

Kira agent
POST /api/agent/chat
Chat
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Body Message:
Field
	Type
	Required
	Default

	session_id
	string
	yes


	message
	string
	yes


	context
	object or null
	no


	(Needs the model; see the Kira agent document for the reply shape.)
POST /api/agent/confirm
Confirm
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Body Confirmation:
Field
	Type
	Required
	Default

	session_id
	string
	yes


	answers
	object
	yes


	(Needs the model; see the Kira agent document for the reply shape.)
GET /api/agent/history
The chat so far (to show it again after a reload).
Parameter
	In
	Type
	Required
	Default

	session_id
	query
	string
	yes


	x-kira-user
	header
	string or null
	no


	(Needs the model; see the Kira agent document for the reply shape.)
Workflow
GET /api/status
Get Status
Example response (200):
{
"step": 1,
"next": {
 "tool": "add_sample_files",
 "say": "Add files to POS, Settlement, Mutation."
},
"files": {
 "pos": 0,
 "settlement": 0,
 "bank": 0
},
"converted": false,
"upload_rules_pending": [],
"cleaning": {
 "open": 0,
 "rules_version": null
},
"tables": {},
"matching": {
 "l1": {
  "done": false,
  "rules": 0
 },
 "l2": {
  "done": false,
  "rules": 0
 }
}
}

GET /api/overview
A small summary for the Overview page, fast enough to show before the full workflow loads.
Example response (200):
{
"status": {
 "step": 4,
 "next": {
  "tool": "export_results",
  "say": "Matching is complete. Export the results."
 },
 "files": {
  "pos": 1,
  "settlement": 2,
  "bank": 1
 },
 "converted": true,
 "upload_rules_pending": [],
 "cleaning": {
  "open": 0,
  "rules_version": 1
 },
 "tables": {
  "pos": {
   "rows": 36,
   "clean_rows": 36,
   "changed": 29,
   "dropped": 0
  },
  "settlement": {
   "rows": 35,
   "clean_rows": 35,
   "changed": 35,
   "dropped": 0
  },
  "bank": {
   "rows": 21,
   "clean_rows": 19,
   "changed": 0,
   "dropped": 2
  }
 },
 "matching": {
  "l1": {
   "done": true,
   "rules": 1,
   "run_id": 1,
   "rule_ids": [
    "PS1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 33,
   "total": 36,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.119458"
  },
  "l2": {
   "done": true,
   "rules": 1,
   "run_id": 2,
   "rule_ids": [
    "SM1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 16,
   "total": 35,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.178144"
  }
 }
},
"results": {
 "totals": {
  "rows": 41,
  "matched": 16,
  "mismatched": 25,
  "review": 0,
  "pos": 36,
  "full": 16,
  "l1": 33,
  "stl": 35,
  "l2": 16,
  "credits": 19,
  "credits_linked": 16,
  "cash": 5324854,
  "many_to_one": 0
 },
 "by_day": {
  "2026-10-26": {
   "pos": 36,
   "matched": 16,
   "review": 0,
   "mismatched": 20
  }
 },
 "open_items": [
  {
   "status": "Mismatched",
   "reason": "Not in bank yet",
   "pos": {
    "…": "4 keys"
   },
   "stl": {
    "…": "3 keys"
   },
   "bank": null
  },
  {
   "status": "Mismatched",
   "reason": "Not in bank yet",
   "pos": {
    "…": "4 keys"
   },
   "stl": {
    "…": "3 keys"
   },
   "bank": null
  },
  "… 4 more"
 ],
 "run_at": "2026-11-04T14:50:58.178144"
}
}

GET /api/learning
What KIRA has learned: decisions asked per close (fewer as it runs) and what its saved rules now cover.
Example response (200):
{
"closes": [
 {
  "questions": 9,
  "asked": [
   "Create the POS upload rule",
   "Create the Settlement upload rule",
   "… 4 more"
  ],
  "reused": [],
  "files": 4,
  "at": "2026-11-04T14:50:58.187436+00:00",
  "pos": 36,
  "matched": 16,
  "rules_used": [
   "SM1"
  ]
 }
],
"open": null,
"knowledge": {
 "file_formats": 3,
 "cleaning_values": 11,
 "bank_kinds": 2,
 "matching_rules": 2,
 "manual_links": 0,
 "resolved_follow_ups": 0
}
}

GET /api/workflow
Workflow
Parameter
	In
	Type
	Required
	Default

	rows
	query
	integer
	no
	100
	Example response (200):
{
"status": {
 "step": 4,
 "next": {
  "tool": "export_results",
  "say": "Matching is complete. Export the results."
 },
 "files": {
  "pos": 1,
  "settlement": 2,
  "bank": 1
 },
 "converted": true,
 "upload_rules_pending": [],
 "cleaning": {
  "open": 0,
  "rules_version": 1
 },
 "tables": {
  "pos": {
   "rows": 36,
   "clean_rows": 36,
   "changed": 29,
   "dropped": 0
  },
  "settlement": {
   "rows": 35,
   "clean_rows": 35,
   "changed": 35,
   "dropped": 0
  },
  "bank": {
   "rows": 21,
   "clean_rows": 19,
   "changed": 0,
   "dropped": 2
  }
 },
 "matching": {
  "l1": {
   "done": true,
   "rules": 1,
   "run_id": 1,
   "rule_ids": [
    "PS1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 33,
   "total": 36,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.119458"
  },
  "l2": {
   "done": true,
   "rules": 1,
   "run_id": 2,
   "rule_ids": [
    "SM1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 16,
   "total": 35,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.178144"
  }
 }
},
"files": [
 {
  "id": 1,
  "type": "bank",
  "name": "mutasi_bca_2026-10-26.csv",
  "folder": "Sample day 1",
  "sheet": null,
  "size": 4492,
  "rows": 21,
  "looks_like": "bank",
  "wrong_area": false,
  "uploaded_by": "Nadia Aulia",
  "uploaded_at": "2026-11-04T14:50:57.857511"
 },
 {
  "id": 2,
  "type": "pos",
  "name": "pos_2026-10-26.csv",
  "folder": "Sample day 1",
  "sheet": null,
  "size": 7245,
  "rows": 36,
  "looks_like": "pos",
  "wrong_area": false,
  "uploaded_by": "Nadia Aulia",
  "uploaded_at": "2026-11-04T14:50:57.863554"
 },
 "… 2 more"
],
"conversion": {
 "at": "2026-11-04T14:50:57.907238+00:00",
 "stale": false,
 "proposals": {
  "pos": {
   "proposed": [
    {
     "…": "4 keys"
    },
    {
     "…": "4 keys"
    },
    "… 13 more"
   ],
   "delimiter": ",",
   "diff": null,
   "rows": 36,
   "files": 1,
   "samples": {
    "…": "15 keys"
   },
   "rename": {
    "…": "0 keys"
   }
  },
  "settlement": {
   "proposed": [
    {
     "…": "4 keys"
    },
    {
     "…": "3 keys"
    },
    "… 17 more"
   ],
   "delimiter": ",",
   "diff": null,
   "rows": 35,
   "files": 2,
   "samples": {
    "…": "19 keys"
   },
   "rename": {
    "…": "0 keys"
   }
  },
  "bank": {
   "proposed": [
    {
     "…": "4 keys"
    },
    {
     "…": "3 keys"
    },
    "… 10 more"
   ],
   "delimiter": ";",
   "diff": null,
   "rows": 21,
   "files": 1,
   "samples": {
    "…": "12 keys"
   },
   "rename": {
    "…": "0 keys"
   }
  }
 },
 "decisions": {
  "pos": "created",
  "settlement": "created",
  "bank": "created"
 }
},
"upload_rules": {
 "pos": {
  "type": "pos",
  "version": 1,
  "delimiter": ",",
  "columns": [
   {
    "…": "3 keys"
   },
   {
    "…": "3 keys"
   },
   "… 13 more"
  ],
  "rename": {},
  "created_by": "Nadia Aulia",
  "created_at": "2026-11-04T14:50:57.941076"
 },
 "settlement": {
  "type": "settlement",
  "version": 1,
  "delimiter": ",",
  "columns": [
   {
    "…": "3 keys"
   },
   {
    "…": "3 keys"
   },
   "… 17 more"
  ],
  "rename": {},
  "created_by": "Nadia Aulia",
  "created_at": "2026-11-04T14:50:57.965544"
 },
 "bank": {
  "type": "bank",
  "version": 1,
  "delimiter": ";",
  "columns": [
   {
    "…": "3 keys"
   },
   {
    "…": "3 keys"
   },
   "… 10 more"
  ],
  "rename": {},
  "created_by": "Nadia Aulia",
  "created_at": "2026-11-04T14:50:57.986386"
 }
},
"cleaning": {
 "rules": {
  "version": 1,
  "maps": {
   "pos.branch": {
    "…": "2 keys"
   },
   "pos.payment_method_ori": {
    "…": "5 keys"
   },
   "settlement.branch": {
    "…": "4 keys"
   }
  },
  "exclude": {
   "bank": {
    "…": "2 keys"
   }
  },
  "created_by": "Nadia Aulia",
  "created_at": "2026-11-04T14:50:58.051258"
 },
 "recommendations": []
},
"tables": {
 "parsed": {
  "pos": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 11 more"
   ],
   "total": 36,
   "rows": [
    {
     "…": "13 keys"
    },
    {
     "…": "13 keys"
    }
   ],
   "dupes": 0,
   "raw": 36
  },
  "settlement": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 16 more"
   ],
   "total": 35,
   "rows": [
    {
     "…": "18 keys"
    },
    {
     "…": "18 keys"
    }
   ],
   "dupes": 0,
   "raw": 35
  },
  "bank": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 9 more"
   ],
   "total": 21,
   "rows": [
    {
     "…": "11 keys"
    },
    {
     "…": "11 keys"
    }
   ],
   "dupes": 0,
   "raw": 21
  }
 },
 "clean": {
  "pos": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 11 more"
   ],
   "total": 36,
   "rows": [
    {
     "…": "14 keys"
    },
    {
     "…": "14 keys"
    }
   ],
   "dupes": 0,
   "raw": 36,
   "changed": 29,
   "dropped": 0
  },
  "settlement": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 16 more"
   ],
   "total": 35,
   "rows": [
    {
     "…": "19 keys"
    },
    {
     "…": "19 keys"
    }
   ],
   "dupes": 0,
   "raw": 35,
   "changed": 35,
   "dropped": 0
  },
  "bank": {
   "columns": [
    {
     "…": "2 keys"
    },
    {
     "…": "2 keys"
    },
    "… 9 more"
   ],
   "total": 19,
   "rows": [
    {
     "…": "11 keys"
    },
    {
     "…": "11 keys"
    }
   ],
   "dupes": 0,
   "raw": 21,
   "changed": 0,
   "dropped": 2
  }
 }
},
"matching": {
 "rules": [
  {
   "id": "PS1",
   "stage": "l1",
   "kind": "composite",
   "params": {
    "…": "4 keys"
   },
   "name": "Outlet + method + amount · 1 min",
   "position": 1,
   "created_by": "Nadia Aulia",
   "created_at": "2026-11-04T14:50:58.099509",
   "conditions": [
    "Same outlet",
    "Same payment method",
    "… 2 more"
   ]
  },
  {
   "id": "SM1",
   "stage": "l2",
   "kind": "ref",
   "params": {
    "…": "1 keys"
   },
   "name": "Reference + amount",
   "position": 1,
   "created_by": "Nadia Aulia",
   "created_at": "2026-11-04T14:50:58.154019",
   "conditions": [
    "Bank description contains the settlement reference",
    "Credit equals net amount exactly"
   ]
  }
 ],
 "stages": {
  "l1": {
   "done": true,
   "rules": 1,
   "run_id": 1,
   "rule_ids": [
    "PS1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 33,
   "total": 36,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.119458"
  },
  "l2": {
   "done": true,
   "rules": 1,
   "run_id": 2,
   "rule_ids": [
    "SM1"
   ],
   "summary": {
    "…": "6 keys"
   },
   "matched": 16,
   "total": 35,
   "batches": 0,
   "run_at": "2026-11-04T14:50:58.178144"
  }
 },
 "results": {
  "totals": {
   "rows": 41,
   "matched": 16,
   "mismatched": 25,
   "review": 0,
   "pos": 36,
   "full": 16,
   "l1": 33,
   "stl": 35,
   "l2": 16,
   "credits": 19,
   "credits_linked": 16,
   "cash": 5324854,
   "many_to_one": 0
  },
  "by_day": {
   "2026-10-26": {
    "…": "4 keys"
   }
  }
 }
}
}

GET /api/audit
Audit
Parameter
	In
	Type
	Required
	Default

	limit
	query
	integer
	no
	100
	Example response (200):
[
{
 "at": "2026-11-04T14:50:58.412733",
 "actor": "Nadia Aulia",
 "action": "Removed a manual link",
 "object": "l1 · [7] ↔ [21]",
 "detail": "Same amount and outlet"
},
{
 "at": "2026-11-04T14:50:58.394848",
 "actor": "Nadia Aulia",
 "action": "Linked rows by hand",
 "object": "l1 · pos [7] ↔ settlement [21]",
 "detail": "Same amount and outlet"
},
"… 18 more"
]

POST /api/reset
Reset
Parameter
	In
	Type
	Required
	Default

	x-kira-user
	header
	string or null
	no


	Example response (200):
{
"ok": true,
"backup": "ref.bak-reset-20261104-215058.db"
}

Added on 5 November
These endpoints were added after this document was generated. 08 Gaps and fixes (section Added on 5 November) explains the features behind them.
* POST /api/analysis/follow-ups/draft: body {rids?: [string], keys?: [string], only_empty?: bool, lang?: "en" or "id"}; without rids or keys, the query's scope (date_from, date_to, outlet, provider, reason) picks the records that aren't matched. Response {drafts: [{rid, key, status, note, assignee, by: "ai" or "rule", group}], groups: [{label, records, drafted, total, status, note, keys, by}], by, skipped}. Nothing is saved, and it doesn't take the write lock.
* POST /api/analysis/follow-ups/bulk: body {items: [{rid, status, note, assignee}]}. Response {saved, follow_ups: {rid: {status, note, assignee, by, at}}}. 409 when empty or over 2,000 items.
* PATCH /api/matching/rules/{rule_id}: body {kind, params, name}, checked like a new rule. Response: the rule plus results_cleared (true when the current results used it: they are cleared, and stage 1 also clears stage 2).
* POST /api/matching/{stage}/order: body {rule_ids: every rule id of the stage, first one first}. Response: the stage's rules in the new order. 409 unless the list is exactly the stage's rules. Results made in the old order are cleared.
* POST /api/matching/{stage}/preview: also takes exclude, the id of the rule being edited, so extra_after_saved compares with the other rules.
