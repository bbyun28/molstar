/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Features } from './features';
import { IntAdjacencyGraph } from '../../../mol-math/graph';
import { InteractionType, InteractionsIntraLinks, InteractionsInterLinks } from './common';
import { Unit, StructureElement } from '../../../mol-model/structure/structure';
import { InterUnitGraph } from '../../../mol-math/graph/inter-unit-graph';
import { UniqueArray } from '../../../mol-data/generic';

export { IntraLinksBuilder }

interface IntraLinksBuilder {
    add: (indexA: number, indexB: number, type: InteractionType) => void
    getLinks: () => InteractionsIntraLinks
}

namespace IntraLinksBuilder {
    export function create(features: Features, elementsCount: number): IntraLinksBuilder {
        const aIndices: number[] = []
        const bIndices: number[] = []
        const types: number[] = []

        return {
            add(indexA: number, indexB: number, type: InteractionType) {
                aIndices[aIndices.length] = indexA
                bIndices[bIndices.length] = indexB
                types[types.length] = type
            },
            getLinks() {
                const builder = new IntAdjacencyGraph.EdgeBuilder(features.count, aIndices, bIndices)
                const type = new Int8Array(builder.slotCount) as ArrayLike<InteractionType>
                for (let i = 0, _i = builder.edgeCount; i < _i; i++) {
                    builder.addNextEdge()
                    builder.assignProperty(type, types[i])
                }
                return builder.createGraph({ type })
            }
        }
    }
}

export { InterLinksBuilder }

interface InterLinksBuilder {
    startUnitPair: (unitA: Unit, unitB: Unit) => void
    finishUnitPair: () => void
    add: (indexA: number, indexB: number, type: InteractionType) => void
    getLinks: () => InteractionsInterLinks
}

namespace InterLinksBuilder {
    function addMapEntry<A, B>(map: Map<A, B[]>, a: A, b: B) {
        if (map.has(a)) map.get(a)!.push(b);
        else map.set(a, [b]);
    }

    export function create(): InterLinksBuilder {
        let uA: Unit
        let uB: Unit
        let mapAB: Map<number, InteractionsInterLinks.Info[]>
        let mapBA: Map<number, InteractionsInterLinks.Info[]>
        let bondedA: UniqueArray<StructureElement.UnitIndex, StructureElement.UnitIndex>
        let bondedB: UniqueArray<StructureElement.UnitIndex, StructureElement.UnitIndex>
        let bondCount: number

        const map = new Map<number, InteractionsInterLinks.Pair[]>();

        return {
            startUnitPair(unitA: Unit, unitB: Unit) {
                uA = unitA
                uB = unitB
                mapAB = new Map()
                mapBA = new Map()
                bondedA = UniqueArray.create()
                bondedB = UniqueArray.create()
                bondCount = 0
            },
            finishUnitPair() {
                if (bondCount === 0) return
                addMapEntry(map, uA.id, new InteractionsInterLinks.Pair(uA, uB, bondCount, bondedA.array, mapAB))
                addMapEntry(map, uB.id, new InteractionsInterLinks.Pair(uB, uA, bondCount, bondedB.array, mapBA))
            },
            add(indexA: number, indexB: number, type: InteractionType) {
                addMapEntry(mapAB, indexA, { indexB, props: { type } })
                addMapEntry(mapBA, indexB, { indexB: indexA, props: { type } })
                UniqueArray.add(bondedA, indexA, indexA)
                UniqueArray.add(bondedB, indexB, indexB)
                bondCount += 1
            },
            getLinks() {
                return new InterUnitGraph(map);
            }
        }
    }
}