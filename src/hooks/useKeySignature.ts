import { useMemo } from 'react';
import KeySignatureMapping from '../data/keySignatureMapping';
import accidentalToDisplayCharacter from '../data/accidentalToDisplayCharacter';
import type { KeySignatureAccidental, KeySignatureAccidentalCount } from '../types/musicTypes';

export function useKeySignature(keySignatureAccidentalType: KeySignatureAccidental, numberOfKeySignatureAccidentals: KeySignatureAccidentalCount) {
  const keySignature = useMemo(() => {
    return KeySignatureMapping[keySignatureAccidentalType][numberOfKeySignatureAccidentals];
  }, [keySignatureAccidentalType, numberOfKeySignatureAccidentals]);

  const keySignatureDisplayString = useMemo(() => {
    let displayString = keySignature;
    Object.entries(accidentalToDisplayCharacter).forEach(([accidentalKey, accidentalCharacter]) => {
      displayString = displayString.replace(accidentalKey, accidentalCharacter);
    });
    return displayString;
  }, [keySignature]);

  return { keySignature, keySignatureDisplayString };
}
