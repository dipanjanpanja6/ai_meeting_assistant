import './globals.css';

export const metadata = {
  title: 'Streaming Research Assistant',
  description: 'Watch a research graph plan, search, write and cite, live over server-sent events.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
