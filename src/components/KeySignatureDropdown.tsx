import type { KeySignatureAccidental, KeySignatureName } from '../types/musicTypes';
import KeySignatureMapping from '../data/keySignatureMapping';
import React from 'react';

interface KeySignatureDropdownProps {
  value: KeySignatureName;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const KeySignatureDropdown: React.FC<KeySignatureDropdownProps> = ({ value, onChange }) => {
  return (
    <select value={value} onChange={onChange}>
      <option key="C" value="C">C</option>
      {Object.keys(KeySignatureMapping).map((accidentalType) => [
        // Add a disabled option for the accidental type
        <option key={accidentalType} disabled>{accidentalType.charAt(0).toUpperCase() + accidentalType.slice(1)}</option>,
        // Map through the key signatures for this accidental type
        ...Object.values(KeySignatureMapping[accidentalType as KeySignatureAccidental])
          .filter((name) => name !== 'C')
          .map((name) => (
            <option key={name} value={name}>{name}</option>
          ))
      ])}
    </select>
  );
};

export default KeySignatureDropdown;
