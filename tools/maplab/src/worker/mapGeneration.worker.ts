/// <reference lib="webworker" />
import { generateMapLabResult, type MapLabGenerateRequest } from '../generatorAdapter';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MapLabGenerateRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<MapLabGenerateRequest>) => {
  const result = generateMapLabResult(event.data);
  const transfer: Transferable[] = [];
  if (result.arena) transfer.push(result.arena.arena.heightfield.samples.buffer);
  scope.postMessage(result, transfer);
};
