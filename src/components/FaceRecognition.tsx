import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, UserPlus, Trash2, Loader2, ScanFace } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadFaceModels,
  detectorOptions,
  buildMatcher,
  faceapi,
  type KnownFace,
} from "@/lib/faceApi";

type FaceRow = {
  id: string;
  name: string;
  descriptor: number[] | string;
};

export function FaceRecognition() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const knownRef = useRef<KnownFace[]>([]);
  const matcherRef = useRef<ReturnType<typeof buildMatcher>>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>([]);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);

  // Load face-api models
  useEffect(() => {
    loadFaceModels()
      .then(() => setModelsReady(true))
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load face recognition models");
      });
  }, []);

  // Load known faces from database
  const loadKnownFaces = useCallback(async () => {
    const { data, error } = await supabase
      .from("faces")
      .select("id, name, descriptor");
    if (error) {
      toast.error("Failed to load faces");
      return;
    }
    const parsed: KnownFace[] = (data as FaceRow[]).map((row) => {
      const arr =
        typeof row.descriptor === "string"
          ? JSON.parse(row.descriptor)
          : row.descriptor;
      return {
        id: row.id,
        name: row.name,
        descriptor: new Float32Array(arr as number[]),
      };
    });
    setKnownFaces(parsed);
    knownRef.current = parsed;
    matcherRef.current = buildMatcher(parsed);
  }, []);

  useEffect(() => {
    loadKnownFaces();
  }, [loadKnownFaces]);

  // Start webcam
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not access webcam. Please grant permission.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setStreaming(false);
    setDetectedCount(0);
  }, []);

  // Detection loop
  useEffect(() => {
    if (!streaming || !modelsReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let lastRun = 0;

    const tick = async (ts: number) => {
      if (cancelled) return;
      // Throttle to ~6 fps for performance
      if (ts - lastRun > 160 && video.readyState >= 2) {
        lastRun = ts;
        try {
          const results = await faceapi
            .detectAllFaces(video, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withFaceExpressions()
            .withAgeAndGender();

          const displaySize = {
            width: video.videoWidth,
            height: video.videoHeight,
          };
          if (canvas.width !== displaySize.width)
            canvas.width = displaySize.width;
          if (canvas.height !== displaySize.height)
            canvas.height = displaySize.height;

          const resized = faceapi.resizeResults(results, displaySize);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          setDetectedCount(resized.length);
          const matcher = matcherRef.current;

          const expressionEmoji: Record<string, string> = {
            happy: "😄",
            sad: "😢",
            angry: "😠",
            surprised: "😲",
            fearful: "😨",
            disgusted: "🤢",
            neutral: "😐",
          };

          resized.forEach((det) => {
            const { x, y, width, height } = det.detection.box;
            let label = "Unknown";
            let color = "hsl(0, 84%, 60%)";
            if (matcher) {
              const best = matcher.findBestMatch(det.descriptor);
              if (best.label !== "unknown") {
                label = best.label;
                color = "hsl(142, 76%, 45%)";
              }
            }

            // Top expression
            const expEntries = Object.entries(det.expressions as Record<string, number>);
            const [topExp, topScore] = expEntries.reduce(
              (a, b) => (b[1] > a[1] ? b : a),
              ["neutral", 0] as [string, number],
            );
            const emoji = expressionEmoji[topExp] ?? "";
            const age = Math.round(det.age);
            const gender = det.gender;

            // Box
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            // Top label (name)
            ctx.font = "600 18px system-ui, sans-serif";
            const topText = label;
            const topW = ctx.measureText(topText).width;
            ctx.fillStyle = color;
            ctx.fillRect(x - 1.5, y - 28, topW + 16, 28);
            ctx.fillStyle = "white";
            ctx.fillText(topText, x + 6, y - 8);

            // Bottom label (expression + age + gender)
            const bottomText = `${emoji} ${topExp} ${Math.round(topScore * 100)}% · ${gender} ${age}`;
            ctx.font = "500 14px system-ui, sans-serif";
            const botW = ctx.measureText(bottomText).width;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(x - 1.5, y + height, botW + 16, 24);
            ctx.fillStyle = "white";
            ctx.fillText(bottomText, x + 6, y + height + 16);
          });
        } catch (err) {
          console.error("Detection error", err);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [streaming, modelsReady]);

  // Cleanup
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register current face from video
  const registerFace = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (!videoRef.current || !streaming) {
      toast.error("Start the camera first");
      return;
    }
    setRegistering(true);
    try {
      const result = await faceapi
        .detectSingleFace(videoRef.current, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!result) {
        toast.error("No face detected. Look at the camera and try again.");
        return;
      }
      const descriptor = Array.from(result.descriptor);
      const { error } = await supabase
        .from("faces")
        .insert({ name: name.trim(), descriptor });
      if (error) {
        toast.error("Failed to save face");
        console.error(error);
        return;
      }
      toast.success(`Registered ${name.trim()}`);
      setName("");
      await loadKnownFaces();
    } finally {
      setRegistering(false);
    }
  }, [name, streaming, loadKnownFaces]);

  const deleteFace = async (id: string) => {
    const { error } = await supabase.from("faces").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Face removed");
    await loadKnownFaces();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Video panel */}
      <Card className="overflow-hidden border-border bg-card p-0">
        <div className="relative aspect-[4/3] w-full bg-muted">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          {!streaming && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur">
              {!modelsReady ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Loading recognition models…
                  </p>
                </>
              ) : (
                <>
                  <ScanFace className="h-12 w-12 text-primary" />
                  <Button onClick={startCamera} size="lg">
                    <Camera className="mr-2 h-4 w-4" /> Start Camera
                  </Button>
                </>
              )}
            </div>
          )}
          {streaming && (
            <div className="absolute left-3 top-3 flex gap-2">
              <Badge variant="secondary" className="backdrop-blur">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                LIVE
              </Badge>
              <Badge variant="secondary" className="backdrop-blur">
                {detectedCount} face{detectedCount === 1 ? "" : "s"}
              </Badge>
            </div>
          )}
        </div>
        {streaming && (
          <div className="flex items-center justify-between gap-3 border-t border-border p-4">
            <p className="text-sm text-muted-foreground">
              Detecting {knownFaces.length} known{" "}
              {knownFaces.length === 1 ? "person" : "people"}
            </p>
            <Button variant="outline" size="sm" onClick={stopCamera}>
              Stop Camera
            </Button>
          </div>
        )}
      </Card>

      {/* Sidebar */}
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <UserPlus className="h-5 w-5 text-primary" /> Register a Face
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter a name, look at the camera, then click register.
          </p>
          <div className="space-y-3">
            <Input
              placeholder="Person's name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={registering}
            />
            <Button
              onClick={registerFace}
              disabled={!streaming || registering || !name.trim()}
              className="w-full"
            >
              {registering ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Capture & Register
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">
            Known Faces ({knownFaces.length})
          </h2>
          {knownFaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No faces registered yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {knownFaces.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2"
                >
                  <span className="font-medium">{f.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteFace(f.id)}
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
