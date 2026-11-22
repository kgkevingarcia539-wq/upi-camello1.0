import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'upi-camello · Clima y tierra en Barranca de Upía',
  description:
    'Consulta el clima y la humedad estimada del suelo en tu finca o vereda de Barranca de Upía y la región del río Upía.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-sky-100 text-slate-900 antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
