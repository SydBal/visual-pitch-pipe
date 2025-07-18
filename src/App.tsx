import { useRef, useEffect } from 'react';
import { Renderer, Stave, StaveNote, Formatter, Accidental, Beam } from 'vexflow';
import { usePitchPipeState } from './hooks/usePitchPipeState';
import KeySignatureMapping from './data/keySignatureMapping';
import KeySignatureDropdown from './components/KeySignatureDropdown';
import characterToAccidentalType from './data/characterToAccidentalType';
import { playNote } from './audio/note';
import type { StaffPosition, NoteAccidental, ClefType, KeySignatureAccidentalCount, KeySignatureAccidental, KeySignatureName } from './types/musicTypes';
import './App.css'

function App() {
  const {
    noteLocation, setNoteLocation,
    noteAccidentalType, setNoteAccidentalType,
    clef, setClef,
    numberOfKeySignatureAccidentals, setNumberOfKeySignatureAccidentals,
    keySignatureAccidentalType, setKeySignatureAccidentalType,
    keySignature,
    noteLocationName,
    calculatedNote,
    calculatedNoteOctave,
    calculatedNoteAccidental,
  } = usePitchPipeState();

  const containerRef = useRef<HTMLDivElement>(null);

  const handleNoteLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNoteLocation(event.target.value as StaffPosition);
  };

  const handleNoteAccidentalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNoteAccidentalType(event.target.value as NoteAccidental);
  };

  const handleClefChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setClef(event.target.value as ClefType);
  };

  const handleKeySignatureNumberOfAccidentalsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNumberOfKeySignatureAccidentals(event.target.value as KeySignatureAccidentalCount);
  };

  const handleKeySignatureAccientalTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setKeySignatureAccidentalType(event.target.value as KeySignatureAccidental);
  };

  const handleKeySignatureChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    // Find the accidental type and number of accidentals for the selected key
    const selectedKey = event.target.value as KeySignatureName;
    // Find accidental type and count by searching KeySignatureMapping
    let found = false;
    for (const accidentalType of Object.keys(KeySignatureMapping) as KeySignatureAccidental[]) {
      for (const count of Object.keys(KeySignatureMapping[accidentalType]) as KeySignatureAccidentalCount[]) {
        if (KeySignatureMapping[accidentalType][count] === selectedKey) {
          setKeySignatureAccidentalType(accidentalType);
          setNumberOfKeySignatureAccidentals(count);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  };

  const handlePlayButtonClick = () => {
    // Compose note name with accidental using the mapping
    let noteName = calculatedNote;
    const accidentalSymbol = characterToAccidentalType[calculatedNoteAccidental] || '';
    if (accidentalSymbol === '#' || accidentalSymbol === 'b') {
      noteName = `${calculatedNote}${accidentalSymbol}`;
    } else {
      noteName = calculatedNote;
    }
    const octave = parseInt(calculatedNoteOctave);
    playNote(noteName, octave);
  };

  // Redraw the stave and note whenever the relevant state changes
  // This includes the clef, note location, note accidental type, number of key signature
  // accidentals, and key signature accidental type.
  const defaultStaveHeight = 200;
  useEffect(() => {
    if (containerRef.current) {
      // Clear the container of any previous content
      containerRef.current.innerHTML = '';

      // Create an SVG renderer and attach it
      const renderer = new Renderer(containerRef.current.id, Renderer.Backends.SVG);

      // Configure the rendering context.
      // initial width is set to 1 to allow dynamic resizing
      renderer.resize(1, defaultStaveHeight);
      const context = renderer.getContext();

      // Create a stave
      // initial width is set to 0 to allow dynamic resizing
      const staveOptions = {
        leftBar: true,
        rightBar: true,
      }
      const stave = new Stave(0, 40, 0, staveOptions);

      // Add a clef and time signature.
      stave.addClef(clef);

      stave.addKeySignature(keySignature);

      // Create a note at the specified location
      const note = new StaveNote({
        clef,
        keys: [noteLocationName],
        duration: 'q',
      });

      // Add the accidental to the note if it is not 'none'
      if (noteAccidentalType !== 'none') {
        note.addModifier(new Accidental(noteAccidentalType));
      }

      // Format the beam for the note
      Beam.generateBeams([note]);

      // First draw the zero width stave with the note
      Formatter.FormatAndDraw(context, stave, [note]);
      stave.setContext(context).draw();

      // Get the location of the note's right 
      const noteRightEdgeX = note.getAbsoluteX() - note.getX() + note.getWidth();

      // Resize the stave and canvas to fit the note loaction
      const notePadding = 12;
      stave.setWidth(noteRightEdgeX + notePadding);

      // Clear the container of any previous content and redraw and render
      context.clear();
      Formatter.FormatAndDraw(context, stave, [note]);
      stave.setContext(context).draw();
      // + 1 padding to avoid any overflow rendering issues
      renderer.resize(noteRightEdgeX + notePadding + 1, defaultStaveHeight);
    }
  }, [
    clef,
    noteLocation,
    noteAccidentalType,
    numberOfKeySignatureAccidentals,
    keySignatureAccidentalType
  ]);

  return (
    <>
      <h1>Visual Pitch Pipe</h1>
      <div className='clef-controls'>
        <label>Cleft: </label>
        <select defaultValue='treble' onChange={handleClefChange}>
          <option value='treble'>Treble</option>
          <option value='bass'>Bass</option>
          <option value='alto'>Alto</option>
          <option value='tenor'>Tenor</option>
        </select>
      </div>
      <div className="key-signature-controls">
        <div className='key-signature-controls-accidental-type'>
          <label>Key Signature Accidental Type: </label>
          <select value={keySignatureAccidentalType} onChange={handleKeySignatureAccientalTypeChange}>
            <option value='sharp'>Sharp</option>
            <option value='flat'>Flat</option>
          </select>
        </div>
        <div className='key-signature-controls-number-of-accidentals'>
          <label>Key Signature Number of Accidentals: </label>
          <select value={numberOfKeySignatureAccidentals} onChange={handleKeySignatureNumberOfAccidentalsChange}>
            <option value='0'>0</option>
            <option value='1'>1</option>
            <option value='2'>2</option>
            <option value='3'>3</option>
            <option value='4'>4</option>
            <option value='5'>5</option>
            <option value='6'>6</option>
            <option value='7'>7</option>
          </select>
        </div>
        <div className='key-signature-controls-key'>
          <label>Key: </label>
          <KeySignatureDropdown value={keySignature} onChange={handleKeySignatureChange} />
        </div>
      </div>
      <div className='stave-container'>
        <div ref={containerRef} id='stave-visualization' style={{ height: defaultStaveHeight }}></div>
      </div>
      <div className='note-name'>
        Note Name: {calculatedNote}{calculatedNoteAccidental}<sub>{calculatedNoteOctave}</sub>
      </div>
      <div className='note-controls'>
        <div className='note-controls-location'>
          <label>Note Location: </label>
          {/* 
            The range is set from -14 to 20 to match the NoteLocationMapping keys.
            Adjusted the max value to 20 to match the highest note in the mapping to prevent overflow.
          */}
          <input type='range' min='-14' max='20' step='1' value={noteLocation} onChange={handleNoteLocationChange} />
        </div>
        <div className='note-controls-accidental'>
          <label>Note Accidental: </label>
          <select defaultValue='none' onChange={handleNoteAccidentalChange}>
            <option value='none'>None</option>
            <option value='#'>Sharp</option>
            <option value='b'>Flat</option>
            <option value='n'>Natural</option>
          </select>
        </div>

      </div>
      <div className='play-pitch'>
        <button onClick={handlePlayButtonClick}>Play Pitch</button>
      </div>
    </>
  )
}

export default App
