
import { ISpeed } from "./types";

// расчет скорости интернет соединения
export const checkSpeed = async () => {
  let speed: ISpeed = {
    speedDownload: 120,
    speedUpload: 110,
    ping: 5,
  };

  return speed;
};