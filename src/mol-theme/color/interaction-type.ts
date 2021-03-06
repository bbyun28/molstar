/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Location } from '../../mol-model/location';
import { Color, ColorMap } from '../../mol-util/color';
import { ParamDefinition as PD } from '../../mol-util/param-definition'
import { InteractionsProvider } from '../../mol-model-props/computed/interactions';
import { ThemeDataContext } from '../theme';
import { ColorTheme, LocationColor } from '../color';
import { InteractionType } from '../../mol-model-props/computed/interactions/common';
import { TableLegend } from '../../mol-util/legend';
import { Task } from '../../mol-task';
import { Interactions } from '../../mol-model-props/computed/interactions/interactions';

const DefaultColor = Color(0xCCCCCC)
const Description = 'Assigns colors according the interaction type of a link.'

const InteractionTypeColors = ColorMap({
    HydrogenBond: 0x2B83BA,
    Hydrophobic: 0x808080,
    HalogenBond: 0x40FFBF,
    Ionic: 0xF0C814,
    MetalCoordination: 0x8C4099,
    CationPi: 0xFF8000,
    PiStacking: 0x8CB366,
    WeakHydrogenBond: 0xC5DDEC,
})

const InteractionTypeColorTable: [string, Color][] = [
    ['Hydrogen Bond', InteractionTypeColors.HydrogenBond],
    ['Hydrophobic', InteractionTypeColors.Hydrophobic],
    ['Halogen Bond', InteractionTypeColors.HalogenBond],
    ['Ionic', InteractionTypeColors.Ionic],
    ['Metal Coordination', InteractionTypeColors.MetalCoordination],
    ['Cation Pi', InteractionTypeColors.CationPi],
    ['Pi Stacking', InteractionTypeColors.PiStacking],
    ['Weak HydrogenBond', InteractionTypeColors.WeakHydrogenBond],
]

function typeColor(type: InteractionType): Color {
    switch (type) {
        case InteractionType.HydrogenBond:
        case InteractionType.WaterHydrogenBond:
        case InteractionType.BackboneHydrogenBond:
            return InteractionTypeColors.HydrogenBond
        case InteractionType.Hydrophobic:
            return InteractionTypeColors.Hydrophobic
        case InteractionType.HalogenBond:
            return InteractionTypeColors.HalogenBond
        case InteractionType.IonicInteraction:
            return InteractionTypeColors.Ionic
        case InteractionType.MetalCoordination:
            return InteractionTypeColors.MetalCoordination
        case InteractionType.CationPi:
            return InteractionTypeColors.CationPi
        case InteractionType.PiStacking:
            return InteractionTypeColors.PiStacking
        case InteractionType.WeakHydrogenBond:
            return InteractionTypeColors.WeakHydrogenBond
        case InteractionType.Unknown:
            return DefaultColor
    }
}

export const InteractionTypeColorThemeParams = { }
export type InteractionTypeColorThemeParams = typeof InteractionTypeColorThemeParams
export function getInteractionTypeColorThemeParams(ctx: ThemeDataContext) {
    return InteractionTypeColorThemeParams // TODO return copy
}

export function InteractionTypeColorTheme(ctx: ThemeDataContext, props: PD.Values<InteractionTypeColorThemeParams>): ColorTheme<InteractionTypeColorThemeParams> {
    let color: LocationColor

    const interactions = ctx.structure ? InteractionsProvider.getValue(ctx.structure) : undefined
    const contextHash = interactions?.version

    if (interactions && interactions.value) {
        color = (location: Location) => {
            if (Interactions.isLocation(location)) {
                const { interactions, unitA, indexA, unitB, indexB } = location
                if (location.unitA === location.unitB) {
                    const links = interactions.unitsLinks.get(location.unitA.id)
                    const idx = links.getDirectedEdgeIndex(location.indexA, location.indexB)
                    return typeColor(links.edgeProps.type[idx])
                } else {
                    const idx = interactions.links.getEdgeIndex(indexA, unitA, indexB, unitB)
                    return typeColor(interactions.links.edges[idx].props.type)
                }
            }
            return DefaultColor
        }
    } else {
        color = () => DefaultColor
    }

    return {
        factory: InteractionTypeColorTheme,
        granularity: 'group',
        color: color,
        props: props,
        contextHash,
        description: Description,
        legend: TableLegend(InteractionTypeColorTable)
    }
}

export const InteractionTypeColorThemeProvider: ColorTheme.Provider<InteractionTypeColorThemeParams> = {
    label: 'Interaction Type',
    factory: InteractionTypeColorTheme,
    getParams: getInteractionTypeColorThemeParams,
    defaultValues: PD.getDefaultValues(InteractionTypeColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure,
    ensureDependencies: (ctx: ThemeDataContext) => {
        return ctx.structure ? InteractionsProvider.attach(ctx.structure) : Task.empty()
    }
}