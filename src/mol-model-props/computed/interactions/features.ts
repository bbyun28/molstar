/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureElement, Unit, Structure } from '../../../mol-model/structure/structure';
import { ChunkedArray } from '../../../mol-data/util';
import { GridLookup3D } from '../../../mol-math/geometry';
import { OrderedSet } from '../../../mol-data/int';
import { FeatureGroup, FeatureType } from './common';
import { ValenceModelProvider } from '../valence-model';

export { Features }

interface Features {
    /** number of features */
    readonly count: number
    /** center x coordinate, in invariant coordinate space */
    readonly x: ArrayLike<number>
    /** center y coordinate, in invariant coordinate space */
    readonly y: ArrayLike<number>
    /** center z coordinate, in invariant coordinate space */
    readonly z: ArrayLike<number>
    readonly types: ArrayLike<FeatureType>
    readonly groups: ArrayLike<FeatureGroup>
    readonly offsets: ArrayLike<number>
    /** elements of this feature, range for feature i is offsets[i] to offsets[i + 1] */
    readonly members: ArrayLike<StructureElement.UnitIndex>

    /** lookup3d based on center coordinates, in invariant coordinate space */
    readonly lookup3d: GridLookup3D
    /** maps unit elements to features, range for unit element i is offsets[i] to offsets[i + 1] */
    readonly elementsIndex: Features.ElementsIndex
}

namespace Features {
    /** Index into Features data arrays */
    export type FeatureIndex = { readonly '@type': 'feature-index' } & number

    /** maps unit elements to features, range for unit element i is offsets[i] to offsets[i + 1] */
    export type ElementsIndex = {
        /** feature indices */
        readonly indices: ArrayLike<FeatureIndex>
        /** range for unit element i is offsets[i] to offsets[i + 1] */
        readonly offsets: ArrayLike<number>
    }

    export type Data = {
        count: number
        x: ArrayLike<number>
        y: ArrayLike<number>
        z: ArrayLike<number>
        types: ArrayLike<FeatureType>
        groups: ArrayLike<FeatureGroup>
        offsets: ArrayLike<number>
        members: ArrayLike<StructureElement.UnitIndex>
    }

    export function createElementsIndex(data: Data, elementsCount: number): ElementsIndex {
        const offsets = new Int32Array(elementsCount + 1)
        const bucketFill = new Int32Array(elementsCount)
        const bucketSizes = new Int32Array(elementsCount)
        const { members, count, offsets: featureOffsets } = data
        for (let i = 0; i < count; ++i) ++bucketSizes[members[i]]

        let offset = 0
        for (let i = 0; i < elementsCount; i++) {
            offsets[i] = offset
            offset += bucketSizes[i]
        }
        offsets[elementsCount] = offset

        const indices = new Int32Array(offset)
        for (let i = 0; i < count; ++i) {
            for (let j = featureOffsets[i], jl = featureOffsets[i + 1]; j < jl; ++j) {
                const a = members[j]
                const oa = offsets[a] + bucketFill[a]
                indices[oa] = i
                ++bucketFill[a]
            }
        }

        return { indices: indices as unknown as ArrayLike<FeatureIndex>, offsets }
    }

    export function create(elementsCount: number, data: Data): Features {
        let lookup3d: GridLookup3D
        let elementsIndex: ElementsIndex

        return {
            ...data,
            get lookup3d() {
                return lookup3d || (lookup3d = GridLookup3D({ x: data.x, y: data.y, z: data.z, indices: OrderedSet.ofBounds(0, data.count) }))
            },
            get elementsIndex() {
                return elementsIndex || (elementsIndex = createElementsIndex(data, elementsCount))
            },
        }
    }

    export interface Info {
        unit: Unit.Atomic,
        types: ArrayLike<FeatureType>,
        feature: number,
        members: ArrayLike<StructureElement.UnitIndex>,
        offsets: ArrayLike<number>,
        idealGeometry: Int8Array
    }
    export function Info(structure: Structure, unit: Unit.Atomic, features: Features) {
        const valenceModel = ValenceModelProvider.getValue(structure).value
        if (!valenceModel || !valenceModel.has(unit.id)) throw new Error('valence model required')

        return {
            unit,
            types: features.types,
            members: features.members,
            offsets: features.offsets,
            idealGeometry: valenceModel.get(unit.id)!.idealGeometry
        } as Info
    }

    export interface Provider {
        name: string
        add: (structure: Structure, unit: Unit.Atomic, featuresBuilder: FeaturesBuilder) => void
    }
}

export { FeaturesBuilder }

interface FeaturesBuilder {
    clearState: () => void
    pushMember: (x: number, y: number, z: number, member: StructureElement.UnitIndex) => void
    addState: (type: FeatureType, group: FeatureGroup) => void
    addOne: (type: FeatureType, group: FeatureGroup, x: number, y: number, z: number, member: StructureElement.UnitIndex) => void
    getFeatures: (elementsCount: number) => Features
}

namespace FeaturesBuilder {
    interface State { x: number, y: number, z: number, offset: number, count: number }

    export function create(initialCount = 2048, chunkSize = 1024, features?: Features): FeaturesBuilder {
        const xCenters = ChunkedArray.create(Float32Array, 1, chunkSize, features ? features.x : initialCount)
        const yCenters = ChunkedArray.create(Float32Array, 1, chunkSize, features ? features.y : initialCount)
        const zCenters = ChunkedArray.create(Float32Array, 1, chunkSize, features ? features.z : initialCount)
        const types = ChunkedArray.create(Uint8Array, 1, chunkSize, features ? features.types : initialCount)
        const groups = ChunkedArray.create(Uint8Array, 1, chunkSize, features ? features.groups : initialCount)
        const offsets = ChunkedArray.create(Uint32Array, 1, chunkSize, features ? features.offsets : initialCount)
        const members = ChunkedArray.create(Uint32Array, 1, chunkSize, features ? features.members : initialCount)

        const state: State = { x: 0, y: 0, z: 0, offset: 0, count: 0 }

        return {
            clearState: () => {
                state.x = 0, state.y = 0, state.z = 0, state.offset = members.elementCount, state.count = 0
            },
            pushMember: (x: number, y: number, z: number, member: StructureElement.UnitIndex) => {
                ChunkedArray.add(members, member)
                state.x += x, state.y += y, state.z += z
            },
            addState: (type: FeatureType, group: FeatureGroup) => {
                const { count } = state
                if (count === 0) return
                ChunkedArray.add(types, type)
                ChunkedArray.add(groups, group)
                ChunkedArray.add(xCenters, state.x / count)
                ChunkedArray.add(yCenters, state.y / count)
                ChunkedArray.add(zCenters, state.z / count)
                ChunkedArray.add(offsets, state.offset)
            },
            addOne: (type: FeatureType, group: FeatureGroup, x: number, y: number, z: number, member: StructureElement.UnitIndex) => {
                ChunkedArray.add(types, type)
                ChunkedArray.add(groups, group)
                ChunkedArray.add(xCenters, x)
                ChunkedArray.add(yCenters, y)
                ChunkedArray.add(zCenters, z)
                ChunkedArray.add(offsets, members.elementCount)
                ChunkedArray.add(members, member)
            },
            getFeatures: (elementsCount: number) => {
                ChunkedArray.add(offsets, members.elementCount)
                const x = ChunkedArray.compact(xCenters, true) as ArrayLike<number>
                const y = ChunkedArray.compact(yCenters, true) as ArrayLike<number>
                const z = ChunkedArray.compact(zCenters, true) as ArrayLike<number>
                const count = xCenters.elementCount
                return Features.create(elementsCount, {
                    x, y, z, count,
                    types: ChunkedArray.compact(types, true) as ArrayLike<FeatureType>,
                    groups: ChunkedArray.compact(groups, true) as ArrayLike<FeatureGroup>,
                    offsets: ChunkedArray.compact(offsets, true) as ArrayLike<number>,
                    members: ChunkedArray.compact(members, true) as ArrayLike<StructureElement.UnitIndex>,
                })
            }
        }
    }
}