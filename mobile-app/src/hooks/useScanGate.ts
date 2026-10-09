import { useRef } from 'react';
import { createScanGate, type ScanGate } from '../utils/scanGate';

/**
 * One scan gate per mounted scanner; see utils/scanGate for the rules.
 * The identity is stable for the component's lifetime, so it is safe in
 * effect and callback dependencies.
 */
export const useScanGate = (): ScanGate => {
  const gate = useRef<ScanGate | null>(null);
  if (!gate.current) gate.current = createScanGate();
  return gate.current;
};
