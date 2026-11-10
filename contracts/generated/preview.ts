/* Generated from contracts/schemas/preview.schema.json. Do not edit. */

/**
 * Independent diagnostic image metadata. This frame is not necessarily the frame of the latest pose observation. Both timestamps use the same backend monotonic clock; exposure time is unknown.
 */
export interface PreviewFrame {
  version: 1;
  epoch: string;
  sequence: number;
  source: 'camera' | 'demo';
  image: {
    width: number;
    height: number;
  };
  capturedAtNs: string;
  clockDomain: 'host-monotonic';
  clockQuality: 'host-read-completion' | 'synthetic';
  captureFps: number;
}
