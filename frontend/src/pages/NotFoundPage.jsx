import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/States';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return <EmptyState icon={Compass} title="Page not found" message="The page you are looking for does not exist or has moved." action={<Button to="/">Back to dashboard</Button>} />;
}
