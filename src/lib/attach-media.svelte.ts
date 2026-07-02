import { onDestroy } from "svelte";
import { toasts } from "$lib/ui/toast";

interface MediaAttachOptions {
  liveActive: () => boolean;
  liveVoice: {
    sendImage(b64: string, mimeType: string): void;
    startVideoStream(): Promise<void>;
  };
  conv: {
    setPendingImage(b64: string, mimeType: string): void;
  };
  onLiveStart?: () => void;
}

export function useMediaAttach(opts: MediaAttachOptions) {
  const { liveActive, liveVoice, conv } = opts;

  let cameraMenuOpen = $state(false);
  let cameraMenuEl: HTMLElement | undefined = $state();
  let webcamCaptureOpen = $state(false);

  function setCameraMenuAction(node: HTMLElement) {
    cameraMenuEl = node;
    return {
      update() {},
      destroy() {
        cameraMenuEl = undefined;
      }
    };
  }

  function handleImageSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      const mimeType = file.type;
      if (liveActive()) {
        liveVoice.sendImage(base64, mimeType);
        toasts.success("Image sent to agent");
      } else {
        conv.setPendingImage(base64, mimeType);
        toasts.success("Image attached");
      }
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  async function startVideoCall() {
    cameraMenuOpen = false;
    if (!liveActive()) {
      opts.onLiveStart?.();
    }
    try {
      await liveVoice.startVideoStream();
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Failed to start camera");
    }
  }

  function openWebcamCapture() {
    cameraMenuOpen = false;
    webcamCaptureOpen = true;
  }

  function closeWebcamCapture() {
    webcamCaptureOpen = false;
  }

  function onWebcamCapture(base64: string, mimeType: string) {
    if (liveActive()) {
      liveVoice.sendImage(base64, mimeType);
      toasts.success("Photo sent to agent");
    } else {
      conv.setPendingImage(base64, mimeType);
      toasts.success("Photo attached");
    }
    closeWebcamCapture();
  }

  function toggleCameraMenu() {
    cameraMenuOpen = !cameraMenuOpen;
  }

  function closeCameraMenu() {
    cameraMenuOpen = false;
  }

  return {
    get cameraMenuOpen() { return cameraMenuOpen; },
    set cameraMenuOpen(v: boolean) { cameraMenuOpen = v; },
    get cameraMenuEl() { return cameraMenuEl; },
    get webcamCaptureOpen() { return webcamCaptureOpen; },
    set webcamCaptureOpen(v: boolean) { webcamCaptureOpen = v; },
    setCameraMenuAction,
    handleImageSelect,
    startVideoCall,
    openWebcamCapture,
    closeWebcamCapture,
    onWebcamCapture,
    toggleCameraMenu,
    closeCameraMenu,
  };
}
