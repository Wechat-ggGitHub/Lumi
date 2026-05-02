import './globals.css';

export const metadata = { title: 'Shrew' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans text-text-primary bg-bg-app">
        {children}
      </body>
    </html>
  );
}
