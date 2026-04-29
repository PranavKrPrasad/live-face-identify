// Wrapper around face-api.js: loads models from CDN and exposes detection helpers.
import * as faceapi from "face-api.js";

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

let loadPromise: Promise<void> | null = null;

export function loadFaceModels(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
    ]);
  })();
  return loadPromise;
}

export const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

export type KnownFace = {
  id: string;
  name: string;
  descriptor: Float32Array;
};

export function buildMatcher(known: KnownFace[], threshold = 0.5) {
  if (known.length === 0) return null;
  const labeled = known.map(
    (k) => new faceapi.LabeledFaceDescriptors(k.name, [k.descriptor]),
  );
  return new faceapi.FaceMatcher(labeled, threshold);
}

export { faceapi };
