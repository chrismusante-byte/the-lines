import './globals.css';

export const metadata = {
  title: 'The Lines',
  description: 'Weekly NFL line-guessing game',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e1311',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
