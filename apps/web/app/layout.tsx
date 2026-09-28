import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raptor',
  description: 'A self-hostable hackathon submission & judging platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
