import PageHeader from '../../components/ui/PageHeader';
import FeeLedger from '../../components/FeeLedger';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';

export default function MyFeesPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(`/fees/ledger/${user.studentId}`);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <PageHeader title="My Fees" subtitle="Fee ledger and payment history. Pay through the college fee portal and keep your transaction ID." />
      <FeeLedger fees={data.fees} payments={data.payments} totals={data.totals} />
    </div>
  );
}
