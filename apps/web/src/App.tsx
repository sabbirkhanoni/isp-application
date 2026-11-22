import { Navigate, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from '@/features/auth/change-password-page';
import { useAuth } from '@/features/auth/auth-context';
import { LoginPage } from '@/features/auth/login-page';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { CustomerDetailPage } from '@/features/customers/customer-detail-page';
import { CustomersPage } from '@/features/customers/customers-page';
import { DuesPage } from '@/features/reports/dues-page';
import { BkashPage } from '@/features/billing/bkash-page';
import { InvoicesPage } from '@/features/billing/invoices-page';
import { PaymentsPage } from '@/features/billing/payments-page';
import { LeadsPage } from '@/features/leads/leads-page';
import { PackagesPage } from '@/features/packages/packages-page';
import { CustomerImportPage } from '@/features/customers/customer-import-page';
import { ExpensesPage } from '@/features/finance/expenses-page';
import { FinancePage } from '@/features/finance/finance-page';
import { ComparePage } from '@/features/network/compare-page';
import { LinesPage } from '@/features/network/lines-page';
import { RoutersPage } from '@/features/network/routers-page';
import { AuditPage } from '@/features/admin/audit-page';
import { CollectorsPage } from '@/features/admin/collectors-page';
import { FiberPage } from '@/features/olt/fiber-page';
import { OltsPage } from '@/features/olt/olts-page';
import { UsagePage } from '@/features/network/usage-page';
import { BkashHookPage } from '@/features/admin/bkash-hook-page';
import { BroadcastPage } from '@/features/admin/broadcast-page';
import { BillingSettingsPage } from '@/features/admin/billing-settings-page';
import { PrintInvoicePage, PrintReceiptPage } from '@/features/billing/print-pages';
import { SystemPage } from '@/features/admin/system-page';
import { SmsTemplatesPage } from '@/features/admin/sms-templates-page';
import { UsersPage } from '@/features/users/users-page';
import { AdminLayout } from '@/layouts/admin-layout';
import { StaffLayout } from '@/layouts/staff-layout';
import { DashboardPage } from '@/pages/dashboard-page';
import { NotFoundPage } from '@/pages/not-found-page';

/** Admins get the desktop layout, field staff the mobile one; both share the same routes below. */
function HomeLayout() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <AdminLayout /> : <StaffLayout />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route element={<ProtectedRoute permission="INVOICE_READ" />}>
          <Route path="/print/receipt/:id" element={<PrintReceiptPage />} />
          <Route path="/print/invoice/:id" element={<PrintInvoicePage />} />
        </Route>
        <Route element={<HomeLayout />}>
          <Route index element={<DashboardPage />} />
          <Route element={<ProtectedRoute permission="LEAD_CREATE" />}>
            <Route path="/leads" element={<LeadsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="CUSTOMER_READ" />}>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/network/usage" element={<UsagePage />} />
            <Route path="/network/fiber" element={<FiberPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="FINANCE_REPORT_READ" />}>
            <Route path="/billing/invoices" element={<InvoicesPage />} />
            <Route path="/billing/payments" element={<PaymentsPage />} />
            <Route path="/admin/collectors" element={<CollectorsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="INVOICE_READ" />}>
            <Route path="/billing/dues" element={<DuesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="BKASH_RECONCILE" />}>
            <Route path="/billing/bkash" element={<BkashPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="CUSTOMER_IMPORT" />}>
            <Route path="/customers/import" element={<CustomerImportPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="ROUTER_CONFIG_WRITE" />}>
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/finance/expenses" element={<ExpensesPage />} />
            <Route path="/network/lines" element={<LinesPage />} />
            <Route path="/admin/routers/:id/compare" element={<ComparePage />} />
            <Route path="/admin/routers" element={<RoutersPage />} />
            <Route path="/admin/olts" element={<OltsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="PACKAGE_WRITE" />}>
            <Route path="/admin/packages" element={<PackagesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="SYSTEM_SETTINGS_WRITE" />}>
            <Route path="/admin/sms" element={<SmsTemplatesPage />} />
            <Route path="/admin/system" element={<SystemPage />} />
            <Route path="/admin/billing" element={<BillingSettingsPage />} />
            <Route path="/admin/bkash-sms" element={<BkashHookPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="SMS_BROADCAST" />}>
            <Route path="/admin/broadcast" element={<BroadcastPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="AUDIT_READ" />}>
            <Route path="/admin/audit" element={<AuditPage />} />
          </Route>
          <Route element={<ProtectedRoute permission="USER_MANAGE" />}>
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
