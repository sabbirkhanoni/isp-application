# Phase 12 — Business accounts

## Expenses (admin only)

Menu **Expenses**: add, edit, delete, filter by month and category, CSV download. Categories: salary, bandwidth, rent, electricity, equipment, transport, other. Every change is in the audit log.

## Financial reports (menu **Financial reports**, admin)

- **Month by month** (up to 24 months): billed, collected, expenses, profit. Profit = money collected minus expenses (cash basis: what actually reached your hand).
- **Expenses by category** for the chosen month.
- **Collection by staff**: payments, cash, bKash and total per person who recorded them.
- **By area**: customers, active, current dues and money collected this month per area (customers without an area are grouped).
- **Customers joining and leaving**: new and left per month, plus today's active / suspended (non-payment) / left counts.
  Each table has a CSV download (spreadsheet-safe numbers in plain taka).

## Customer left

Customer page → **Customer left** (admin). Sets the status to TERMINATED with the date, switches the router account off (when router-managed), and stops new bills. Unpaid bills remain on the Dues list. **Reconnect** brings a former customer back. Churn numbers depend on this button, so use it when someone leaves for good.
Customers terminated before Phase 12 have no real date; their last-change date was used.

## Monthly summary SMS

Set `OWNER_PHONE` (Render environment). On the first run in a new month the system SMSes last month's collection, expenses, profit, billed, total dues, new and left customers. Recorded in `report_runs`, so it is sent once per month even after restarts. It needs the SMS provider (`SMS_DRIVER=http`); with the default log driver it only writes to the log. If sending fails it retries on the next 5-minute tick.

## Technical

Migration 0008 (expenses, customers.terminated_at, report_runs). New permission `EXPENSE_MANAGE` (admin). Endpoints: `/expenses`, `/reports/profit|collectors|areas|churn` (+ `.csv`), `POST /customers/:id/terminate`. 8 new API tests. Aggregates are raw SQL grouped by Dhaka month.
