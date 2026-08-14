// AP Workflow (CODE tier, Frozen §5). Identifies overdue or disputed
// vendor bills. This is deliberately identification-only: it NEVER
// schedules, approves, or executes a payment — the phase instructions are
// explicit that no autonomous bank or payment movement exists in this
// phase, and there is no write path here at all, not even a gated one.

import type { ReadinessVendorBill, ApFinding } from './types.ts';

export function assessApStatus(asOfDate: string, bills: ReadinessVendorBill[]): ApFinding[] {
  const findings: ApFinding[] = [];
  for (const bill of bills) {
    if (bill.status === 'Paid') continue;
    if (bill.status === 'Disputed') {
      findings.push({ billId: bill.id, vendorName: bill.vendor_name, amount: bill.amount, dueDate: bill.due_date, reason: 'disputed' });
      continue;
    }
    if (bill.due_date && bill.due_date < asOfDate) {
      findings.push({ billId: bill.id, vendorName: bill.vendor_name, amount: bill.amount, dueDate: bill.due_date, reason: 'overdue' });
    }
  }
  return findings;
}
