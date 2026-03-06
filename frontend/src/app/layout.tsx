import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Brown Advisory - Investment Analytics",
  description: "Investment analytics platform for Brown Advisory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Gelasio:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 bg-gray-50 ml-0 lg:ml-64">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pt-16 lg:pt-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
