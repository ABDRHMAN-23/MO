import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

export class BarcodeScanner {
  private reader = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;

  async start(video: HTMLVideoElement, onResult: (value: string) => void, onError?: (error: unknown) => void) {
    this.stop();
    this.controls = await this.reader.decodeFromVideoDevice(undefined, video, (result, error) => {
      if (result) {
        onResult(result.getText());
        return;
      }
      if (error && !(error instanceof Error && error.name === "NotFoundException")) onError?.(error);
    });
  }

  stop() {
    this.controls?.stop();
    this.controls = null;
  }
}
