import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import SmoothScrollProvider from "@/components/layout/SmoothScrollProvider";
import SiteHeader from "@/components/layout/SiteHeader";
import OverlayMenu from "@/components/layout/OverlayMenu";
import ContentDimmer from "@/components/layout/ContentDimmer";
import CustomCursor from "@/components/layout/CustomCursor";
import VisualizerStage from "@/components/visualizer/VisualizerStage";
import VinylPanel from "@/components/album/VinylPanel";
import IntroLoader from "@/components/intro/IntroLoader";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Spinner — audio-reactive album visualizer",
  description:
    "Search albums, spin the record, and watch the mix react in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${spaceGrotesk.variable} h-full`}
    >
      <body className="min-h-full bg-bg text-fg antialiased selection:bg-accent">
        <SmoothScrollProvider>
          <IntroLoader />
          <SiteHeader />
          <OverlayMenu />
          <ContentDimmer>{children}</ContentDimmer>
          <VinylPanel />
          <VisualizerStage />
          <CustomCursor />
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
