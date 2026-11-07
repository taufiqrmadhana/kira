export type TourStep = {
  id: string;
  title: string;
  body: string;
  path: string;
  target: string;
  fallback?: string;
  blocked?: string;
  fallbackNote?: string;
};

const convertGate = 'Upload files in POS, Settlement and Mutation to unlock Convert.';
const cleanGate = 'Convert your files and decide on every upload rule to unlock Clean.';
const matchGate = 'Review all cleaning recommendations and save the cleaning rules to unlock matching.';

export const TOUR_STEPS: TourStep[] = [
  {id: 'workspace', title: 'Choose a client', path: '/overview', target: 'workspace', body: 'Choose the client whose payments you are reconciling. Each workspace keeps its files, rules and results separate. This tour only points things out; it never uploads or saves anything.'},
  {id: 'pos', title: 'Upload your POS sales', path: '/workflow?step=1', target: 'upload-pos', body: 'Add sales from your point of sale here. Choose files or drop a folder. Keep the original files: KIRA keeps them as evidence for the numbers you see later.'},
  {id: 'settlement', title: 'Add provider settlements', path: '/workflow?step=1', target: 'upload-settlement', body: 'Add settlement reports from payment providers. These explain which sales the provider settled, its deductions and the payout amount.'},
  {id: 'bank', title: 'Add what reached the bank', path: '/workflow?step=1', target: 'upload-bank', body: 'Mutation means your bank statement. Add it here so KIRA can trace provider payouts to actual bank credits. The tour does not add sample files.'},
  {id: 'convert', title: 'Turn files into tables', path: '/workflow?step=2', target: 'convert-main', fallback: 'workflow-step-2', blocked: convertGate, body: 'Convert reads POS, Settlement and Mutation in order. The counters show actual work as each area is processed. Start conversion yourself when your files are ready.'},
  {id: 'upload-rules', title: 'Check the upload rules', path: '/workflow?step=2', target: 'upload-rules', fallback: 'workflow-step-2', blocked: convertGate, fallbackNote: 'Upload rules appear after conversion. The tour does not start conversion.', body: 'After conversion, review the headers, column types and file settings KIRA found. Decide on each proposed upload rule before continuing. Saved rules can read the next files the same way.'},
  {id: 'standard', title: 'Agree on your data standard', path: '/workflow?step=3', target: 'clean-standard', fallback: 'workflow-step-3', blocked: cleanGate, body: 'The data standard lists the real outlet and provider names, with their aliases. Review cleaning recommendations, accept or reject each one, then save the rules.'},
  {id: 'cleaned', title: 'See exactly what changed', path: '/workflow?step=3', target: 'clean-values', fallback: 'workflow-step-3', blocked: cleanGate, body: 'Yellow cells mark values that a cleaning rule actually changed. Show before cleaning reveals the original values; each changed cell keeps its before-and-after evidence. No yellow appears for unchanged data.'},
  {id: 'match-test', title: 'Test the first matching stage', path: '/workflow?step=4', target: 'matching-stage-l1', fallback: 'workflow-step-4', blocked: matchGate, body: 'First link POS sales to settlements. Choose saved rules and Test selected rules. A test shows possible matches without saving a result. If this stage is already complete, Change rules opens its controls.'},
  {id: 'match-run', title: 'Trace settlements to bank credits', path: '/workflow?step=4', target: 'matching-stage-l2', fallback: 'workflow-step-4', blocked: matchGate, body: 'After saving the first stage, test settlement-to-bank rules. Choose Generate matching result only when you are ready to save. Live progress counts checks; one payout can link several settlements.'},
  {id: 'results', title: 'Review and export the result', path: '/workflow?step=4', target: 'matching-results', fallback: 'workflow-step-4', blocked: matchGate, body: 'When both stages are saved, review the match rate, missing links and bank money explained. Expand the combined table for source evidence. Export Excel gives you an editable copy you can also import into Google Sheets; edits stay in that copy.'},
  {id: 'analysis', title: 'Follow the money and the exceptions', path: '/analysis', target: 'analysis-main', body: 'Match analysis lets you filter the reconciled results, trace each payment and inspect money differences. Use the evidence to decide what needs follow-up. You have reached the end of the tour; your data has not been changed.'},
];
