import { SiteNav } from '@/components/nav/SiteNav';
import { AuthProvider } from '@/lib/auth-context';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raptor',
  description: 'A self-hostable hackathon submission & judging platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <SiteNav />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-line py-6">
              <div className="mx-auto max-w-5xl px-4 text-xs text-ink-faint sm:px-6 lg:px-8">
                Raptor — self-hostable hackathon platform.
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
