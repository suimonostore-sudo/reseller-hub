import "./globals.css";

export const metadata = {
  title: "Reseller Hub",
  description: "Multi-platform reseller inventory and fulfillment"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
