/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PluginContext } from '../../../context';
import { State, StateObjectCell } from '../../../../mol-state';
import { RuntimeContext } from '../../../../mol-task';
import { Structure } from '../../../../mol-model/structure';
import { ParamDefinition as PD } from '../../../../mol-util/param-definition';
import { PluginStateObject } from '../../objects';

export interface StructureRepresentationProvider<P = any, S = {}> {
    id: string,
    display: { name: string, group: string, description?: string },
    isApplicable?(structure: Structure, plugin: PluginContext): boolean,
    params?(structure: Structure | undefined, plugin: PluginContext): PD.Def<P>,
    apply(ctx: RuntimeContext, state: State, structure: StateObjectCell<PluginStateObject.Molecule.Structure>, params: P, plugin: PluginContext): Promise<S> | S,
    // TODO: Custom remove function for more complicated things
    // remove?(state: State, ref: string, plugin: PluginContext): void
}

export const enum RepresentationProviderTags {
    Representation = 'preset-structure-representation',
    Selection = 'preset-structure-selection'
}

export function StructureRepresentationProvider<P, S>(repr: StructureRepresentationProvider<P, S>) { return repr; }