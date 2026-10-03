import KeySignatureMapping from '../data/keySignatureMapping';
import accidentalToDisplayCharacter from '../data/accidentalToDisplayCharacter';
import type {
  KeySignatureAccidental,
  KeySignatureAccidentalCount,
  KeySignatureName,
} from '../types/musicTypes';

/** Pure key-signature helpers shared by manual and camera modes. */
export function getKeySignatureName(
  accidentalType: KeySignatureAccidental,
  count: KeySignatureAccidentalCount
): KeySignatureName {
  return KeySignatureMapping[accidentalType][count];
}

export function getKeySignatureDisplayString(keySignature: string): string {
  let displayString = keySignature;
  Object.entries(accidentalToDisplayCharacter).forEach(([accidentalKey, accidentalCharacter]) => {
    displayString = displayString.replace(accidentalKey, accidentalCharacter);
  });
  return displayString;
}

/** Inverse of getKeySignatureName: 'Eb' -> { type: 'flat', count: '3' }. */
export function parseKeySignatureName(name: KeySignatureName): {
  type: KeySignatureAccidental;
  count: KeySignatureAccidentalCount;
} {
  const types: KeySignatureAccidental[] = ['sharp', 'flat'];
  for (const type of types) {
    const entries = Object.entries(KeySignatureMapping[type]) as [KeySignatureAccidentalCount, string][];
    for (const [count, keyName] of entries) {
      if (keyName === name) return { type, count };
    }
  }
  return { type: 'sharp', count: '0' };
}
