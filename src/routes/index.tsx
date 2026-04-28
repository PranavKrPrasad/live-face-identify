import { createFileRoute } from "@tanstack/react-router";
import { ScanFace } from "lucide-react";
import { FaceRecognition } from "@/components/FaceRecognition";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Real-Time Face Recognition" },
      {
        name: "description",
        content:
          "Live in-browser face detection and recognition. Register faces and identify people from your webcam in real time.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center gap-3 px-4 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Real-Time Face Recognition
            </h1>
            <p className="text-xs text-muted-foreground">
              Browser-based · Powered by face-api.js
            </p>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <FaceRecognition />
      </main>
    </div>
  );
}
