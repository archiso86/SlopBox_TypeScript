export interface SoundFontLoadOptions {}

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
    readonly loopMode: number;
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

interface PresetHeader {
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

interface SoundFontWorkerSample {
    readonly name: string;
    readonly sampleRate: number;
    readonly originalPitch: number;
    readonly pitchCorrection: number;
    readonly rawSamples: Float32Array;
    readonly integratedSamples: Float32Array;
    readonly loopStart: number;
    readonly loopEnd: number;
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
    instrument = 41,
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
const loadingSoundFontsByUrl: Map<string, Promise<SoundFontBank>> = new Map();
const soundFontParseYieldInterval: number = 1 << 15;

export function getSoundFont(url: string): SoundFontBank | undefined {
    return loadedSoundFontsByUrl.get(url);
}

export function getLoadedSoundFonts(): SoundFontBank[] {
    return Array.from(loadedSoundFontsByUrl.values());
}

export async function loadSoundFont(url: string, options: SoundFontLoadOptions): Promise<SoundFontBank> {
    const existing: SoundFontBank | undefined = loadedSoundFontsByUrl.get(url);
    if (existing != null) return existing;
    const loading: Promise<SoundFontBank> | undefined = loadingSoundFontsByUrl.get(url);
    if (loading != null) return loading;
    const promise: Promise<SoundFontBank> = (async () => {
        const response: Response = await fetch(url);
        if (!response.ok) throw new Error("Couldn't load soundfont");
        const arrayBuffer: ArrayBuffer = await response.arrayBuffer();
        const bank: SoundFontBank = await parseSoundFont(url, new Uint8Array(arrayBuffer), options);
        loadedSoundFontsByUrl.set(url, bank);
        return bank;
    })();
    loadingSoundFontsByUrl.set(url, promise);
    promise.catch(() => loadingSoundFontsByUrl.delete(url));
    return promise;
}

async function parseSoundFont(url: string, data: Uint8Array, options: SoundFontLoadOptions): Promise<SoundFontBank> {
    const view: DataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    validateSoundFontHeader(view, data.length);
    const smpl: Chunk = requireListChunk(view, 0, data.length, "sdta", "smpl");
    const phdr: PresetHeader[] = parsePhdr(requireListChunk(view, 0, data.length, "pdta", "phdr"), view, data);
    const pbag: Bag[] = parseBags(requireListChunk(view, 0, data.length, "pdta", "pbag"), view);
    const pgen: Generator[] = parseGenerators(requireListChunk(view, 0, data.length, "pdta", "pgen"), view);
    const inst: InstrumentHeader[] = parseInst(requireListChunk(view, 0, data.length, "pdta", "inst"), view, data);
    const ibag: Bag[] = parseBags(requireListChunk(view, 0, data.length, "pdta", "ibag"), view);
    const igen: Generator[] = parseGenerators(requireListChunk(view, 0, data.length, "pdta", "igen"), view);
    const shdr: SampleHeader[] = normalizeSampleHeaders(parseShdr(requireListChunk(view, 0, data.length, "pdta", "shdr"), view, data), smpl);
    validateSoundFontTables(phdr, pbag, pgen, inst, ibag, igen, shdr);
    let instruments: SoundFontInstrument[] = createPresetInstruments(phdr, pbag, pgen, inst, ibag, igen, shdr);
    if (instruments.length == 0) {
        instruments = [];
        for (let i: number = 0; i < inst.length - 1; i++) {
            const zones: SoundFontZone[] = createZones(inst[i], inst[i + 1], ibag, igen, shdr);
            if (zones.length > 0) instruments.push({ name: cleanName(inst[i].name), zones: zones });
        }
    }
    if (instruments.length == 0) throw new Error("SoundFont contains no usable instruments");
    const samples: SoundFontSample[] = await makeSamples(data, smpl, shdr);
    return { url: url, instruments: instruments, samples: samples, options: options };
}

function createPresetInstruments(phdr: PresetHeader[], pbag: Bag[], pgen: Generator[], inst: InstrumentHeader[], ibag: Bag[], igen: Generator[], shdr: SampleHeader[]): SoundFontInstrument[] {
    const instruments: SoundFontInstrument[] = [];
    for (let presetIndex: number = 0; presetIndex < phdr.length - 1; presetIndex++) {
        const preset: PresetHeader = phdr[presetIndex];
        const nextPreset: PresetHeader = phdr[presetIndex + 1];
        const zones: SoundFontZone[] = [];
        const presetGlobal: Map<number, Generator> = new Map();
        for (let bagIndex: number = preset.bagIndex; bagIndex < nextPreset.bagIndex; bagIndex++) {
            const zoneGenerators: Generator[] = getZoneGenerators(bagIndex, pbag, pgen);
            const instrumentGenerator: Generator | undefined = zoneGenerators.find(generator => generator.oper == GeneratorType.instrument);
            if (instrumentGenerator == null) {
                for (const generator of zoneGenerators) presetGlobal.set(generator.oper, generator);
                continue;
            }
            const instrumentIndex: number = instrumentGenerator.amount;
            const header: InstrumentHeader | undefined = inst[instrumentIndex];
            const nextHeader: InstrumentHeader | undefined = inst[instrumentIndex + 1];
            if (header == null || nextHeader == null) continue;
            const localPresetGenerators: Map<number, Generator> = new Map(presetGlobal);
            for (const generator of zoneGenerators) {
                if (generator.oper != GeneratorType.instrument) localPresetGenerators.set(generator.oper, generator);
            }
            zones.push(...createZones(header, nextHeader, ibag, igen, shdr, localPresetGenerators));
        }
        if (zones.length > 0) instruments.push({ name: cleanName(preset.name), zones: zones });
    }
    return instruments;
}

function createZones(header: InstrumentHeader, nextHeader: InstrumentHeader, ibag: Bag[], igen: Generator[], shdr: SampleHeader[], presetGlobal?: Map<number, Generator>): SoundFontZone[] {
    const zones: SoundFontZone[] = [];
    const global: Map<number, Generator> = new Map(presetGlobal);
    const startBagIndex: number = clamp(0, ibag.length - 1, header.bagIndex);
    const endBagIndex: number = clamp(startBagIndex, ibag.length - 1, nextHeader.bagIndex);
    for (let bagIndex: number = startBagIndex; bagIndex < endBagIndex; bagIndex++) {
        const zoneGenerators: Generator[] = getZoneGenerators(bagIndex, ibag, igen);
        const sampleIdGenerator: Generator | undefined = zoneGenerators.find(generator => generator.oper == GeneratorType.sampleID);
        if (sampleIdGenerator == null) {
            for (const generator of zoneGenerators) global.set(generator.oper, generator);
            continue;
        }
        const sampleIndex: number = sampleIdGenerator.amount;
        if (sampleIndex < 0 || sampleIndex >= shdr.length - 1) continue;
        const sampleHeader: SampleHeader | undefined = shdr[sampleIndex];
        if (sampleHeader == null) continue;
        const get: (oper: number) => Generator | undefined = oper => zoneGenerators.find(generator => generator.oper == oper) || global.get(oper);
        const keyRange: Generator | undefined = get(GeneratorType.keyRange);
        const velRange: Generator | undefined = get(GeneratorType.velRange);
        const rootKey: number = generatorAmount(get(GeneratorType.overridingRootKey), sampleHeader.originalPitch);
        const sampleLength: number = Math.max(1, sampleHeader.end - sampleHeader.start);
        const loopStart: number = clamp(0, sampleLength - 1, sampleHeader.startLoop - sampleHeader.start + generatorAmount(get(GeneratorType.startloopAddrsOffset), 0) + generatorAmount(get(GeneratorType.startloopAddrsCoarseOffset), 0) * 32768);
        const loopEnd: number = clamp(loopStart + 1, sampleLength, sampleHeader.endLoop - sampleHeader.start + generatorAmount(get(GeneratorType.endloopAddrsOffset), 0) + generatorAmount(get(GeneratorType.endloopAddrsCoarseOffset), 0) * 32768);
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
            loopMode: soundFontSampleModeToChipLoopMode(generatorAmount(get(GeneratorType.sampleModes), 0)),
            attackSeconds: timecentsToSeconds(generatorAmount(get(GeneratorType.attackVolEnv), -12000)),
            releaseSeconds: timecentsToSeconds(generatorAmount(get(GeneratorType.releaseVolEnv), -12000)),
            filterCutoffHz: centsToHz(soundFontInitialFilterFcCents(get(GeneratorType.initialFilterFc))),
            vibratoCents: generatorAmount(get(GeneratorType.modLfoToPitch), 0),
        });
    }
    return zones;
}

function getZoneGenerators(bagIndex: number, bags: Bag[], generators: Generator[]): Generator[] {
    if (bagIndex < 0 || bagIndex + 1 >= bags.length) return [];
    const start: number = bags[bagIndex].genIndex;
    const end: number = bags[bagIndex + 1].genIndex;
    if (start < 0 || end < start || start >= generators.length) return [];
    return generators.slice(start, Math.min(end, generators.length));
}

async function makeSamples(data: Uint8Array, smpl: Chunk, shdr: SampleHeader[]): Promise<SoundFontSample[]> {
    if (typeof Worker != "undefined" && typeof Blob != "undefined" && typeof URL != "undefined") {
        return await makeSamplesInWorker(data, smpl, shdr);
    }
    const view: DataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const samples: SoundFontSample[] = [];
    for (let i: number = 0; i < shdr.length - 1; i++) {
        samples.push(await makeSample(shdr[i], smpl, view));
    }
    return samples;
}

function makeSamplesInWorker(data: Uint8Array, smpl: Chunk, shdr: SampleHeader[]): Promise<SoundFontSample[]> {
    return new Promise((resolve, reject) => {
        const blob: Blob = new Blob([soundFontWorkerScript], { type: "application/javascript" });
        const workerUrl: string = URL.createObjectURL(blob);
        const worker: Worker = new Worker(workerUrl);
        const cleanup = (): void => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };
        worker.onmessage = (event: MessageEvent): void => {
            cleanup();
            const message: { error?: string, samples?: SoundFontWorkerSample[] } = event.data;
            if (message.error != null) {
                reject(new Error(message.error));
            } else {
                resolve(message.samples || []);
            }
        };
        worker.onerror = (event: ErrorEvent): void => {
            cleanup();
            reject(event.error || new Error(event.message));
        };
        const headers: SampleHeader[] = shdr.slice(0, -1);
        worker.postMessage({
            buffer: data.buffer,
            byteOffset: data.byteOffset,
            byteLength: data.byteLength,
            smpl: smpl,
            headers: headers,
        }, [data.buffer]);
    });
}

async function makeSample(header: SampleHeader, smpl: Chunk, view: DataView): Promise<SoundFontSample> {
    const sampleCount: number = Math.floor(smpl.size / 2);
    const sampleStart: number = clamp(0, Math.max(0, sampleCount - 1), header.start);
    const sampleEnd: number = clamp(sampleStart + 1, sampleCount, header.end);
    const length: number = Math.max(1, sampleEnd - sampleStart);
    const rawSamples: Float32Array = new Float32Array(length + 1);
    for (let i: number = 0; i < length; i++) {
        rawSamples[i] = view.getInt16(smpl.start + (sampleStart + i) * 2, true) / 32768.0;
        if (i > 0 && (i & (soundFontParseYieldInterval - 1)) == 0) await yieldSoundFontParse();
    }
    await centerWave(rawSamples, length);
    return {
        name: cleanName(header.name),
        sampleRate: header.sampleRate,
        originalPitch: header.originalPitch,
        pitchCorrection: header.pitchCorrection,
        rawSamples: rawSamples,
        integratedSamples: await performIntegralAsync(rawSamples),
        loopStart: clamp(0, length - 1, header.startLoop - sampleStart),
        loopEnd: clamp(1, length, header.endLoop - sampleStart),
    };
}

function normalizeSampleHeaders(headers: SampleHeader[], smpl: Chunk): SampleHeader[] {
    const sampleCount: number = Math.floor(smpl.size / 2);
    return headers.map(header => {
        const start: number = clamp(0, Math.max(0, sampleCount - 1), header.start);
        const end: number = clamp(start + 1, Math.max(start + 1, sampleCount), header.end);
        const startLoop: number = clamp(start, Math.max(start, end - 1), header.startLoop);
        const endLoop: number = clamp(startLoop + 1, end, header.endLoop);
        return {
            name: header.name,
            start: start,
            end: end,
            startLoop: startLoop,
            endLoop: endLoop,
            sampleRate: Math.max(1, header.sampleRate),
            originalPitch: header.originalPitch,
            pitchCorrection: header.pitchCorrection,
        };
    });
}

function parseInst(chunk: Chunk, view: DataView, data: Uint8Array): InstrumentHeader[] {
    requireTableMultiple(chunk, 22, "inst");
    const result: InstrumentHeader[] = [];
    for (let offset: number = chunk.start; offset + 22 <= chunk.start + chunk.size; offset += 22) {
        result.push({ name: readString(data, offset, 20), bagIndex: view.getUint16(offset + 20, true) });
    }
    return result;
}

function parsePhdr(chunk: Chunk, view: DataView, data: Uint8Array): PresetHeader[] {
    requireTableMultiple(chunk, 38, "phdr");
    const result: PresetHeader[] = [];
    for (let offset: number = chunk.start; offset + 38 <= chunk.start + chunk.size; offset += 38) {
        result.push({ name: readString(data, offset, 20), bagIndex: view.getUint16(offset + 24, true) });
    }
    return result;
}

function parseBags(chunk: Chunk, view: DataView): Bag[] {
    requireTableMultiple(chunk, 4, chunk.id);
    const result: Bag[] = [];
    for (let offset: number = chunk.start; offset + 4 <= chunk.start + chunk.size; offset += 4) {
        result.push({ genIndex: view.getUint16(offset, true) });
    }
    return result;
}

function parseGenerators(chunk: Chunk, view: DataView): Generator[] {
    requireTableMultiple(chunk, 4, chunk.id);
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
    requireTableMultiple(chunk, 46, "shdr");
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
    const end: number = Math.min(view.byteLength, start + Math.max(0, size));
    for (let offset: number = start; offset + 8 <= end;) {
        const id: string = readFourCC(view, offset);
        const chunkSize: number = view.getUint32(offset + 4, true);
        if (offset + 8 + chunkSize > end) throw new Error("SoundFont chunk exceeds file bounds: " + id);
        chunks.push({ id: id, start: offset + 8, size: chunkSize });
        offset += 8 + chunkSize + (chunkSize & 1);
    }
    return chunks;
}

function validateSoundFontHeader(view: DataView, size: number): void {
    if (size < 12 || readFourCC(view, 0) != "RIFF" || readFourCC(view, 8) != "sfbk") {
        throw new Error("Invalid SoundFont RIFF header");
    }
    const riffSize: number = view.getUint32(4, true);
    if (riffSize + 8 > size) throw new Error("SoundFont RIFF size exceeds file bounds");
}

function validateSoundFontTables(phdr: PresetHeader[], pbag: Bag[], pgen: Generator[], inst: InstrumentHeader[], ibag: Bag[], igen: Generator[], shdr: SampleHeader[]): void {
    if (phdr.length < 2) throw new Error("SoundFont contains no preset terminal record");
    if (inst.length < 2) throw new Error("SoundFont contains no instrument terminal record");
    if (shdr.length < 2) throw new Error("SoundFont contains no sample terminal record");
    if (pbag.length < 2 || ibag.length < 2) throw new Error("SoundFont contains no usable bags");
    requireMonotonicBagIndexes(phdr.map(header => header.bagIndex), pbag.length, "phdr");
    requireMonotonicBagIndexes(inst.map(header => header.bagIndex), ibag.length, "inst");
    requireMonotonicBagIndexes(pbag.map(bag => bag.genIndex), pgen.length + 1, "pbag");
    requireMonotonicBagIndexes(ibag.map(bag => bag.genIndex), igen.length + 1, "ibag");
}

function requireMonotonicBagIndexes(indexes: number[], max: number, tableName: string): void {
    let previous: number = -1;
    for (const index of indexes) {
        if (index < previous || index < 0 || index >= max) throw new Error("Invalid SoundFont " + tableName + " index");
        previous = index;
    }
}

function requireTableMultiple(chunk: Chunk, recordSize: number, tableName: string): void {
    if (chunk.size % recordSize != 0) throw new Error("Invalid SoundFont " + tableName + " table size");
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

async function centerWave(wave: Float32Array, length: number): Promise<void> {
    let sum: number = 0.0;
    for (let i: number = 0; i < length; i++) {
        sum += wave[i];
        if (i > 0 && (i & (soundFontParseYieldInterval - 1)) == 0) await yieldSoundFontParse();
    }
    const average: number = sum / length;
    for (let i: number = 0; i < length; i++) {
        wave[i] -= average;
        if (i > 0 && (i & (soundFontParseYieldInterval - 1)) == 0) await yieldSoundFontParse();
    }
}

async function performIntegralAsync(wave: Float32Array): Promise<Float32Array> {
    let cumulative: number = 0.0;
    const newWave: Float32Array = new Float32Array(wave.length);
    for (let i: number = 0; i < wave.length; i++) {
        newWave[i] = cumulative;
        cumulative += wave[i];
        if (i > 0 && (i & (soundFontParseYieldInterval - 1)) == 0) await yieldSoundFontParse();
    }
    return newWave;
}

function yieldSoundFontParse(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

const soundFontWorkerScript: string = `
self.onmessage = function(event) {
    try {
        var data = event.data;
        var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        var smpl = data.smpl;
        var sampleCount = Math.floor(smpl.size / 2);
        var samples = [];
        var transfers = [];
        for (var headerIndex = 0; headerIndex < data.headers.length; headerIndex++) {
            var header = data.headers[headerIndex];
            var sampleStart = clamp(0, Math.max(0, sampleCount - 1), header.start);
            var sampleEnd = clamp(sampleStart + 1, sampleCount, header.end);
            var length = Math.max(1, sampleEnd - sampleStart);
            var rawSamples = new Float32Array(length + 1);
            for (var i = 0; i < length; i++) {
                rawSamples[i] = view.getInt16(smpl.start + (sampleStart + i) * 2, true) / 32768.0;
            }
            centerWave(rawSamples, length);
            var integratedSamples = performIntegral(rawSamples);
            samples.push({
                name: cleanName(header.name),
                sampleRate: header.sampleRate,
                originalPitch: header.originalPitch,
                pitchCorrection: header.pitchCorrection,
                rawSamples: rawSamples,
                integratedSamples: integratedSamples,
                loopStart: clamp(0, length - 1, header.startLoop - sampleStart),
                loopEnd: clamp(1, length, header.endLoop - sampleStart),
            });
            transfers.push(rawSamples.buffer, integratedSamples.buffer);
        }
        self.postMessage({ samples: samples }, transfers);
    } catch (error) {
        self.postMessage({ error: String(error && error.message || error) });
    }
};

function centerWave(wave, length) {
    var sum = 0.0;
    for (var i = 0; i < length; i++) sum += wave[i];
    var average = sum / length;
    for (var j = 0; j < length; j++) wave[j] -= average;
}

function performIntegral(wave) {
    var cumulative = 0.0;
    var newWave = new Float32Array(wave.length);
    for (var i = 0; i < wave.length; i++) {
        newWave[i] = cumulative;
        cumulative += wave[i];
    }
    return newWave;
}

function cleanName(name) {
    return name.replace(/\\0[\\s\\S]*$/gm, "").trim();
}

function clamp(min, max, value) {
    return Math.max(min, Math.min(max, value));
}
`;

function generatorAmount(generator: Generator | undefined, defaultValue: number): number {
    return generator == null ? defaultValue : generator.amount;
}

function soundFontInitialFilterFcCents(generator: Generator | undefined): number {
    const defaultCents: number = 13500;
    if (generator == null) return defaultCents;
    return clamp(1500, defaultCents, generator.amount < 0 ? defaultCents + generator.amount : generator.amount);
}

function timecentsToSeconds(timecents: number): number {
    return Math.pow(2, timecents / 1200);
}

function centsToHz(cents: number): number {
    return 8.176 * Math.pow(2, cents / 1200);
}

function soundFontSampleModeToChipLoopMode(sampleMode: number): number {
    switch (sampleMode & 3) {
        case 1: return 0;
        case 3: return 4;
        default: return 2;
    }
}

function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
