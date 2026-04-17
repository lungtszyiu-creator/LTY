import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import NewTaskForm from './NewTaskForm';

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">发布新任务</h1>
      <NewTaskForm />
    </div>
  );
}
