// Copyright (C) 2012-2023 John Nesky and contributing authors, distributed under the MIT license, see the accompanying LICENSE.md file.

import { Config } from "../synth/SynthConfig";
import { Note, Pattern } from "../synth/synth";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { ChangeGroup } from "./Change";
import { ChangeEnsurePatternExists, ChangeInsertBars, ChangeNoteAdded, ChangeNoteTruncate, ChangePatternNumbers, ChangeSetPatternInstruments } from "./changes";

const { button, div, h2, textarea } = HTML;

interface ParsedChord {
    pitches: number[];
}

interface ParsedBar {
    chords: ParsedChord[];
}

interface ParseSuccess {
    bars: ParsedBar[];
}

interface ParseFailure {
    reason: string;
    index: number;
}

type ParseResult = ParseSuccess | ParseFailure;

const noteRoots: { [name: string]: number } = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
};

const romanRoots: { [name: string]: number } = {
    "I": 0,
    "II": 1,
    "III": 2,
    "IV": 3,
    "V": 4,
    "VI": 5,
    "VII": 6,
};

const chordIntervals: { [quality: string]: number[] } = {
    "": [0, 4, 7],
    "maj": [0, 4, 7],
    "Major": [0, 4, 7],
    "M": [0, 4, 7],
    "min": [0, 3, 7],
    "Minor": [0, 3, 7],
    "m": [0, 3, 7],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "6": [0, 4, 7, 9],
    "maj6": [0, 4, 7, 9],
    "Major6th": [0, 4, 7, 9],
    "M6": [0, 4, 7, 9],
    "min6": [0, 3, 7, 9],
    "Minor6th": [0, 3, 7, 9],
    "m6": [0, 3, 7, 9],
    "aug": [0, 4, 8],
    "Augmented": [0, 4, 8],
    "+": [0, 4, 8],
    "dim": [0, 3, 6],
    "Diminished": [0, 3, 6],
    "o": [0, 3, 6],
    "maj7": [0, 4, 7, 11],
    "Major7": [0, 4, 7, 11],
    "M7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "Minor7": [0, 3, 7, 10],
    "m7": [0, 3, 7, 10],
    "7": [0, 4, 7, 10],
    "dom7": [0, 4, 7, 10],
    "Dom7": [0, 4, 7, 10],
    "dim7": [0, 3, 6, 9],
    "Dim7": [0, 3, 6, 9],
    "o7": [0, 3, 6, 9],
    "minmaj7": [0, 3, 7, 11],
    "mmaj7": [0, 3, 7, 11],
    "minMaj7": [0, 3, 7, 11],
    "MinMaj7": [0, 3, 7, 11],
    "mMaj7": [0, 3, 7, 11],
    "5": [0, 7],
    "Power": [0, 7],
    "dyad5": [0, 7],
    "majdyad": [0, 4],
    "majorDyad": [0, 4],
    "MajorDyad": [0, 4],
    "Mdyad": [0, 4],
    "mindyad": [0, 3],
    "minorDyad": [0, 3],
    "MinorDyad": [0, 3],
    "mdyad": [0, 3],
    "9": [0, 4, 7, 10, 14],
    "maj9": [0, 4, 7, 11, 14],
    "Major9": [0, 4, 7, 11, 14],
    "M9": [0, 4, 7, 11, 14],
    "min9": [0, 3, 7, 10, 14],
    "Minor9": [0, 3, 7, 10, 14],
    "m9": [0, 3, 7, 10, 14],
    "7#5": [0, 4, 8, 10],
    "7b13": [0, 4, 8, 10],
    "7+5": [0, 4, 8, 10],
    "maj7#5": [0, 4, 8, 11],
    "M7#5": [0, 4, 8, 11],
    "min7#5": [0, 3, 8, 10],
    "m7#5": [0, 3, 8, 10],
    "11": [0, 4, 7, 10, 14, 17],
    "maj11": [0, 4, 7, 11, 14, 17],
    "Major11": [0, 4, 7, 11, 14, 17],
    "M11": [0, 4, 7, 11, 14, 17],
    "min11": [0, 3, 7, 10, 14, 17],
    "Minor11": [0, 3, 7, 10, 14, 17],
    "m11": [0, 3, 7, 10, 14, 17],
    "13": [0, 4, 7, 10, 14, 17, 21],
    "maj13": [0, 4, 7, 11, 14, 17, 21],
    "Major13": [0, 4, 7, 11, 14, 17, 21],
    "M13": [0, 4, 7, 11, 14, 17, 21],
    "min13": [0, 3, 7, 10, 14, 17, 21],
    "Minor13": [0, 3, 7, 10, 14, 17, 21],
    "m13": [0, 3, 7, 10, 14, 17, 21],
};

function pitchModulo(pitch: number): number {
    return (pitch % Config.pitchesPerOctave + Config.pitchesPerOctave) % Config.pitchesPerOctave;
}

function getScaleFlags(doc: SongDocument): ReadonlyArray<boolean> {
    return doc.song.scale == Config.scales.dictionary["Custom"].index ? doc.song.scaleCustom : Config.scales[doc.song.scale].flags;
}

function getScaleDegreePitch(doc: SongDocument, degree: number): number | null {
    const scaleFlags: ReadonlyArray<boolean> = getScaleFlags(doc);
    const degrees: number[] = [];
    for (let i: number = 0; i < Config.pitchesPerOctave; i++) {
        if (scaleFlags[i]) degrees.push(i);
    }
    if (degrees.length == 0) return null;
    return degrees[degree % degrees.length] + 12 * Math.floor(degree / degrees.length);
}

function visualToStoredPitch(doc: SongDocument, visualPitch: number): number {
    return visualPitch - Config.keys[doc.song.key].basePitch + Config.keys[doc.song.visualKey].basePitch;
}

function normalizeQuality(rawQuality: string, minorRoman: boolean): string | null {
    if (rawQuality.startsWith("(") && rawQuality.endsWith(")")) return null;
    if (rawQuality == "maj" || rawQuality == "M") return "maj";
    if (rawQuality == "min" || rawQuality == "m") return "min";
    if (rawQuality == "maj6" || rawQuality == "M6") return "maj6";
    if (rawQuality == "min6" || rawQuality == "m6") return "min6";
    if (rawQuality == "maj7" || rawQuality == "M7") return "maj7";
    if (rawQuality == "min7" || rawQuality == "m7") return "min7";
    if (rawQuality == "dom7") return "7";
    if (rawQuality == "maj9" || rawQuality == "M9") return "maj9";
    if (rawQuality == "min9" || rawQuality == "m9") return "min9";
    if (rawQuality == "maj11" || rawQuality == "M11") return "maj11";
    if (rawQuality == "min11" || rawQuality == "m11") return "min11";
    if (rawQuality == "maj13" || rawQuality == "M13") return "maj13";
    if (rawQuality == "min13" || rawQuality == "m13") return "min13";
    if (rawQuality == "minMaj7" || rawQuality == "mMaj7" || rawQuality == "minmaj7" || rawQuality == "mmaj7") return "minMaj7";
    if (rawQuality == "power") return "5";
    if (rawQuality == "majorDyad") return "majdyad";
    if (rawQuality == "minorDyad") return "mindyad";
    if (rawQuality == "b9") return minorRoman ? "min7(b9)" : "7(b9)";
    return rawQuality;
}

function intervalsForQuality(rawQuality: string, minorRoman: boolean): number[] | null {
    const normalized: string | null = normalizeQuality(rawQuality, minorRoman);
    if (normalized == null) return null;
    if (normalized == "7(b9)") return [0, 4, 7, 10, 13];
    if (normalized == "min7(b9)") return [0, 3, 7, 10, 13];
    if (chordIntervals[normalized] != undefined) return chordIntervals[normalized];
    if (minorRoman && rawQuality == "") return chordIntervals["min"];
    return null;
}

function parseChordToken(doc: SongDocument, token: string, tokenStart: number): ParsedChord | ParseFailure {
    let index: number = 0;
    let accidental: number = 0;
    while (token.charAt(index) == "b" || token.charAt(index) == "#") {
        accidental += token.charAt(index) == "b" ? -1 : 1;
        index++;
    }

    let rootSemitone: number | null = null;
    let rootLength: number = 0;
    let minorRoman: boolean = false;

    const noteMatch: RegExpMatchArray | null = token.substring(index).match(/^[A-G](?:bb|b|##|#)?/);
    if (noteMatch != null) {
        const root: string = noteMatch[0];
        rootSemitone = noteRoots[root.charAt(0)];
        for (let i: number = 1; i < root.length; i++) {
            rootSemitone += root.charAt(i) == "b" ? -1 : 1;
        }
        rootLength = root.length;
    } else {
        const romanMatch: RegExpMatchArray | null = token.substring(index).match(/^(?:VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)/);
        if (romanMatch == null) return { reason: "Unknown chord root", index: tokenStart + index };
        const roman: string = romanMatch[0];
        minorRoman = roman == roman.toLowerCase();
        const degree: number = romanRoots[roman.toUpperCase()];
        const degreePitch: number | null = getScaleDegreePitch(doc, degree);
        if (degreePitch == null) return { reason: "Selected scale has no notes", index: tokenStart + index };
        rootSemitone = Config.keys[doc.song.visualKey].basePitch + degreePitch;
        rootLength = roman.length;
    }

    index += rootLength;
    rootSemitone += accidental;

    let quality: string = token.substring(index);
    if (quality.startsWith("(")) return { reason: "Missing chord quality before alteration", index: tokenStart + index };
    const alterationMatch: RegExpMatchArray | null = quality.match(/^(.*)\(([^)]+)\)$/);
    let alteration: string | null = null;
    if (alterationMatch != null) {
        quality = alterationMatch[1];
        alteration = alterationMatch[2];
    } else if (quality.indexOf("(") >= 0 || quality.indexOf(")") >= 0) {
        return { reason: "Bad alteration parentheses", index: tokenStart + index + Math.max(0, quality.indexOf("(")) };
    }

    let intervals: number[] | null = intervalsForQuality(quality, minorRoman);
    if (intervals == null) return { reason: "Unknown chord quality", index: tokenStart + index };
    intervals = intervals.concat();

    if (alteration != null) {
        if (alteration == "b9") {
            if (intervals.indexOf(13) == -1) intervals.push(13);
        } else if (alteration == "#5" || alteration == "+5") {
            intervals = intervals.map(interval => pitchModulo(interval) == 7 ? interval + 1 : interval);
        } else {
            return { reason: "Unknown chord alteration", index: tokenStart + token.length - alteration.length - 1 };
        }
    }

    const rootOctave: number = 3 * Config.pitchesPerOctave;
    const storedPitches: number[] = [];
    for (const interval of intervals) {
        let visualPitch: number = rootOctave + rootSemitone + interval;
        while (visualPitch < 0) visualPitch += Config.pitchesPerOctave;
        while (visualPitch > Config.maxPitch) visualPitch -= Config.pitchesPerOctave;
        const storedPitch: number = visualToStoredPitch(doc, visualPitch);
        if (storedPitch < 0 || storedPitch > Config.maxPitch) return { reason: "Chord pitch out of range", index: tokenStart };
        if (storedPitches.indexOf(storedPitch) == -1) storedPitches.push(storedPitch);
    }

    storedPitches.sort((a, b) => a - b);
    return { pitches: storedPitches };
}

function parseProgression(doc: SongDocument, text: string): ParseResult {
    const trimmedEnd: number = text.search(/\s*$/);
    const end: number = trimmedEnd < 0 ? text.length : trimmedEnd;
    let index: number = 0;
    while (index < end && /\s/.test(text.charAt(index))) index++;
    if (index >= end) return { reason: "Empty progression", index: 0 };

    const bars: ParsedBar[] = [{ chords: [] }];
    let expectChord: boolean = true;
    while (index < end) {
        if (text.charAt(index) == " ") {
            index++;
            continue;
        }
        if (/\s/.test(text.charAt(index))) return { reason: "Use spaces only", index: index };

        const tokenStart: number = index;
        while (index < end && text.charAt(index) != " " && !/\s/.test(text.charAt(index))) index++;
        const token: string = text.substring(tokenStart, index);
        if (token == "|") {
            if (expectChord || bars[bars.length - 1].chords.length == 0) return { reason: "Empty bar", index: tokenStart };
            bars.push({ chords: [] });
            expectChord = true;
            continue;
        }
        if (token.indexOf("|") >= 0) return { reason: "Put spaces around |", index: tokenStart + token.indexOf("|") };
        const chord: ParsedChord | ParseFailure = parseChordToken(doc, token, tokenStart);
        if ("reason" in chord) return chord;
        bars[bars.length - 1].chords.push(chord);
        expectChord = false;
    }

    if (bars[bars.length - 1].chords.length == 0) return { reason: "Empty bar", index: Math.max(0, end - 1) };
    return { bars: bars };
}

function makeChordNote(pitches: number[], start: number, end: number): Note {
    const note: Note = new Note(pitches[0], start, end, Config.noteSizeMax, false);
    note.pitches = pitches.concat();
    return note;
}

export class ChordProgressionPrompt implements Prompt {
    private readonly _textArea: HTMLTextAreaElement = textarea({
        style: "width: 100%; height: 12em; resize: vertical;",
        spellcheck: "false",
    }, "Cmaj9 Fmin9 Db9 | bII9 Emin7(b9) IVmaj9 ivmin9");
    private readonly _errorText: HTMLDivElement = div({ style: "color: #ff6666; text-align: right; flex: 1; padding-right: 1em;" });
    private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width: 45%;" }, "Okay");
    private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });

    public readonly container: HTMLDivElement = div({ class: "prompt noSelection", style: "width: 600px;" },
        h2("Write Chord Progression"),
        this._textArea,
        div({ style: "display: flex; flex-direction: row; align-items: center; justify-content: flex-end;" },
            this._errorText,
            this._okayButton,
        ),
        this._cancelButton,
    );

    constructor(private _doc: SongDocument) {
        this._okayButton.addEventListener("click", this._saveChanges);
        this._cancelButton.addEventListener("click", this._close);
        this.container.addEventListener("keydown", this._whenKeyPressed);
        setTimeout(() => this._textArea.focus());
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._saveChanges);
        this._cancelButton.removeEventListener("click", this._close);
        this.container.removeEventListener("keydown", this._whenKeyPressed);
    }

    private _close = (): void => {
        this._doc.undo();
    }

    private _showError(error: ParseFailure): void {
        this._errorText.textContent = "Invalid! " + error.reason;
        this._textArea.focus();
        this._textArea.setSelectionRange(error.index, error.index);
    }

    private _saveChanges = (): void => {
        const parsed: ParseResult = parseProgression(this._doc, this._textArea.value);
        if ("reason" in parsed) {
            this._showError(parsed);
            return;
        }
        if (this._doc.song.getChannelIsNoise(this._doc.channel) || this._doc.song.getChannelIsMod(this._doc.channel)) {
            this._showError({ reason: "Use a pitch channel", index: 0 });
            return;
        }

        this._doc.prompt = null;

        const group: ChangeGroup = new ChangeGroup();
        const channelIndex: number = this._doc.channel;
        const firstBar: number = this._doc.bar;
        const startPart: number = this._doc.selection.patternSelectionActive ? this._doc.selection.patternSelectionStart : 0;
        const partsPerBar: number = Config.partsPerBeat * this._doc.song.beatsPerBar;
        const lastBar: number = firstBar + parsed.bars.length;

        if (lastBar > this._doc.song.barCount) {
            group.append(new ChangeInsertBars(this._doc, this._doc.song.barCount, lastBar - this._doc.song.barCount));
        }

        for (let barOffset: number = 0; barOffset < parsed.bars.length; barOffset++) {
            const bar: number = firstBar + barOffset;
            const oldPattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
            const instruments: number[] = oldPattern == null ? this._doc.recentPatternInstruments[channelIndex].concat() : oldPattern.instruments.concat();
            const barStartPart: number = barOffset == 0 ? startPart : 0;
            const barEndPart: number = partsPerBar;
            const barLength: number = barEndPart - barStartPart;
            const chords: ParsedChord[] = parsed.bars[barOffset].chords;

            group.append(new ChangePatternNumbers(this._doc, 0, bar, channelIndex, 1, 1));
            group.append(new ChangeEnsurePatternExists(this._doc, channelIndex, bar));
            const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
            if (pattern == null) throw new Error("Couldn't create new pattern");
            group.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instruments, pattern));
            group.append(new ChangeNoteTruncate(this._doc, pattern, barStartPart, barEndPart, null, true));

            for (let chordIndex: number = 0; chordIndex < chords.length; chordIndex++) {
                const start: number = barStartPart + Math.round(barLength * chordIndex / chords.length);
                const end: number = barStartPart + Math.round(barLength * (chordIndex + 1) / chords.length);
                if (end <= start) continue;
                group.append(new ChangeNoteAdded(this._doc, pattern, makeChordNote(chords[chordIndex].pitches, start, end), pattern.notes.length));
            }
        }

        this._doc.record(group, true);
    }

    private _whenKeyPressed = (event: KeyboardEvent): void => {
        if (event.keyCode == 27) {
            this._close();
            event.preventDefault();
        } else if (event.keyCode == 13 && !event.shiftKey) {
            this._saveChanges();
            event.preventDefault();
        }
    }
}
