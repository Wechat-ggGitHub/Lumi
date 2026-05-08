export default function TransparentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          background: transparent !important;
          overflow: hidden !important;
          animation: none !important;
          opacity: 1 !important;
        }
      `}</style>
      {children}
    </>
  );
}
