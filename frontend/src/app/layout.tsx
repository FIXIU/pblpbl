import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Sztuczny Dach | Coating Reflectivity Testbed",
  description: "Stacja badawcza właściwości refleksyjnych i termoizolacyjnych powłok dachowych na Raspberry Pi 5",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

import { TooltipProvider } from "@/components/ui/tooltip";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className={cn("dark h-full", "font-sans", geist.variable)}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased selection:bg-orange-500 selection:text-white">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
