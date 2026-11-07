# Dev merge — 7 November 2026

Branch: `fitur/nurwan-analysis`. Merged dev revision: `96f148a`.

| Version | Git reference |
| --- | --- |
| Before merge (`72eb745`) | `rollback/nurwan-analysis-before-dev-20261107-1533` |
| Backup branch | `backup/nurwan-analysis-before-dev-20261107-1533` |
| Tested merge | `version/nurwan-analysis-dev-20261107-1533` |

The merge brings in dev's workflow progress, Excel export, client selection, landing/sign-in updates and guided tour. It retains Nurwan's rule conditions, saved activation and guided editor, plus the approved deterministic POS pairing and Force Match flow. Progress reporting wraps the existing matching decisions. CSV and Excel both retain force-match approval metadata.

Validation: 284 backend tests passed (7 optional-fixture skips), 232 frontend tests passed, production build and browser checks passed. Existing bundle-size advisory remains. Comparing every automatic link and the full saved reconciliation, including manual approvals, against the pre-merge engine produced identical results on the backed-up Fresh upload workspace. No matching runs or approvals were saved in the real workspace during this merge.

## Roll back code

With a clean working tree, revert this merge while keeping subsequent history:

```sh
git switch fitur/nurwan-analysis
git revert -m 1 version/nurwan-analysis-dev-20261107-1533
```

Alternatively, inspect the exact previous version on a separate branch:

```sh
git switch -c restore/nurwan-analysis-20261107 rollback/nurwan-analysis-before-dev-20261107-1533
```

Restart the local API and frontend after changing versions. Neither command restores or deletes uploaded data. If the branch is later shared, push the revert commit through the normal sync workflow.

## Local data backup

Before merging, all eight local SQLite databases were backed up using SQLite's backup API under `artifacts/dev-merge-20261107-1533/`. Its `backup.json` lists the source databases; `matching-parity.json` records the comparison. These files are local and ignored by Git. A code rollback does not require replacing these databases; restoring a database would discard any newer workspace changes and should be a separate deliberate action.

Local UI: http://127.0.0.1:5173. Local API: http://127.0.0.1:8000.
