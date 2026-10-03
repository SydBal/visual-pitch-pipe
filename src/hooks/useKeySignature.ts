import { useMemo } from 'react';
import { getKeySignatureName, getKeySignatureDisplayString } from '../utils/keySignatureName';
import type { KeySignatureAccidental, KeySignatureAccidentalCount } from '../types/musicTypes';

export function useKeySignature(keySignatureAccidentalType: KeySignatureAccidental, numberOfKeySignatureAccidentals: KeySignatureAccidentalCount) {
  const keySignature = useMemo(() => {
    return getKeySignatureName(keySignatureAccidentalType, numberOfKeySignatureAccidentals);
  }, [keySignatureAccidentalType, numberOfKeySignatureAccidentals]);

  const keySignatureDisplayString = useMemo(() => {
    return getKeySignatureDisplayString(keySignature);
  }, [keySignature]);

  return { keySignature, keySignatureDisplayString };
}
