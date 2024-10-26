export interface ISpeed {
  ping: number;
  speedDownload: number;
  speedUpload: number;
}

export enum URL {
  checkSpeed = "/api/check-speed",
}
