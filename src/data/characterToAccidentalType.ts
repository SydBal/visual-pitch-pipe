// Maps display accidental characters to their accidental type string for note name construction
const characterToAccidentalType: Record<string, string> = {
  '♯': '#',
  '♭': 'b',
  '♮': 'n',
  '': '', // for natural/no accidental
};

export default characterToAccidentalType;
