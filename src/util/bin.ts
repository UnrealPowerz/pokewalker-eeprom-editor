// The API defined in this file is inspired by the API of the Python Construct module

export type BinType<T> = { read: (data: DataView, offset: number) => T, length: number }

export const Int8u = {
    read(data: DataView, offset: number): number {
        return data.getUint8(offset)
    },

    length: 1
}

export const Int16ul = {
    read(data: DataView, offset: number): number {
        return data.getUint16(offset, true)
    },

    length: 2
}

export const Int16ub = {
    read(data: DataView, offset: number): number {
        return data.getUint16(offset)
    },

    length: 2
}

export const Int32ul = {
    read(data: DataView, offset: number): number {
        return data.getUint32(offset, true)
    },

    length: 4
}

export const Int32ub = {
    read(data: DataView, offset: number): number {
        return data.getUint32(offset)
    },

    length: 4
}

export const Enum = (spec: BinType<number>, labels: string[]) => ({
    read(data: DataView, offset: number): { _data: number, _annotate: string, _type: 'enum' } {
        const value = spec.read(data, offset)
        return {
            _data: value,
            _type: 'enum',
            _annotate: value >= 0 && value < labels.length ? labels[value] : '#INVALID#'
        }
    },

    length: spec.length
})

export const Bytes = (length: number) => ({
    read(data: DataView, offset: number): Uint8Array {
        return new Uint8Array(data.buffer.slice(offset, offset + length))
    },
    length
})

export const FixedLengthString = (length: number, encoding = 'ascii') => {
    const decoder = new TextDecoder(encoding)
    return {
        read(data: DataView, offset: number): string {
            return decoder.decode(new Uint8Array(data.buffer.slice(offset, offset + length)))
        },

        length
    }
}

export function Struct<S extends { [key: string]: BinType<unknown> }, T>(spec: S): { read: (data: DataView, offset?: number) => { [key in keyof S]: ReturnType<S[key]['read']> }, length: number }
export function Struct<S extends { [key: string]: BinType<unknown> }, T extends string>(spec: S, type: T): { read: (data: DataView, offset?: number) => { [key in keyof S]: ReturnType<S[key]['read']> } & { _type: T }, length: number }
export function Struct<S extends { [key: string]: BinType<unknown> }, T extends (string | undefined)>(spec: S, type?: T) {
    return {
        read(data: DataView, offset: number = 0): { [key in keyof S]: ReturnType<S[key]['read']> } & { _type: T }  {
            const res: Record<string, unknown> = {}
            for (const [name, subspec] of Object.entries(spec)) {
                //console.log(name, offset.toString(16), (offset+subspec.length).toString(16))
                res[name] = subspec.read(data, offset)
                offset += subspec.length
            }
            if (type != null) {
                res['_type'] = type
            }
            return res as any
        },
    
        length: Object.values(spec).map(el => el.length).reduce((a, b) => a + b, 0)
    }
}

export const BArray = <R>(length: number, spec: BinType<R>) => ({
    read(data: DataView, offset: number = 0): R[]  {
        return Array.from({ length }, (_, i) => offset + i * spec.length).map(off => spec.read(data, off))
    },

    length: spec.length * length
})