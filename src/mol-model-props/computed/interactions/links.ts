/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { Structure, Unit } from '../../../mol-model/structure';
import { Features } from './features';
import { InteractionType } from './common';
import { IntraLinksBuilder, InterLinksBuilder } from './builder';
import { Mat4, Vec3 } from '../../../mol-math/linear-algebra';

const MAX_DISTANCE = 5

export interface LinkProvider<P extends PD.Params> {
    name: string
    params: P
    createTester(props: PD.Values<P>): LinkTester
}

export interface LinkTester {
    maxDistanceSq: number
    getType: (structure: Structure, infoA: Features.Info, infoB: Features.Info, distanceSq: number, ) => InteractionType | undefined
}

/**
 * Add all intra-unit links, i.e. pairs of features
 */
export function addUnitLinks(structure: Structure, unit: Unit.Atomic, features: Features, builder: IntraLinksBuilder, testers: ReadonlyArray<LinkTester>) {
    const { x, y, z, count, lookup3d } = features

    const infoA = Features.Info(structure, unit, features)
    const infoB = { ...infoA }

    const maxDistanceSq = Math.max(...testers.map(t => t.maxDistanceSq))

    for (let i = 0; i < count; ++i) {
        const { count, indices, squaredDistances } = lookup3d.find(x[i], y[i], z[i], maxDistanceSq)
        if (count === 0) continue

        infoA.feature = i

        for (let r = 0; r < count; ++r) {
            const j = indices[r]
            if (j <= i) continue

            const distanceSq = squaredDistances[r]
            infoB.feature = j
            for (const tester of testers) {
                if (distanceSq < tester.maxDistanceSq) {
                    const type = tester.getType(structure, infoA, infoB, distanceSq)
                    if (type) builder.add(i, j, type)
                }
            }
        }
    }
}

const _imageTransform = Mat4()

/**
 * Add all inter-unit links, i.e. pairs of features
 */
export function addStructureLinks(structure: Structure, unitA: Unit.Atomic, featuresA: Features, unitB: Unit.Atomic, featuresB: Features, builder: InterLinksBuilder, testers: ReadonlyArray<LinkTester>) {
    const { count, x: xA, y: yA, z: zA } = featuresA;
    const { lookup3d } = featuresB;

    // the lookup queries need to happen in the "unitB space".
    // that means imageA = inverseOperB(operA(i))
    const imageTransform = Mat4.mul(_imageTransform, unitB.conformation.operator.inverse, unitA.conformation.operator.matrix)
    const isNotIdentity = !Mat4.isIdentity(imageTransform)
    const imageA = Vec3()

    const maxDistanceSq = Math.max(...testers.map(t => t.maxDistanceSq))
    const { center, radius } = lookup3d.boundary.sphere;
    const testDistanceSq = (radius + maxDistanceSq) * (radius + maxDistanceSq);

    const infoA = Features.Info(structure, unitA, featuresA)
    const infoB = Features.Info(structure, unitB, featuresB)

    builder.startUnitPair(unitA, unitB)

    for (let i = 0; i < count; ++i) {
        Vec3.set(imageA, xA[i], yA[i], zA[i])
        if (isNotIdentity) Vec3.transformMat4(imageA, imageA, imageTransform)
        if (Vec3.squaredDistance(imageA, center) > testDistanceSq) continue

        const { indices, count, squaredDistances } = lookup3d.find(imageA[0], imageA[1], imageA[2], MAX_DISTANCE)
        if (count === 0) continue

        infoA.feature = i

        for (let r = 0; r < count; ++r) {
            const j = indices[r]
            const distanceSq = squaredDistances[r]
            infoB.feature = j
            for (const tester of testers) {
                if (distanceSq < tester.maxDistanceSq) {
                    const type = tester.getType(structure, infoA, infoB, distanceSq)
                    if (type) builder.add(i, j, type)
                }
            }
        }
    }

    builder.finishUnitPair()
}