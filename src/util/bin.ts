// The API defined in this file is inspired by the API of the Python Construct
// module. Each BinType<T> can read a T from a DataView at an offset, and write
// a T back at an offset. The write is the exact inverse of read.

export type BinType<T> = {
    read: (data: DataView, offset: number) => T;
    write: (data: DataView, offset: number, value: T) => void;
    length: number;
};

export const Int8u: BinType<number> = {
    read: (data, offset) => data.getUint8(offset),
    write: (data, offset, value) => data.setUint8(offset, value),
    length: 1,
};

export const Int16ul: BinType<number> = {
    read: (data, offset) => data.getUint16(offset, true),
    write: (data, offset, value) => data.setUint16(offset, value, true),
    length: 2,
};

export const Int16ub: BinType<number> = {
    read: (data, offset) => data.getUint16(offset),
    write: (data, offset, value) => data.setUint16(offset, value),
    length: 2,
};

export const Int32ul: BinType<number> = {
    read: (data, offset) => data.getUint32(offset, true),
    write: (data, offset, value) => data.setUint32(offset, value, true),
    length: 4,
};

export const Int32ub: BinType<number> = {
    read: (data, offset) => data.getUint32(offset),
    write: (data, offset, value) => data.setUint32(offset, value),
    length: 4,
};

// Wrapper that exposes both the raw numeric value and a human-readable label.
// _data is the value; _annotate is `labels[value]` if in range, '#INVALID#'
// otherwise. _type === 'enum' is the discriminant for UI components.
export type EnumValue = {
    _data: number;
    _annotate: string;
    _type: 'enum';
};

export const Enum = (spec: BinType<number>, labels: string[]): BinType<EnumValue> => ({
    read: (data, offset) => {
        const value = spec.read(data, offset);
        return {
            _data: value,
            _type: 'enum',
            _annotate: value >= 0 && value < labels.length ? labels[value] : '#INVALID#',
        };
    },
    write: (data, offset, value) => {
        spec.write(data, offset, value._data);
    },
    length: spec.length,
});

export const Bytes = (length: number): BinType<Uint8Array> => ({
    read: (data, offset) => new Uint8Array(data.buffer.slice(offset, offset + length)),
    write: (data, offset, value) => {
        const dst = new Uint8Array(data.buffer, offset, length);
        // Copy as many bytes as we have; if value is shorter than the field,
        // zero-fill the remainder.
        const n = Math.min(value.length, length);
        for (let i = 0; i < n; i++) dst[i] = value[i];
        for (let i = n; i < length; i++) dst[i] = 0;
    },
    length,
});

export const FixedLengthString = (length: number, encoding = 'ascii'): BinType<string> => {
    const decoder = new TextDecoder(encoding);
    return {
        read: (data, offset) =>
            decoder.decode(new Uint8Array(data.buffer.slice(offset, offset + length))),
        write: (data, offset, value) => {
            const dst = new Uint8Array(data.buffer, offset, length);
            // Encode as UTF-8 (which covers ASCII for this field's purpose —
            // the "NINTENDO" magic at offset 0). Pad/truncate to `length`.
            const encoded = new TextEncoder().encode(value);
            const n = Math.min(encoded.length, length);
            for (let i = 0; i < n; i++) dst[i] = encoded[i];
            for (let i = n; i < length; i++) dst[i] = 0;
        },
        length,
    };
};

// `BinType<T>` is invariant in T (write's input is contravariant), so the
// container types use `BinType<any>` for the storage entries — this lets
// callers pass any specific BinType in. Inference of the output type still
// works because we reach into the spec's `read` return type.

type StructResult<S extends { [key: string]: BinType<any> }> = {
    [key in keyof S]: ReturnType<S[key]['read']>;
};

// Composite BinTypes expose their internal structure via `_fields` (Struct)
// or `_arrayLength`/`_arrayElem` (BArray) so external code can walk the tree
// without re-parsing the spec definition. The state store uses this to build
// a path → offset lookup table once on dump load.

export type StructBinType<R extends Record<string, unknown>> = BinType<R> & {
    readonly _fields: Record<string, BinType<unknown>>;
    read(data: DataView, offset?: number): R;
};

export type BArrayBinType<R> = BinType<R[]> & {
    readonly _arrayLength: number;
    readonly _arrayElem: BinType<R>;
};

export function Struct<S extends { [key: string]: BinType<any> }>(
    spec: S,
): StructBinType<StructResult<S>>;
export function Struct<S extends { [key: string]: BinType<any> }, T extends string>(
    spec: S,
    type: T,
): StructBinType<StructResult<S> & { _type: T }>;
export function Struct<
    S extends { [key: string]: BinType<any> },
    T extends string | undefined,
>(spec: S, type?: T) {
    const length = Object.values(spec)
        .map((el) => el.length)
        .reduce((a, b) => a + b, 0);

    return {
        _fields: spec as Record<string, BinType<unknown>>,

        read(data: DataView, offset: number = 0) {
            const res: Record<string, unknown> = {};
            for (const [name, subspec] of Object.entries(spec)) {
                res[name] = subspec.read(data, offset);
                offset += subspec.length;
            }
            if (type != null) {
                res['_type'] = type;
            }
            return res as StructResult<S> & { _type: T };
        },

        write(data: DataView, offset: number, value: StructResult<S>) {
            for (const [name, subspec] of Object.entries(spec)) {
                subspec.write(data, offset, (value as Record<string, unknown>)[name]);
                offset += subspec.length;
            }
        },

        length,
    };
}

export const BArray = <R>(length: number, spec: BinType<R>): BArrayBinType<R> => ({
    _arrayLength: length,
    _arrayElem: spec,
    read: (data, offset) =>
        Array.from({ length }, (_, i) => offset + i * spec.length).map((off) =>
            spec.read(data, off),
        ),
    write: (data, offset, value) => {
        for (let i = 0; i < length; i++) {
            spec.write(data, offset + i * spec.length, value[i]);
        }
    },
    length: spec.length * length,
});
