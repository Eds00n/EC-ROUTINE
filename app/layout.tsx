import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EC Routine',
  description: 'Sistema de rotinas e tarefas com notificações push',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
