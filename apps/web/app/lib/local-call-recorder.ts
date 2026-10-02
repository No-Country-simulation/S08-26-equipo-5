export type RecordingMode = "meeting" | "audio" | "video";

function pickMimeType(mode: RecordingMode): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = mode === "audio"
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    : mode === "video"
      ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
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
  private mode: RecordingMode = "meeting";

  async start(stage: HTMLElement, audioStreams: MediaStream[], mode: RecordingMode) {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Este navegador no puede grabar la llamada.");
    }

    const wantVideo = mode !== "audio";
    const wantAudio = mode !== "video";
    const tracks: MediaStreamTrack[] = [];

    if (wantVideo) {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("No se pudo preparar el video de la grabación.");
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
      tracks.push(...canvasStream.getVideoTracks());
      this.canvas = canvas;
      this.canvasStream = canvasStream;
    }

    if (wantAudio) {
      const audioContext = new AudioContext();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      for (const stream of audioStreams) {
        const live = stream.getAudioTracks().filter((track) => track.readyState === "live");
        if (live.length === 0) continue;
        try {
          audioContext.createMediaStreamSource(new MediaStream(live)).connect(destination);
        } catch {
          // Un track que ya se cerró no tiene que frenar el resto.
        }
      }
      const audioTracks = destination.stream.getAudioTracks();
      if (audioTracks.length === 0) {
        await audioContext.close().catch(() => undefined);
        if (!wantVideo) {
          throw new Error("No hay audio en la llamada para grabar.");
        }
      } else {
        tracks.push(...audioTracks);
        this.audioContext = audioContext;
      }
    }

    if (tracks.length === 0) {
      throw new Error("No hay nada para grabar en este momento.");
    }

    const recorded = new MediaStream(tracks);
    const mimeType = pickMimeType(mode);
    const recorder = new MediaRecorder(recorded, mimeType ? { mimeType } : undefined);
    this.mode = mode;
    this.mimeType = recorder.mimeType || mimeType || (wantVideo ? "video/webm" : "audio/webm");
    this.chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    recorder.start(1000);

    this.recorder = recorder;
  }

  get recordingMode(): RecordingMode {
    return this.mode;
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

export function downloadRecording(blob: Blob, mode: RecordingMode = "meeting") {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  const kind = mode === "audio" ? "audio" : mode === "video" ? "video" : "reunion";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `meetflow-${kind}-${stamp}.${extension}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
