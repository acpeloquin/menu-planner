import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Aubaines' },
  { to: '/menu', label: 'Menu' },
  { to: '/stores', label: 'Magasins' },
];

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-4 py-3 flex flex-wrap items-center justify-between gap-y-2">
          <nav className="flex gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn('text-sm font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Déconnexion
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
