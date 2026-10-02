function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function drawContain(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  context.drawImage(
    video,
    x + (width - drawnWidth) / 2,
    y + (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  );
}

export class LocalCallRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasStream: MediaStream | null = null;
  private frame = 0;
  private mimeType = "video/webm";

  async start(stage: HTMLElement, audioStreams: MediaStream[]) {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Este navegador no puede grabar la llamada.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No se pudo preparar el video de la grabación.");
    }

    const audioContext = new AudioContext();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    for (const stream of audioStreams) {
      const tracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
      if (tracks.length === 0) continue;
      try {
        audioContext.createMediaStreamSource(new MediaStream(tracks)).connect(destination);
      } catch {
        // Un track que ya se cerró no tiene que frenar el resto.
      }
    }

    const draw = () => {
      const videos = [...stage.querySelectorAll("video")].filter((video) => {
        const box = video.getBoundingClientRect();
        return video.videoWidth > 0 && box.width > 24 && box.height > 24;
      });
      context.fillStyle = "#080b19";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (videos.length > 0) {
        const columns = Math.ceil(Math.sqrt(videos.length));
        const rows = Math.ceil(videos.length / columns);
        const cellWidth = canvas.width / columns;
        const cellHeight = canvas.height / rows;
        videos.forEach((video, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          drawContain(context, video, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
        });
      }
      this.frame = window.requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(24);
    const recorded = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(recorded, mimeType ? { mimeType } : undefined);
    this.mimeType = recorder.mimeType || mimeType || "video/webm";
    this.chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    recorder.start(1000);

    this.recorder = recorder;
    this.audioContext = audioContext;
    this.canvas = canvas;
    this.canvasStream = canvasStream;
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    const mimeType = this.mimeType;
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;

    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    this.canvasStream?.getTracks().forEach((track) => track.stop());

    await this.audioContext?.close().catch(() => undefined);
    this.recorder = null;
    this.audioContext = null;
    this.canvas = null;
    this.canvasStream = null;
    return new Blob(this.chunks, { type: mimeType });
  }
}

export function downloadRecording(blob: Blob) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `meetflow-${stamp}.${extension}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
