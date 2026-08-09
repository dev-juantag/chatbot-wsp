import { redirect } from 'next/navigation';

export default function Home() {
  // Redirigir siempre al dashboard
  redirect('/dashboard');
}
