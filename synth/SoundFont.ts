import { performIntegral } from "./SynthConfig";

export interface SoundFontLoadOptions {
    readonly forceSampleIndex: number | null;
    readonly useEnvelopes: boolean;
    readonly useFilters: boolean;
    readonly useLfo: boolean;
}

export interface SoundFontSample {
    readonly name: string;
    readonly sampleRate: number;
    readonly originalPitch: number;
    readonly pitchCorrection: number;
    readonly rawSamples: Float32Array;
    readonly integratedSamples: Float32Array;
    readonly loopStart: number;
    readonly loopEnd: number;
}

export interface SoundFontZone {
    readonly sampleIndex: number;
    readonly keyMin: number;
    readonly keyMax: number;
    readonly velocityMin: number;
    readonly velocityMax: number;
    readonly rootKey: number;
    readonly fineTune: number;
    readonly coarseTune: number;
    readonly loopStart: number;
    readonly loopEnd: number;
    readonly attackSeconds: number;
    readonly releaseSeconds: number;
    readonly filterCutoffHz: number | null;
    readonly vibratoCents: number;
}

export interface SoundFontInstrument {
    readonly name: string;
    readonly zones: SoundFontZone[];
}

export interface SoundFontBank {
    readonly url: string;
    readonly instruments: SoundFontInstrument[];
    readonly samples: SoundFontSample[];
    readonly options: SoundFontLoadOptions;
}

interface Chunk {
    readonly id: string;
    readonly start: number;
    readonly size: number;
}

interface Bag {
    readonly genIndex: number;
}

interface Generator {
    readonly oper: number;
    readonly amount: number;
    readonly lo: number;
    readonly hi: number;
}

interface InstrumentHeader {
    readonly name: string;
    readonly bagIndex: number;
}

interface SampleHeader {
    readonly name: string;
    readonly start: number;
    readonly end: number;
    readonly startLoop: number;
    readonly endLoop: number;
    readonly sampleRate: number;
    readonly originalPitch: number;
    readonly pitchCorrection: number;
}

const enum GeneratorType {
    startAddrsOffset = 0,
    endAddrsOffset = 1,
    startloopAddrsOffset = 2,
    endloopAddrsOffset = 3,
    startAddrsCoarseOffset = 4,
    modLfoToPitch = 5,
    initialFilterFc = 8,
    initialFilterQ = 9,
    endAddrsCoarseOffset = 12,
    pan = 17,
    attackVolEnv = 34,
    releaseVolEnv = 38,
    keyRange = 43,
    velRange = 44,
    startloopAddrsCoarseOffset = 45,
    keynum = 46,
    velocity = 47,
    initialAttenuation = 48,
    endloopAddrsCoarseOffset = 50,
    coarseTune = 51,
    fineTune = 52,
    sampleID = 53,
    sampleModes = 54,
    overridingRootKey = 58,
}

const loadedSoundFontsByUrl: Map<string, SoundFontBank> = new Map();

export function getSoundFont(url: string): SoundFontBank | undefined {
    return loadedSoundFontsByUrl.get(url);
}

export async function loadSoundFont(url: string, options: SoundFontLoadOptions): Promise<SoundFontBank> {
    const existing: SoundFontBank | undefined = loadedSoundFontsByUrl.get(url);
    if (existing != null) return existing;
    const response: Response = await fetch(url);
    if (!response.ok) throw new Error("Couldn't load soundfont");
    const arrayBuffer: ArrayBuffer = await response.arrayBuffer();
    const bank: SoundFontBank = parseSoundFont(url, new Uint8Array(arrayBuffer), options);
    loadedSoundFontsByUrl.set(url, bank);
    return bank;
}

function parseSoundFont(url: string, data: Uint8Array, options: SoundFontLoadOptions): SoundFontBank {
    const view: DataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const smpl: Chunk = requireListChunk(view, 0, data.length, "sdta", "smpl");
    const inst: InstrumentHeader[] = parseInst(requireListChunk(view, 0, data.length, "pdta", "inst"), view, data);
    const ibag: Bag[] = parseBags(requireListChunk(view, 0, data.length, "pdta", "ibag"), view);
    const igen: Generator[] = parseGenerators(requireListChunk(view, 0, data.length, "pdta", "igen"), view);
    const shdr: SampleHeader[] = parseShdr(requireListChunk(view, 0, data.length, "pdta", "shdr"), view, data);
    const samples: SoundFontSample[] = shdr.slice(0, -1).map(header => makeSample(header, smpl, view));
    const instruments: SoundFontInstrument[] = [];
    for (let i: number = 0; i < inst.length - 1; i++) {
        const zones: SoundFontZone[] = createZones(inst[i], inst[i + 1], ibag, igen, shdr, options);
        if (zones.length > 0) instruments.push({ name: cleanName(inst[i].name), zones: zones });
    }
    return { url: url, instruments: instruments, samples: samples, options: options };
}

function createZones(header: InstrumentHeader, nextHeader: InstrumentHeader, ibag: Bag[], igen: Generator[], shdr: SampleHeader[], options: SoundFontLoadOptions): SoundFontZone[] {
    const zones: SoundFontZone[] = [];
    const global: Map<number, Generator> = new Map();
    for (let bagIndex: number = header.bagIndex; bagIndex < nextHeader.bagIndex; bagIndex++) {
        const zoneGenerators: Generator[] = getZoneGenerators(bagIndex, ibag, igen);
        const sampleIdGenerator: Generator | undefined = zoneGenerators.find(generator => generator.oper == GeneratorType.sampleID);
        if (sampleIdGenerator == null) {
            for (const generator of zoneGenerators) global.set(generator.oper, generator);
            continue;
        }
        const sampleIndex: number = options.forceSampleIndex != null ? options.forceSampleIndex : sampleIdGenerator.amount;
        const sampleHeader: SampleHeader | undefined = shdr[sampleIndex];
        if (sampleHeader == null) continue;
        const get: (oper: number) => Generator | undefined = oper => zoneGenerators.find(generator => generator.oper == oper) || global.get(oper);
        const keyRange: Generator | undefined = get(GeneratorType.keyRange);
        const velRange: Generator | undefined = get(GeneratorType.velRange);
        const rootKey: number = generatorAmount(get(GeneratorType.overridingRootKey), sampleHeader.originalPitch);
        const loopStart: number = clamp(0, sampleHeader.end - sampleHeader.start, sampleHeader.startLoop - sampleHeader.start + generatorAmount(get(GeneratorType.startloopAddrsOffset), 0) + generatorAmount(get(GeneratorType.startloopAddrsCoarseOffset), 0) * 32768);
        const loopEnd: number = clamp(loopStart + 1, sampleHeader.end - sampleHeader.start, sampleHeader.endLoop - sampleHeader.start + generatorAmount(get(GeneratorType.endloopAddrsOffset), 0) + generatorAmount(get(GeneratorType.endloopAddrsCoarseOffset), 0) * 32768);
        zones.push({
            sampleIndex: sampleIndex,
            keyMin: keyRange == null ? 0 : keyRange.lo,
            keyMax: keyRange == null ? 127 : keyRange.hi,
            velocityMin: velRange == null ? 0 : velRange.lo,
            velocityMax: velRange == null ? 127 : velRange.hi,
            rootKey: clamp(0, 127, rootKey),
            fineTune: generatorAmount(get(GeneratorType.fineTune), 0),
            coarseTune: generatorAmount(get(GeneratorType.coarseTune), 0),
            loopStart: loopStart,
            loopEnd: loopEnd,
            attackSeconds: options.useEnvelopes ? timecentsToSeconds(generatorAmount(get(GeneratorType.attackVolEnv), -12000)) : 0,
            releaseSeconds: options.useEnvelopes ? timecentsToSeconds(generatorAmount(get(GeneratorType.releaseVolEnv), -12000)) : 0,
            filterCutoffHz: options.useFilters ? centsToHz(generatorAmount(get(GeneratorType.initialFilterFc), 13500)) : null,
            vibratoCents: options.useLfo ? generatorAmount(get(GeneratorType.modLfoToPitch), 0) : 0,
        });
    }
    return zones;
}

function getZoneGenerators(bagIndex: number, bags: Bag[], generators: Generator[]): Generator[] {
    const start: number = bags[bagIndex].genIndex;
    const end: number = bags[bagIndex + 1].genIndex;
    return generators.slice(start, end);
}

function makeSample(header: SampleHeader, smpl: Chunk, view: DataView): SoundFontSample {
    const length: number = Math.max(1, header.end - header.start);
    const raw: number[] = [];
    for (let i: number = 0; i < length; i++) {
        raw.push(view.getInt16(smpl.start + (header.start + i) * 2, true) / 32768.0);
    }
    centerWave(raw);
    raw.push(0);
    const rawSamples: Float32Array = new Float32Array(raw);
    return {
        name: cleanName(header.name),
        sampleRate: header.sampleRate,
        originalPitch: header.originalPitch,
        pitchCorrection: header.pitchCorrection,
        rawSamples: rawSamples,
        integratedSamples: performIntegral(rawSamples),
        loopStart: Math.max(0, header.startLoop - header.start),
        loopEnd: Math.max(1, header.endLoop - header.start),
    };
}

function parseInst(chunk: Chunk, view: DataView, data: Uint8Array): InstrumentHeader[] {
    const result: InstrumentHeader[] = [];
    for (let offset: number = chunk.start; offset + 22 <= chunk.start + chunk.size; offset += 22) {
        result.push({ name: readString(data, offset, 20), bagIndex: view.getUint16(offset + 20, true) });
    }
    return result;
}

function parseBags(chunk: Chunk, view: DataView): Bag[] {
    const result: Bag[] = [];
    for (let offset: number = chunk.start; offset + 4 <= chunk.start + chunk.size; offset += 4) {
        result.push({ genIndex: view.getUint16(offset, true) });
    }
    return result;
}

function parseGenerators(chunk: Chunk, view: DataView): Generator[] {
    const result: Generator[] = [];
    for (let offset: number = chunk.start; offset + 4 <= chunk.start + chunk.size; offset += 4) {
        const oper: number = view.getUint16(offset, true);
        const amount: number = view.getInt16(offset + 2, true);
        const range: number = view.getUint16(offset + 2, true);
        result.push({ oper: oper, amount: amount, lo: range & 0xff, hi: range >> 8 });
    }
    return result;
}

function parseShdr(chunk: Chunk, view: DataView, data: Uint8Array): SampleHeader[] {
    const result: SampleHeader[] = [];
    for (let offset: number = chunk.start; offset + 46 <= chunk.start + chunk.size; offset += 46) {
        result.push({
            name: readString(data, offset, 20),
            start: view.getUint32(offset + 20, true),
            end: view.getUint32(offset + 24, true),
            startLoop: view.getUint32(offset + 28, true),
            endLoop: view.getUint32(offset + 32, true),
            sampleRate: view.getUint32(offset + 36, true),
            originalPitch: view.getUint8(offset + 40),
            pitchCorrection: view.getInt8(offset + 41),
        });
    }
    return result;
}

function requireListChunk(view: DataView, start: number, size: number, listType: string, chunkId: string): Chunk {
    const list: Chunk | null = findList(view, start, size, listType);
    if (list == null) throw new Error("Missing SoundFont list: " + listType);
    const chunk: Chunk | null = findChunk(view, list.start, list.size, chunkId);
    if (chunk == null) throw new Error("Missing SoundFont chunk: " + chunkId);
    return chunk;
}

function findList(view: DataView, start: number, size: number, listType: string): Chunk | null {
    for (const chunk of iterateChunks(view, start + 12, size - 12)) {
        if (chunk.id == "LIST" && readFourCC(view, chunk.start) == listType) {
            return { id: listType, start: chunk.start + 4, size: chunk.size - 4 };
        }
    }
    return null;
}

function findChunk(view: DataView, start: number, size: number, id: string): Chunk | null {
    for (const chunk of iterateChunks(view, start, size)) {
        if (chunk.id == id) return chunk;
    }
    return null;
}

function iterateChunks(view: DataView, start: number, size: number): Chunk[] {
    const chunks: Chunk[] = [];
    for (let offset: number = start; offset + 8 <= start + size;) {
        const id: string = readFourCC(view, offset);
        const chunkSize: number = view.getUint32(offset + 4, true);
        chunks.push({ id: id, start: offset + 8, size: chunkSize });
        offset += 8 + chunkSize + (chunkSize & 1);
    }
    return chunks;
}

function readFourCC(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function readString(data: Uint8Array, offset: number, length: number): string {
    let end: number = offset;
    while (end < offset + length && data[end] != 0) end++;
    return String.fromCharCode(...data.slice(offset, end));
}

function cleanName(name: string): string {
    return name.replace(/\0[\s\S]*$/gm, "").trim();
}

function centerWave(wave: number[]): void {
    let sum: number = 0.0;
    for (const sample of wave) sum += sample;
    const average: number = sum / wave.length;
    for (let i: number = 0; i < wave.length; i++) wave[i] -= average;
}

function generatorAmount(generator: Generator | undefined, defaultValue: number): number {
    return generator == null ? defaultValue : generator.amount;
}

function timecentsToSeconds(timecents: number): number {
    return Math.pow(2, timecents / 1200);
}

function centsToHz(cents: number): number {
    return 8.176 * Math.pow(2, cents / 1200);
}

function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
