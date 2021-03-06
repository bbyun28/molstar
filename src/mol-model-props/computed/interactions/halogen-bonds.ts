/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Fred Ludlow <Fred.Ludlow@astx.com>
 *
 * based in part on NGL (https://github.com/arose/ngl)
 */

import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { Structure, Unit, StructureElement } from '../../../mol-model/structure';
import { calcAngles } from '../chemistry/geometry';
import { FeaturesBuilder, Features } from './features';
import { ElementSymbol } from '../../../mol-model/structure/model/types';
import { typeSymbol, altLoc, eachBondedAtom } from '../chemistry/util';
import { Elements } from '../../../mol-model/structure/model/properties/atomic/types';
import { degToRad } from '../../../mol-math/misc';
import { FeatureType, FeatureGroup, InteractionType } from './common';
import { LinkProvider } from './links';

export const HalogenBondsParams = {
    distanceMax: PD.Numeric(4.0, { min: 1, max: 5, step: 0.1 }),
    angleMax: PD.Numeric(30, { min: 0, max: 60, step: 1 }),
}
export type HalogenBondsParams = typeof HalogenBondsParams
export type HalogenBondsProps = PD.Values<HalogenBondsParams>

const halBondElements = [Elements.CL, Elements.BR, Elements.I, Elements.AT] as ElementSymbol[]

/**
 * Halogen bond donors (X-C, with X one of Cl, Br, I or At) not F!
 */
export function addUnitHalogenDonors (structure: Structure, unit: Unit.Atomic, builder: FeaturesBuilder) {
    const { elements } = unit
    const { x, y, z } = unit.model.atomicConformation

    for (let i = 0 as StructureElement.UnitIndex, il = elements.length; i < il; ++i) {
        const element = typeSymbol(unit, i)
        if (halBondElements.includes(element)) {
            builder.addOne(FeatureType.HalogenDonor, FeatureGroup.None, x[elements[i]], y[elements[i]], z[elements[i]], i)
        }
    }
}

const X = [Elements.N, Elements.O, Elements.S] as ElementSymbol[]
const Y = [Elements.C, Elements.N, Elements.P, Elements.S] as ElementSymbol[]

/**
 * Halogen bond acceptors (Y-{O|N|S}, with Y=C,P,N,S)
 */
export function addUnitHalogenAcceptors (structure: Structure, unit: Unit.Atomic, builder: FeaturesBuilder) {
    const { elements } = unit
    const { x, y, z } = unit.model.atomicConformation

    for (let i = 0 as StructureElement.UnitIndex, il = elements.length; i < il; ++i) {
        const element = typeSymbol(unit, i)
        if (X.includes(element)) {
            let flag = false
            eachBondedAtom(structure, unit, i, (unitB, indexB) => {
                if (Y.includes(typeSymbol(unitB, indexB))) {
                    flag = true
                }
            })
            if (flag) {
                builder.addOne(FeatureType.HalogenAcceptor, FeatureGroup.None, x[elements[i]], y[elements[i]], z[elements[i]], i)
            }
        }
    }
}

function isHalogenBond (ti: FeatureType, tj: FeatureType) {
  return (
    (ti === FeatureType.HalogenAcceptor && tj === FeatureType.HalogenDonor) ||
    (ti === FeatureType.HalogenDonor && tj === FeatureType.HalogenAcceptor)
  )
}

// http://www.pnas.org/content/101/48/16789.full
const OptimalHalogenAngle = degToRad(180)  // adjusted from 165 to account for spherical statistics
const OptimalAcceptorAngle = degToRad(120)

interface Info {
    unit: Unit.Atomic,
    types: ArrayLike<FeatureType>,
    feature: number,
    members: ArrayLike<StructureElement.UnitIndex>,
    offsets: ArrayLike<number>,
}
function Info(structure: Structure, unit: Unit.Atomic, features: Features) {
    return {
        unit,
        types: features.types,
        members: features.members,
        offsets: features.offsets,
    } as Info
}

function getOptions(props: HalogenBondsProps) {
    return {
        distanceMax: props.distanceMax,
        angleMax: degToRad(props.angleMax),
    }
}
type Options = ReturnType<typeof getOptions>

function testHalogenBond(structure: Structure, infoA: Info, infoB: Info, opts: Options): InteractionType | undefined {
    const typeA = infoA.types[infoA.feature]
    const typeB = infoB.types[infoB.feature]

    if (!isHalogenBond(typeA, typeB)) return

    const [don, acc] = typeA === FeatureType.HalogenDonor ? [infoA, infoB] : [infoB, infoA]

    const donIndex = don.members[don.offsets[don.feature]]
    const accIndex = acc.members[acc.offsets[acc.feature]]

    if (accIndex === donIndex) return // DA to self

    const altD = altLoc(don.unit, donIndex)
    const altA = altLoc(acc.unit, accIndex)

    if (altD && altA && altD !== altA) return // incompatible alternate location id
    if (don.unit.residueIndex[don.unit.elements[donIndex]] === acc.unit.residueIndex[acc.unit.elements[accIndex]]) return // same residue

    const halogenAngles = calcAngles(structure, don.unit, donIndex, acc.unit, accIndex)
    // Singly bonded halogen only (not bromide ion for example)
    if (halogenAngles.length !== 1) return
    if (OptimalHalogenAngle - halogenAngles[0] > opts.angleMax) return

    const acceptorAngles = calcAngles(structure, acc.unit, accIndex, don.unit, donIndex)
    // Angle must be defined. Excludes water as acceptor. Debatable
    if (acceptorAngles.length === 0) return
    if (acceptorAngles.some(acceptorAngle => OptimalAcceptorAngle - acceptorAngle > opts.angleMax)) return

    return InteractionType.HalogenBond
}

export const HalogenBondsProvider: LinkProvider<HalogenBondsParams> = {
    name: 'halogen-bonds',
    params: HalogenBondsParams,
    createTester: (props: HalogenBondsProps) => {
        const opts = getOptions(props)
        return {
            maxDistanceSq: props.distanceMax * props.distanceMax,
            getType: (structure, infoA, infoB) => testHalogenBond(structure, infoA, infoB, opts)
        }
    }
}