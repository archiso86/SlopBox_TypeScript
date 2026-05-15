// Copyright (C) 2012-2023 John Nesky and contributing authors, distributed under the MIT license, see the accompanying LICENSE.md file.

import { Config } from "../synth/SynthConfig";
import { Note, Pattern } from "../synth/synth";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { ChangeGroup } from "./Change";
import { ChangeEnsurePatternExists, ChangeInsertBars, ChangeNoteAdded, ChangeNoteTruncate, ChangePatternNumbers, ChangeSetPatternInstruments } from "./changes";
import { ColorConfig } from "./ColorConfig";

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

interface ParsedRoot {
    semitone: number;
    length: number;
    minorRoman: boolean;
    roman: boolean;
}

interface ParsedQuality {
    quality: string;
    modifiers: string[];
    bassInterval: number | null;
}

interface ParsedModifierInterval {
    interval: number;
    naturalInterval: number;
}

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
    "VIII": 7,
    "IX": 8,
    "X": 9,
    "XI": 10,
    "XII": 11,
};

const chordIntervals: { [quality: string]: number[] } = {
    "": [0, 4, 7],
    "maj": [0, 4, 7],
    "Maj": [0, 4, 7],
    "ma": [0, 4, 7],
    "Major": [0, 4, 7],
    "M": [0, 4, 7],
    "Δ": [0, 4, 7],
    "∆": [0, 4, 7],
    "△": [0, 4, 7],
    "min": [0, 3, 7],
    "Minor": [0, 3, 7],
    "mi": [0, 3, 7],
    "m": [0, 3, 7],
    "-": [0, 3, 7],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "add2": [0, 2, 4, 7],
    "add9": [0, 4, 7, 14],
    "madd9": [0, 3, 7, 14],
    "minadd9": [0, 3, 7, 14],
    "miadd9": [0, 3, 7, 14],
    "-add9": [0, 3, 7, 14],
    "add4": [0, 4, 5, 7],
    "add11": [0, 4, 7, 17],
    "add13": [0, 4, 7, 21],
    "6": [0, 4, 7, 9],
    "69": [0, 4, 7, 9, 14],
    "6/9": [0, 4, 7, 9, 14],
    "maj6": [0, 4, 7, 9],
    "Major6th": [0, 4, 7, 9],
    "M6": [0, 4, 7, 9],
    "maj69": [0, 4, 7, 9, 14],
    "maj6/9": [0, 4, 7, 9, 14],
    "min6": [0, 3, 7, 9],
    "Minor6th": [0, 3, 7, 9],
    "m6": [0, 3, 7, 9],
    "min69": [0, 3, 7, 9, 14],
    "min6/9": [0, 3, 7, 9, 14],
    "m69": [0, 3, 7, 9, 14],
    "m6/9": [0, 3, 7, 9, 14],
    "aug": [0, 4, 8],
    "Augmented": [0, 4, 8],
    "+": [0, 4, 8],
    "+7": [0, 4, 8, 10],
    "aug7": [0, 4, 8, 10],
    "dim": [0, 3, 6],
    "Diminished": [0, 3, 6],
    "o": [0, 3, 6],
    "°": [0, 3, 6],
    "º": [0, 3, 6],
    "maj7": [0, 4, 7, 11],
    "Maj7": [0, 4, 7, 11],
    "ma7": [0, 4, 7, 11],
    "Major7": [0, 4, 7, 11],
    "M7": [0, 4, 7, 11],
    "Δ7": [0, 4, 7, 11],
    "∆7": [0, 4, 7, 11],
    "△7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "Minor7": [0, 3, 7, 10],
    "mi7": [0, 3, 7, 10],
    "m7": [0, 3, 7, 10],
    "-7": [0, 3, 7, 10],
    "7": [0, 4, 7, 10],
    "dom7": [0, 4, 7, 10],
    "Dom7": [0, 4, 7, 10],
    "m7b5": [0, 3, 6, 10],
    "min7b5": [0, 3, 6, 10],
    "halfdim7": [0, 3, 6, 10],
    "⦰": [0, 3, 6, 10],
    "ø": [0, 3, 6, 10],
    "⦰7": [0, 3, 6, 10],
    "ø7": [0, 3, 6, 10],
    "dim7": [0, 3, 6, 9],
    "Dim7": [0, 3, 6, 9],
    "o7": [0, 3, 6, 9],
    "°7": [0, 3, 6, 9],
    "º7": [0, 3, 6, 9],
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
    "Maj9": [0, 4, 7, 11, 14],
    "ma9": [0, 4, 7, 11, 14],
    "Major9": [0, 4, 7, 11, 14],
    "M9": [0, 4, 7, 11, 14],
    "Δ9": [0, 4, 7, 11, 14],
    "∆9": [0, 4, 7, 11, 14],
    "△9": [0, 4, 7, 11, 14],
    "min9": [0, 3, 7, 10, 14],
    "Minor9": [0, 3, 7, 10, 14],
    "mi9": [0, 3, 7, 10, 14],
    "m9": [0, 3, 7, 10, 14],
    "-9": [0, 3, 7, 10, 14],
    "7b5": [0, 4, 6, 10],
    "7#5": [0, 4, 8, 10],
    "7b9": [0, 4, 7, 10, 13],
    "7#9": [0, 4, 7, 10, 15],
    "7b13": [0, 4, 7, 10, 20],
    "7+5": [0, 4, 8, 10],
    "7#11": [0, 4, 7, 10, 18],
    "7alt": [0, 4, 8, 10, 13, 15],
    "9#11": [0, 4, 7, 10, 14, 18],
    "maj7#5": [0, 4, 8, 11],
    "maj7#11": [0, 4, 7, 11, 18],
    "M7#5": [0, 4, 8, 11],
    "M7#11": [0, 4, 7, 11, 18],
    "min7#5": [0, 3, 8, 10],
    "m7#5": [0, 3, 8, 10],
    "11": [0, 4, 7, 10, 14, 17],
    "maj11": [0, 4, 7, 11, 14, 17],
    "Maj11": [0, 4, 7, 11, 14, 17],
    "ma11": [0, 4, 7, 11, 14, 17],
    "Major11": [0, 4, 7, 11, 14, 17],
    "M11": [0, 4, 7, 11, 14, 17],
    "Δ11": [0, 4, 7, 11, 14, 17],
    "∆11": [0, 4, 7, 11, 14, 17],
    "△11": [0, 4, 7, 11, 14, 17],
    "min11": [0, 3, 7, 10, 14, 17],
    "Minor11": [0, 3, 7, 10, 14, 17],
    "mi11": [0, 3, 7, 10, 14, 17],
    "m11": [0, 3, 7, 10, 14, 17],
    "-11": [0, 3, 7, 10, 14, 17],
    "13": [0, 4, 7, 10, 14, 17, 21],
    "maj13": [0, 4, 7, 11, 14, 17, 21],
    "Maj13": [0, 4, 7, 11, 14, 17, 21],
    "ma13": [0, 4, 7, 11, 14, 17, 21],
    "Major13": [0, 4, 7, 11, 14, 17, 21],
    "M13": [0, 4, 7, 11, 14, 17, 21],
    "Δ13": [0, 4, 7, 11, 14, 17, 21],
    "∆13": [0, 4, 7, 11, 14, 17, 21],
    "△13": [0, 4, 7, 11, 14, 17, 21],
    "min13": [0, 3, 7, 10, 14, 17, 21],
    "Minor13": [0, 3, 7, 10, 14, 17, 21],
    "mi13": [0, 3, 7, 10, 14, 17, 21],
    "m13": [0, 3, 7, 10, 14, 17, 21],
    "-13": [0, 3, 7, 10, 14, 17, 21],
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

function trimChordPitches(pitches: number[]): number[] {
    return pitches.slice(0, Config.maxChordSize);
}

function accidentalValue(char: string): number | null {
    if (char == "b" || char == "♭") return -1;
    if (char == "#" || char == "♯") return 1;
    return null;
}

function normalizeQuality(rawQuality: string, minorRoman: boolean): string | null {
    if (rawQuality.startsWith("(") && rawQuality.endsWith(")")) return null;
    if (rawQuality == "sus") return "sus4";
    if (rawQuality == "maj" || rawQuality == "Maj" || rawQuality == "ma" || rawQuality == "M" || rawQuality == "Δ" || rawQuality == "∆" || rawQuality == "△") return "maj";
    if (rawQuality == "min" || rawQuality == "mi" || rawQuality == "m" || rawQuality == "-") return "min";
    if (rawQuality == "maj6" || rawQuality == "M6") return "maj6";
    if (rawQuality == "min6" || rawQuality == "m6" || rawQuality == "-6") return "min6";
    if (rawQuality == "maj7" || rawQuality == "Maj7" || rawQuality == "ma7" || rawQuality == "M7" || rawQuality == "Δ7" || rawQuality == "∆7" || rawQuality == "△7") return "maj7";
    if (rawQuality == "min7" || rawQuality == "mi7" || rawQuality == "m7" || rawQuality == "-7") return "min7";
    if (rawQuality == "dom7") return "7";
    if (rawQuality == "min7b5" || rawQuality == "m7b5" || rawQuality == "-7b5" || rawQuality == "ø" || rawQuality == "⦰" || rawQuality == "ø7" || rawQuality == "⦰7") return "m7b5";
    if (rawQuality == "o" || rawQuality == "°" || rawQuality == "º") return "dim";
    if (rawQuality == "o7" || rawQuality == "°7" || rawQuality == "º7") return "dim7";
    if (rawQuality == "maj9" || rawQuality == "Maj9" || rawQuality == "ma9" || rawQuality == "M9" || rawQuality == "Δ9" || rawQuality == "∆9" || rawQuality == "△9") return "maj9";
    if (rawQuality == "min9" || rawQuality == "mi9" || rawQuality == "m9" || rawQuality == "-9") return "min9";
    if (rawQuality == "maj11" || rawQuality == "Maj11" || rawQuality == "ma11" || rawQuality == "M11" || rawQuality == "Δ11" || rawQuality == "∆11" || rawQuality == "△11") return "maj11";
    if (rawQuality == "min11" || rawQuality == "mi11" || rawQuality == "m11" || rawQuality == "-11") return "min11";
    if (rawQuality == "maj13" || rawQuality == "Maj13" || rawQuality == "ma13" || rawQuality == "M13" || rawQuality == "Δ13" || rawQuality == "∆13" || rawQuality == "△13") return "maj13";
    if (rawQuality == "min13" || rawQuality == "mi13" || rawQuality == "m13" || rawQuality == "-13") return "min13";
    if (rawQuality == "minMaj7" || rawQuality == "mMaj7" || rawQuality == "minmaj7" || rawQuality == "mmaj7") return "minMaj7";
    if (rawQuality == "power") return "5";
    if (rawQuality == "majorDyad") return "majdyad";
    if (rawQuality == "minorDyad") return "mindyad";
    if (rawQuality == "alt") return "7alt";
    if (rawQuality == "b9") return minorRoman ? "min7(b9)" : "7(b9)";
    return rawQuality;
}

function intervalsForQuality(rawQuality: string, minorRoman: boolean): number[] | null {
    const normalized: string | null = normalizeQuality(rawQuality, minorRoman);
    if (normalized == null) return null;
    if (normalized == "7(b9)") return [0, 4, 7, 10, 13];
    if (normalized == "min7(b9)") return [0, 3, 7, 10, 13];
    if (minorRoman) {
        if (rawQuality == "") return chordIntervals["min"];
        if (rawQuality == "6") return chordIntervals["min6"];
        if (rawQuality == "7") return chordIntervals["min7"];
        if (rawQuality == "9") return chordIntervals["min9"];
        if (rawQuality == "11") return chordIntervals["min11"];
        if (rawQuality == "13") return chordIntervals["min13"];
    }
    if (chordIntervals[normalized] != undefined) return chordIntervals[normalized];
    return null;
}

function getIntervalPitchClass(interval: number): number {
    return pitchModulo(interval);
}

function addInterval(intervals: number[], interval: number): void {
    if (intervals.map(getIntervalPitchClass).indexOf(getIntervalPitchClass(interval)) == -1) intervals.push(interval);
}

function removeIntervalClass(intervals: number[], interval: number): number[] {
    const pitchClass: number = getIntervalPitchClass(interval);
    return intervals.filter(existing => getIntervalPitchClass(existing) != pitchClass);
}

function replaceIntervalClass(intervals: number[], fromInterval: number, toInterval: number): number[] {
    let replaced: boolean = false;
    const fromPitchClass: number = getIntervalPitchClass(fromInterval);
    intervals = intervals.map(interval => {
        if (getIntervalPitchClass(interval) != fromPitchClass) return interval;
        replaced = true;
        return toInterval;
    });
    if (!replaced) addInterval(intervals, toInterval);
    return intervals;
}

function splitModifierList(rawModifiers: string): string[] {
    return rawModifiers.split(/[,;]/).map(modifier => modifier.trim()).filter(modifier => modifier != "");
}

function splitParenthesizedModifiers(rawQuality: string): ParsedQuality | null {
    const parenthesizedModifiers: string[] = [];
    let quality: string = "";
    let index: number = 0;
    while (index < rawQuality.length) {
        if (rawQuality.charAt(index) == ")") return null;
        if (rawQuality.charAt(index) != "(") {
            quality += rawQuality.charAt(index);
            index++;
            continue;
        }
        const start: number = index;
        const end: number = rawQuality.indexOf(")", start + 1);
        if (end < 0 || rawQuality.substring(start + 1, end).indexOf("(") >= 0) return null;
        parenthesizedModifiers.push(...splitModifierList(rawQuality.substring(start + 1, end)));
        index = end + 1;
    }
    return { quality: quality, modifiers: parenthesizedModifiers, bassInterval: null };
}

function tokenizeQualityModifiers(rawModifier: string): string[] | null {
    const modifiers: string[] = [];
    let index: number = 0;
    const modifierPattern: RegExp = /^(?:add|omit|no)?(?:(?:bb|b|##|#|♭♭|♭|♯♯|♯)?\d+|R|root)|^(?:sus2|sus4|sus|alt)/;
    const qualityExtensionPattern: RegExp = /^(?:maj|Maj|ma|Major|M|Δ|∆|△)(?:7|9|11|13)/;
    while (index < rawModifier.length) {
        const remaining: string = rawModifier.substring(index);
        const extensionMatch: RegExpMatchArray | null = remaining.match(qualityExtensionPattern);
        if (extensionMatch != null) {
            if (extensionMatch[0].endsWith("7")) {
                modifiers.push("#7");
            } else if (extensionMatch[0].endsWith("9")) {
                modifiers.push("#7", "9");
            } else if (extensionMatch[0].endsWith("11")) {
                modifiers.push("#7", "9", "11");
            } else {
                modifiers.push("#7", "9", "11", "13");
            }
            index += extensionMatch[0].length;
            continue;
        }
        const match: RegExpMatchArray | null = remaining.match(modifierPattern);
        if (match == null || match[0] == "") return null;
        modifiers.push(match[0]);
        index += match[0].length;
    }
    return modifiers;
}

function tokenizeModifierList(rawModifiers: string[]): string[] | null {
    const modifiers: string[] = [];
    for (const rawModifier of rawModifiers) {
        const tokens: string[] | null = tokenizeQualityModifiers(rawModifier);
        if (tokens == null) return null;
        modifiers.push(...tokens);
    }
    return modifiers;
}

function parseQuality(rawQuality: string, root: ParsedRoot): ParsedQuality | ParseFailure {
    const parsed: ParsedQuality | null = splitParenthesizedModifiers(rawQuality);
    if (parsed == null) return { reason: "Bad alteration parentheses", index: 0 };

    if (root.roman) {
        if (parsed.quality == "6") {
            parsed.quality = "";
            parsed.bassInterval = root.minorRoman ? 3 : 4;
        } else if (parsed.quality == "64") {
            parsed.quality = "";
            parsed.bassInterval = 7;
        } else if (parsed.quality == "65") {
            parsed.quality = "7";
            parsed.bassInterval = root.minorRoman ? 3 : 4;
        } else if (parsed.quality == "43") {
            parsed.quality = "7";
            parsed.bassInterval = 7;
        } else if (parsed.quality == "42") {
            parsed.quality = "7";
            parsed.bassInterval = 10;
        }
    }

    const parsedModifiers: string[] | null = tokenizeModifierList(parsed.modifiers);
    if (parsedModifiers == null) return { reason: "Unknown chord alteration", index: 0 };
    parsed.modifiers = parsedModifiers;

    if (intervalsForQuality(parsed.quality, root.minorRoman) != null) return parsed;

    const orderedQualities: string[] = Object.keys(chordIntervals).concat(["sus", "alt"]).sort((a, b) => b.length - a.length);
    for (const quality of orderedQualities) {
        if (!parsed.quality.startsWith(quality)) continue;
        if (intervalsForQuality(quality, root.minorRoman) == null) continue;
        const suffix: string = parsed.quality.substring(quality.length);
        const suffixModifiers: string[] | null = tokenizeQualityModifiers(suffix);
        if (suffixModifiers == null) continue;
        parsed.quality = quality;
        parsed.modifiers.unshift(...suffixModifiers);
        return parsed;
    }

    return { reason: "Unknown chord quality", index: 0 };
}

function parseModifierInterval(modifier: string): ParsedModifierInterval | null {
    if (modifier == "R" || modifier == "root") return { interval: 0, naturalInterval: 0 };
    let index: number = 0;
    let accidental: number = 0;
    let accidentalOffset: number | null = accidentalValue(modifier.charAt(index));
    while (accidentalOffset != null) {
        accidental += accidentalOffset;
        index++;
        accidentalOffset = accidentalValue(modifier.charAt(index));
    }
    const degree: number = Number(modifier.substring(index));
    if (!Number.isInteger(degree) || degree < 1) return null;
    const naturalIntervals: number[] = [0, 2, 4, 5, 7, 9, 10];
    const naturalInterval: number = naturalIntervals[(degree - 1) % naturalIntervals.length] + 12 * Math.floor((degree - 1) / naturalIntervals.length);
    return { interval: naturalInterval + accidental, naturalInterval: naturalInterval };
}

function applyChordModifier(intervals: number[], modifier: string): number[] | null {
    if (modifier == "alt") return [0, 4, 8, 10, 13, 15];
    if (modifier == "sus") modifier = "sus4";
    if (modifier == "sus2") return replaceIntervalClass(intervals, 4, 2);
    if (modifier == "sus4") return replaceIntervalClass(intervals, 4, 5);

    if (modifier.startsWith("omit")) modifier = "no" + modifier.substring(4);
    if (modifier.startsWith("no")) {
        const parsedInterval: ParsedModifierInterval | null = parseModifierInterval(modifier.substring(2));
        if (parsedInterval == null) return null;
        return removeIntervalClass(intervals, parsedInterval.interval);
    }

    let add: boolean = false;
    if (modifier.startsWith("add")) {
        add = true;
        modifier = modifier.substring(3);
    }
    const parsedInterval: ParsedModifierInterval | null = parseModifierInterval(modifier);
    if (parsedInterval == null) return null;
    if (add) {
        addInterval(intervals, parsedInterval.interval);
    } else {
        intervals = replaceIntervalClass(intervals, parsedInterval.naturalInterval, parsedInterval.interval);
    }
    return intervals;
}

function isSixNineSlash(token: string, slashIndex: number): boolean {
    return slashIndex >= 1 && token.charAt(slashIndex - 1) == "6" && token.charAt(slashIndex + 1) == "9" && (slashIndex + 2 == token.length || token.charAt(slashIndex + 2) == "(");
}

function getSlashChordIndex(token: string, startIndex: number = 0): number {
    let slashIndex: number = token.indexOf("/", startIndex);
    while (slashIndex >= 0 && isSixNineSlash(token, slashIndex)) {
        slashIndex = token.indexOf("/", slashIndex + 1);
    }
    return slashIndex;
}

function parseRoot(doc: SongDocument, token: string, startIndex: number, tokenStart: number): ParsedRoot | ParseFailure {
    let index: number = 0;
    let accidental: number = 0;
    let accidentalOffset: number | null = accidentalValue(token.charAt(startIndex + index));
    while (accidentalOffset != null) {
        accidental += accidentalOffset;
        index++;
        accidentalOffset = accidentalValue(token.charAt(startIndex + index));
    }

    let rootSemitone: number | null = null;
    let rootLength: number = 0;
    let minorRoman: boolean = false;

    const noteMatch: RegExpMatchArray | null = token.substring(startIndex + index).match(/^[A-G](?:bb|b|##|#|♭♭|♭|♯♯|♯)?/);
    if (noteMatch != null) {
        const root: string = noteMatch[0];
        rootSemitone = noteRoots[root.charAt(0)];
        for (let i: number = 1; i < root.length; i++) {
            rootSemitone += accidentalValue(root.charAt(i)) || 0;
        }
        rootLength = root.length;
    } else {
        const romanMatch: RegExpMatchArray | null = token.substring(startIndex + index).match(/^(?:XII|VIII|VII|III|XI|IX|VI|IV|II|X|V|I|xii|viii|vii|iii|xi|ix|vi|iv|ii|x|v|i)/);
        if (romanMatch == null) return { reason: "Unknown chord root", index: tokenStart + startIndex + index };
        const roman: string = romanMatch[0];
        minorRoman = roman == roman.toLowerCase();
        const degree: number = romanRoots[roman.toUpperCase()];
        const degreePitch: number | null = getScaleDegreePitch(doc, degree);
        if (degreePitch == null) return { reason: "Selected scale has no notes", index: tokenStart + startIndex + index };
        rootSemitone = Config.keys[doc.song.visualKey].basePitch + degreePitch;
        rootLength = roman.length;
    }

    rootSemitone += accidental;
    return { semitone: rootSemitone, length: index + rootLength, minorRoman: minorRoman, roman: noteMatch == null };
}

function parseChordToken(doc: SongDocument, token: string, tokenStart: number): ParsedChord | ParseFailure {
    const slashIndex: number = getSlashChordIndex(token);
    if (slashIndex >= 0 && getSlashChordIndex(token, slashIndex + 1) >= 0) return { reason: "Too many slash chord bass notes", index: tokenStart + slashIndex + 1 };
    if (slashIndex == 0) return { reason: "Missing chord before slash", index: tokenStart };
    if (slashIndex == token.length - 1) return { reason: "Missing slash chord bass note", index: tokenStart + slashIndex };

    const chordToken: string = slashIndex < 0 ? token : token.substring(0, slashIndex);
    const root: ParsedRoot | ParseFailure = parseRoot(doc, chordToken, 0, tokenStart);
    if ("reason" in root) return root;

    let index: number = root.length;
    const rootSemitone: number = root.semitone;
    const minorRoman: boolean = root.minorRoman;

    let bassSemitone: number | null = null;
    if (slashIndex >= 0) {
        const bass: ParsedRoot | ParseFailure = parseRoot(doc, token, slashIndex + 1, tokenStart);
        if ("reason" in bass) return { reason: "Unknown slash chord bass note", index: bass.index };
        if (slashIndex + 1 + bass.length != token.length) return { reason: "Bad slash chord bass note", index: tokenStart + slashIndex + 1 + bass.length };
        bassSemitone = bass.semitone;
    }

    const rawQuality: string = chordToken.substring(index);
    const quality: ParsedQuality | ParseFailure = parseQuality(rawQuality, root);
    if ("reason" in quality) return { reason: quality.reason, index: tokenStart + index + quality.index };

    let intervals: number[] | null = intervalsForQuality(quality.quality, minorRoman);
    if (intervals == null) return { reason: "Unknown chord quality", index: tokenStart + index };
    intervals = intervals.concat();

    for (const modifier of quality.modifiers) {
        intervals = applyChordModifier(intervals, modifier);
        if (intervals == null) return { reason: "Unknown chord alteration", index: tokenStart + index };
    }
    if (intervals.length == 0) return { reason: "Chord has no notes", index: tokenStart + index };
    if (bassSemitone == null && quality.bassInterval != null) {
        bassSemitone = rootSemitone + quality.bassInterval;
    }

    const rootOctave: number = 3 * Config.pitchesPerOctave;
    const rootPitch: number = rootOctave + rootSemitone;
    let bassPitch: number | null = null;
    if (bassSemitone != null) {
        bassPitch = rootOctave + bassSemitone;
        while (bassPitch > rootPitch) bassPitch -= Config.pitchesPerOctave;
    }
    const storedPitches: number[] = [];
    for (const interval of intervals) {
        let visualPitch: number = rootPitch + interval;
        if (bassPitch != null) {
            while (visualPitch < bassPitch) visualPitch += Config.pitchesPerOctave;
        }
        while (visualPitch < 0) visualPitch += Config.pitchesPerOctave;
        while (visualPitch > Config.maxPitch) visualPitch -= Config.pitchesPerOctave;
        const storedPitch: number = visualToStoredPitch(doc, visualPitch);
        if (storedPitch < 0 || storedPitch > Config.maxPitch) return { reason: "Chord pitch out of range", index: tokenStart };
        if (storedPitches.indexOf(storedPitch) == -1) storedPitches.push(storedPitch);
    }
    if (bassPitch != null) {
        let visualPitch: number = bassPitch;
        while (visualPitch < 0) visualPitch += Config.pitchesPerOctave;
        while (visualPitch > Config.maxPitch) visualPitch -= Config.pitchesPerOctave;
        const storedPitch: number = visualToStoredPitch(doc, visualPitch);
        if (storedPitch < 0 || storedPitch > Config.maxPitch) return { reason: "Slash chord bass pitch out of range", index: tokenStart + slashIndex + 1 };
        if (storedPitches.indexOf(storedPitch) == -1) storedPitches.push(storedPitch);
    }

    storedPitches.sort((a, b) => a - b);
    return { pitches: trimChordPitches(storedPitches) };
}

export function parseProgression(doc: SongDocument, text: string): ParseResult {
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
        if (text.charAt(index) == "|") {
            if (expectChord || bars[bars.length - 1].chords.length == 0) return { reason: "Empty bar", index: index };
            bars.push({ chords: [] });
            expectChord = true;
            index++;
            continue;
        }
        if (/\s/.test(text.charAt(index))) return { reason: "Use spaces only", index: index };

        const tokenStart: number = index;
        let depth: number = 0;
        while (index < end) {
            const char: string = text.charAt(index);
            if (depth == 0 && (char == " " || char == "|" || /\s/.test(char))) break;
            if (char == "(") {
                depth++;
            } else if (char == ")" && depth > 0) {
                depth--;
            }
            index++;
        }
        const token: string = text.substring(tokenStart, index);
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
    const notePitches: number[] = trimChordPitches(pitches);
    const note: Note = new Note(notePitches[0], start, end, Config.noteSizeMax, false);
    note.pitches = notePitches;
    return note;
}

export class ChordProgressionPrompt implements Prompt {
    private readonly _textArea: HTMLTextAreaElement = textarea({
        style: `width: 100%; height: 12em; resize: vertical; font-size: 115%; background: transparent; text-align: left; border: 1px solid ${ColorConfig.inputBoxOutline}; color: ${ColorConfig.primaryText};`,
        spellcheck: "false",
    });
    private readonly _errorText: HTMLDivElement = div({ style: "color: #ff6666; text-align: right; flex: 1; padding-right: 1em;" });
    private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width: 45%;" }, "Okay");
    private readonly _helpButton: HTMLButtonElement = button({ class: "chordProgressionHelpButton", title: "Help" }, "?");
    private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });
    private readonly _helpContent: HTMLDivElement = div({ style: `display: none; text-align: left; color: ${ColorConfig.secondaryText}; font-size: 90%; line-height: 1.35;` },
        div({ style: "margin-bottom: 0.75em;" }, "Write chord notation, click OK to insert at selected position."),
        div({ style: "display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.35em 1em;" },
            div("Roots"),
            div("C, Db, F#, I, bII, vi"),
            div("Qualities"),
            div("maj, min, dim, aug, sus2, sus4, 5"),
            div("Sevenths"),
            div("7, maj7, min7, m7b5, dim7"),
            div("Extensions"),
            div("6, 6/9, 9, 11, 13, add9, add11, add13"),
            div("Alterations"),
            div("b5, #5, b9, #9, #11, b13, alt"),
            div("Omissions"),
            div("no3, omit5"),
            div("Slash bass"),
            div("C/E, V6, V64, V65, V43, V42"),
            div("Bars"),
            div("| separates bars; spaces separate chords"),
        ),
    );

    public readonly container: HTMLDivElement = div({ class: "prompt noSelection", style: "width: 600px;" },
        h2("Write Chord Progression"),
        this._helpContent,
        this._textArea,
        div({ style: "display: flex; flex-direction: row; align-items: center; justify-content: flex-end;" },
            this._errorText,
            this._okayButton,
        ),
        this._helpButton,
        this._cancelButton,
    );

    constructor(private _doc: SongDocument) {
        this._okayButton.addEventListener("click", this._saveChanges);
        this._helpButton.addEventListener("click", this._toggleHelp);
        this._cancelButton.addEventListener("click", this._close);
        this.container.addEventListener("keydown", this._whenKeyPressed);
        setTimeout(() => this._textArea.focus());
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._saveChanges);
        this._helpButton.removeEventListener("click", this._toggleHelp);
        this._cancelButton.removeEventListener("click", this._close);
        this.container.removeEventListener("keydown", this._whenKeyPressed);
    }

    private _close = (): void => {
        this._doc.undo();
    }

    private _toggleHelp = (): void => {
        this._helpContent.style.display = this._helpContent.style.display == "none" ? "" : "none";
        this._textArea.focus();
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
            event.preventDefault();
        } else if (event.keyCode == 13 && !event.shiftKey) {
            this._saveChanges();
            event.preventDefault();
        }
    }
}
