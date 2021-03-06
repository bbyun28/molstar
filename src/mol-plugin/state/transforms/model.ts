/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { parsePDB } from '../../../mol-io/reader/pdb/parser';
import { Vec3, Mat4, Quat } from '../../../mol-math/linear-algebra';
import { trajectoryFromMmCIF } from '../../../mol-model-formats/structure/mmcif';
import { trajectoryFromPDB } from '../../../mol-model-formats/structure/pdb';
import { Model, Queries, QueryContext, Structure, StructureQuery, StructureSelection as Sel, StructureElement } from '../../../mol-model/structure';
import { PluginContext } from '../../../mol-plugin/context';
import { MolScriptBuilder } from '../../../mol-script/language/builder';
import Expression from '../../../mol-script/language/expression';
import { StateObject, StateTransformer } from '../../../mol-state';
import { RuntimeContext, Task } from '../../../mol-task';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { stringToWords } from '../../../mol-util/string';
import { PluginStateObject as SO, PluginStateTransform } from '../objects';
import { trajectoryFromGRO } from '../../../mol-model-formats/structure/gro';
import { parseGRO } from '../../../mol-io/reader/gro/parser';
import { shapeFromPly } from '../../../mol-model-formats/shape/ply';
import { SymmetryOperator } from '../../../mol-math/geometry';
import { Script } from '../../../mol-script/script';
import { parse3DG } from '../../../mol-io/reader/3dg/parser';
import { trajectoryFrom3DG } from '../../../mol-model-formats/structure/3dg';
import { StructureSelectionQueries } from '../../util/structure-selection-helper';
import { StructureQueryHelper } from '../../util/structure-query';
import { ModelStructureRepresentation } from '../representation/model';

export { TrajectoryFromBlob };
export { TrajectoryFromMmCif };
export { TrajectoryFromPDB };
export { TrajectoryFromGRO };
export { TrajectoryFrom3DG };
export { ModelFromTrajectory };
export { StructureFromTrajectory };
export { StructureFromModel };
export { StructureAssemblyFromModel };
export { TransformStructureConformation };
export { TransformStructureConformationByMatrix };
export { StructureSelectionFromExpression };
export { MultiStructureSelectionFromExpression }
export { StructureSelectionFromScript };
export { StructureSelectionFromBundle };
export { StructureComplexElement };
export { CustomModelProperties };
export { CustomStructureProperties };

type TrajectoryFromBlob = typeof TrajectoryFromBlob
const TrajectoryFromBlob = PluginStateTransform.BuiltIn({
    name: 'trajectory-from-blob',
    display: { name: 'Parse Blob', description: 'Parse format blob into a single trajectory.' },
    from: SO.Format.Blob,
    to: SO.Molecule.Trajectory
})({
    apply({ a }) {
        return Task.create('Parse Format Blob', async ctx => {
            const models: Model[] = [];
            for (const e of a.data) {
                if (e.kind !== 'cif') continue;
                const block = e.data.blocks[0];
                const xs = await trajectoryFromMmCIF(block).runInContext(ctx);
                if (xs.length === 0) throw new Error('No models found.');
                for (const x of xs) models.push(x);
            }

            const props = { label: `Trajectory`, description: `${models.length} model${models.length === 1 ? '' : 's'}` };
            return new SO.Molecule.Trajectory(models, props);
        });
    }
});

type TrajectoryFromMmCif = typeof TrajectoryFromMmCif
const TrajectoryFromMmCif = PluginStateTransform.BuiltIn({
    name: 'trajectory-from-mmcif',
    display: { name: 'Trajectory from mmCIF', description: 'Identify and create all separate models in the specified CIF data block' },
    from: SO.Format.Cif,
    to: SO.Molecule.Trajectory,
    params(a) {
        if (!a) {
            return {
                blockHeader: PD.Optional(PD.Text(void 0, { description: 'Header of the block to parse. If none is specifed, the 1st data block in the file is used.' }))
            };
        }
        const { blocks } = a.data;
        return {
            blockHeader: PD.Optional(PD.Select(blocks[0] && blocks[0].header, blocks.map(b => [b.header, b.header] as [string, string]), { description: 'Header of the block to parse' }))
        };
    }
})({
    isApplicable: a => a.data.blocks.length > 0,
    apply({ a, params }) {
        return Task.create('Parse mmCIF', async ctx => {
            const header = params.blockHeader || a.data.blocks[0].header;
            const block = a.data.blocks.find(b => b.header === header);
            if (!block) throw new Error(`Data block '${[header]}' not found.`);
            const models = await trajectoryFromMmCIF(block).runInContext(ctx);
            if (models.length === 0) throw new Error('No models found.');
            const props = { label: `${models[0].entry}`, description: `${models.length} model${models.length === 1 ? '' : 's'}` };
            return new SO.Molecule.Trajectory(models, props);
        });
    }
});

type TrajectoryFromPDB = typeof TrajectoryFromPDB
const TrajectoryFromPDB = PluginStateTransform.BuiltIn({
    name: 'trajectory-from-pdb',
    display: { name: 'Parse PDB', description: 'Parse PDB string and create trajectory.' },
    from: [SO.Data.String],
    to: SO.Molecule.Trajectory
})({
    apply({ a }) {
        return Task.create('Parse PDB', async ctx => {
            const parsed = await parsePDB(a.data, a.label).runInContext(ctx);
            if (parsed.isError) throw new Error(parsed.message);
            const models = await trajectoryFromPDB(parsed.result).runInContext(ctx);
            const props = { label: `${models[0].entry}`, description: `${models.length} model${models.length === 1 ? '' : 's'}` };
            return new SO.Molecule.Trajectory(models, props);
        });
    }
});

type TrajectoryFromGRO = typeof TrajectoryFromGRO
const TrajectoryFromGRO = PluginStateTransform.BuiltIn({
    name: 'trajectory-from-gro',
    display: { name: 'Parse GRO', description: 'Parse GRO string and create trajectory.' },
    from: [SO.Data.String],
    to: SO.Molecule.Trajectory
})({
    apply({ a }) {
        return Task.create('Parse GRO', async ctx => {
            const parsed = await parseGRO(a.data).runInContext(ctx);
            if (parsed.isError) throw new Error(parsed.message);
            const models = await trajectoryFromGRO(parsed.result).runInContext(ctx);
            const props = { label: `${models[0].entry}`, description: `${models.length} model${models.length === 1 ? '' : 's'}` };
            return new SO.Molecule.Trajectory(models, props);
        });
    }
});

type TrajectoryFrom3DG = typeof TrajectoryFrom3DG
const TrajectoryFrom3DG = PluginStateTransform.BuiltIn({
    name: 'trajectory-from-3dg',
    display: { name: 'Parse 3DG', description: 'Parse 3DG string and create trajectory.' },
    from: [SO.Data.String],
    to: SO.Molecule.Trajectory
})({
    apply({ a }) {
        return Task.create('Parse 3DG', async ctx => {
            const parsed = await parse3DG(a.data).runInContext(ctx);
            if (parsed.isError) throw new Error(parsed.message);
            const models = await trajectoryFrom3DG(parsed.result).runInContext(ctx);
            const props = { label: `${models[0].entry}`, description: `${models.length} model${models.length === 1 ? '' : 's'}` };
            return new SO.Molecule.Trajectory(models, props);
        });
    }
});

const plus1 = (v: number) => v + 1, minus1 = (v: number) => v - 1;
type ModelFromTrajectory = typeof ModelFromTrajectory
const ModelFromTrajectory = PluginStateTransform.BuiltIn({
    name: 'model-from-trajectory',
    display: { name: 'Molecular Model', description: 'Create a molecular model from specified index in a trajectory.' },
    from: SO.Molecule.Trajectory,
    to: SO.Molecule.Model,
    params: a => {
        if (!a) {
            return { modelIndex: PD.Numeric(0, {}, { description: 'Zero-based index of the model' }) };
        }
        return { modelIndex: PD.Converted(plus1, minus1, PD.Numeric(1, { min: 1, max: a.data.length, step: 1 }, { description: 'Model Index' })) }
    }
})({
    isApplicable: a => a.data.length > 0,
    apply({ a, params }) {
        if (params.modelIndex < 0 || params.modelIndex >= a.data.length) throw new Error(`Invalid modelIndex ${params.modelIndex}`);
        const model = a.data[params.modelIndex];
        const label = `Model ${model.modelNum}`
        const description = a.data.length === 1 ? undefined : `Model ${params.modelIndex + 1} of ${a.data.length}`
        return new SO.Molecule.Model(model, { label, description });
    }
});

type StructureFromTrajectory = typeof StructureFromTrajectory
const StructureFromTrajectory = PluginStateTransform.BuiltIn({
    name: 'structure-from-trajectory',
    display: { name: 'Structure from Trajectory', description: 'Create a molecular structure from a trajectory.' },
    from: SO.Molecule.Trajectory,
    to: SO.Molecule.Structure
})({
    apply({ a }) {
        return Task.create('Build Structure', async ctx => {
            const s = Structure.ofTrajectory(a.data);
            const props = { label: 'Ensemble', description: Structure.elementDescription(s) };
            return new SO.Molecule.Structure(s, props);
        })
    }
});

type StructureFromModel = typeof StructureFromModel
const StructureFromModel = PluginStateTransform.BuiltIn({
    name: 'structure-from-model',
    display: { name: 'Structure', description: 'Create a molecular structure (deposited, assembly, or symmetry) from the specified model.' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Structure,
    params(a) { return ModelStructureRepresentation.getParams(a && a.data); }
})({
    apply({ a, params }, plugin: PluginContext) {
        return Task.create('Build Structure', async ctx => {
            return ModelStructureRepresentation.create(plugin, ctx, a.data, params && params.type);
        })
    }
});

// TODO: deprecate this in favor of StructureFromModel
type StructureAssemblyFromModel = typeof StructureAssemblyFromModel
const StructureAssemblyFromModel = PluginStateTransform.BuiltIn({
    name: 'structure-assembly-from-model',
    display: { name: 'Structure Assembly', description: 'Create a molecular structure assembly.' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Structure,
    params(a) {
        if (!a) {
            return { id: PD.Optional(PD.Text('', { label: 'Assembly Id', description: 'Assembly Id. Value \'deposited\' can be used to specify deposited asymmetric unit.' })) };
        }
        const model = a.data;
        const ids = model.symmetry.assemblies.map(a => [a.id, `${a.id}: ${stringToWords(a.details)}`] as [string, string]);
        ids.push(['deposited', 'Deposited']);
        return {
            id: PD.Optional(PD.Select(ids[0][0], ids, { label: 'Asm Id', description: 'Assembly Id' }))
        };
    }
})({
    apply({ a, params }, plugin: PluginContext) {
        return Task.create('Build Assembly', async ctx => {
            return ModelStructureRepresentation.create(plugin, ctx, a.data, { name: 'assembly', params });
        })
    }
});

const _translation = Vec3.zero(), _m = Mat4.zero(), _n = Mat4.zero();
type TransformStructureConformation = typeof TransformStructureConformation
const TransformStructureConformation = PluginStateTransform.BuiltIn({
    name: 'transform-structure-conformation',
    display: { name: 'Transform Conformation' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: {
        axis: PD.Vec3(Vec3.create(1, 0, 0)),
        angle: PD.Numeric(0, { min: -180, max: 180, step: 0.1 }),
        translation: PD.Vec3(Vec3.create(0, 0, 0)),
    }
})({
    canAutoUpdate() {
        return true;
    },
    apply({ a, params }) {
        // TODO: optimze

        const center = a.data.boundary.sphere.center;
        Mat4.fromTranslation(_m, Vec3.negate(_translation, center));
        Mat4.fromTranslation(_n, Vec3.add(_translation, center, params.translation));
        const rot = Mat4.fromRotation(Mat4.zero(), Math.PI / 180 * params.angle, Vec3.normalize(Vec3.zero(), params.axis));

        const m = Mat4.zero();
        Mat4.mul3(m, _n, rot, _m);

        const s = Structure.transform(a.data, m);
        const props = { label: `${a.label}`, description: `Transformed` };
        return new SO.Molecule.Structure(s, props);
    },
    interpolate(src, tar, t) {
        // TODO: optimize
        const u = Mat4.fromRotation(Mat4.zero(), Math.PI / 180 * src.angle, Vec3.normalize(Vec3.zero(), src.axis));
        Mat4.setTranslation(u, src.translation);
        const v = Mat4.fromRotation(Mat4.zero(), Math.PI / 180 * tar.angle, Vec3.normalize(Vec3.zero(), tar.axis));
        Mat4.setTranslation(v, tar.translation);
        const m = SymmetryOperator.slerp(Mat4.zero(), u, v, t);
        const rot = Mat4.getRotation(Quat.zero(), m);
        const axis = Vec3.zero();
        const angle = Quat.getAxisAngle(axis, rot);
        const translation = Mat4.getTranslation(Vec3.zero(), m);
        return { axis, angle, translation };
    }
});

type TransformStructureConformationByMatrix = typeof TransformStructureConformation
const TransformStructureConformationByMatrix = PluginStateTransform.BuiltIn({
    name: 'transform-structure-conformation-by-matrix',
    display: { name: 'Transform Conformation' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: {
        matrix: PD.Value<Mat4>(Mat4.identity(), { isHidden: true })
    }
})({
    canAutoUpdate() {
        return true;
    },
    apply({ a, params }) {
        const s = Structure.transform(a.data, params.matrix);
        const props = { label: `${a.label}`, description: `Transformed` };
        return new SO.Molecule.Structure(s, props);
    }
});

type StructureSelectionFromExpression = typeof StructureSelectionFromExpression
const StructureSelectionFromExpression = PluginStateTransform.BuiltIn({
    name: 'structure-selection-from-expression',
    display: { name: 'Selection', description: 'Create a molecular structure from the specified expression.' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: {
        expression: PD.Value<Expression>(MolScriptBuilder.struct.generator.all, { isHidden: true }),
        label: PD.Optional(PD.Text('', { isHidden: true }))
    }
})({
    apply({ a, params, cache }) {
        const { selection, entry } = StructureQueryHelper.createAndRun(a.data, params.expression);
        (cache as any).entry = entry;

        if (Sel.isEmpty(selection)) return StateObject.Null;
        const s = Sel.unionStructure(selection);
        const props = { label: `${params.label || 'Selection'}`, description: Structure.elementDescription(s) };
        return new SO.Molecule.Structure(s, props);
    },
    update: ({ a, b, oldParams, newParams, cache }) => {
        if (oldParams.expression !== newParams.expression) return StateTransformer.UpdateResult.Recreate;

        const entry = (cache as { entry: StructureQueryHelper.CacheEntry }).entry;

        if (entry.currentStructure === a.data) {
            return StateTransformer.UpdateResult.Unchanged;
        }

        const selection = StructureQueryHelper.updateStructure(entry, a.data);
        if (Sel.isEmpty(selection)) return StateTransformer.UpdateResult.Null;

        StructureQueryHelper.updateStructureObject(b, selection, newParams.label);
        return StateTransformer.UpdateResult.Updated;
    }
});

type MultiStructureSelectionFromExpression = typeof MultiStructureSelectionFromExpression
const MultiStructureSelectionFromExpression = PluginStateTransform.BuiltIn({
    name: 'structure-multi-selection-from-expression',
    display: { name: 'Multi-structure Measurement Selection', description: 'Create selection object from multiple structures.' },
    from: SO.Root,
    to: SO.Molecule.Structure.Selections,
    params: {
        selections: PD.ObjectList({
            key: PD.Text(void 0, { description: 'A unique key.' }),
            ref: PD.Text(),
            groupId: PD.Optional(PD.Text()),
            expression: PD.Value<Expression>(MolScriptBuilder.struct.generator.empty)
        }, e => e.ref, { isHidden: true }),
        isTransitive: PD.Optional(PD.Boolean(false, { isHidden: true, description: 'Remap the selections from the original structure if structurally equivalent.' })),
        label: PD.Optional(PD.Text('', { isHidden: true }))
    }
})({
    apply({ params, cache, dependencies }) {
        const entries = new Map<string, StructureQueryHelper.CacheEntry>();

        const selections: SO.Molecule.Structure.SelectionEntry[] = [];
        let totalSize = 0;

        for (const sel of params.selections) {
            const { selection, entry } = StructureQueryHelper.createAndRun(dependencies![sel.ref].data as Structure, sel.expression);
            entries.set(sel.key, entry);
            const loci = Sel.toLociWithSourceUnits(selection);
            selections.push({ key: sel.key, loci, groupId: sel.groupId });
            totalSize += StructureElement.Loci.size(loci);
        }

        (cache as object as any).entries = entries;

        // console.log(selections);

        const props = { label: `${params.label || 'Multi-selection'}`, description: `${params.selections.length} source(s), ${totalSize} element(s) total` };
        return new SO.Molecule.Structure.Selections(selections, props);
    },
    update: ({ b, oldParams, newParams, cache, dependencies }) => {
        if (!!oldParams.isTransitive !== !!newParams.isTransitive) return StateTransformer.UpdateResult.Recreate;

        const cacheEntries = (cache as any).entries as Map<string, StructureQueryHelper.CacheEntry>;
        const entries = new Map<string, StructureQueryHelper.CacheEntry>();

        const current = new Map<string, SO.Molecule.Structure.SelectionEntry>();
        for (const e of b.data) current.set(e.key, e);

        let changed = false;
        let totalSize = 0;

        const selections: SO.Molecule.Structure.SelectionEntry[] = [];
        for (const sel of newParams.selections) {
            const structure = dependencies![sel.ref].data as Structure;

            let recreate = false;

            if (cacheEntries.has(sel.key)) {
                const entry = cacheEntries.get(sel.key)!;
                if (StructureQueryHelper.isUnchanged(entry, sel.expression, structure) && current.has(sel.key)) {
                    const loci = current.get(sel.key)!;
                    if (loci.groupId !== sel.groupId) {
                        loci.groupId = sel.groupId;
                        changed = true;
                    }
                    entries.set(sel.key, entry);
                    selections.push(loci);
                    totalSize += StructureElement.Loci.size(loci.loci);

                    continue;
                } if (entry.expression !== sel.expression) {
                    recreate = true;
                } else {
                    // TODO: properly support "transitive" queries. For that Structure.areUnitAndIndicesEqual needs to be fixed;
                    let update = false;

                    if (!!newParams.isTransitive) {
                        if (Structure.areUnitAndIndicesEqual(entry.originalStructure, structure)) {
                            const selection = StructureQueryHelper.run(entry, entry.originalStructure);
                            entry.currentStructure = structure;
                            entries.set(sel.key, entry);
                            const loci = StructureElement.Loci.remap(Sel.toLociWithSourceUnits(selection), structure);
                            selections.push({ key: sel.key, loci, groupId: sel.groupId });
                            totalSize += StructureElement.Loci.size(loci);
                            changed = true;
                        } else {
                            update = true;
                        }
                    } else {
                        update = true;
                    }

                    if (update) {
                        changed = true;
                        const selection = StructureQueryHelper.updateStructure(entry, structure);
                        entries.set(sel.key, entry);
                        const loci = Sel.toLociWithSourceUnits(selection);
                        selections.push({ key: sel.key, loci, groupId: sel.groupId });
                        totalSize += StructureElement.Loci.size(loci);
                    }
                }
            } else {
                recreate = true;
            }

            if (recreate) {
                changed = true;

                // create new selection
                const { selection, entry } = StructureQueryHelper.createAndRun(structure, sel.expression);
                entries.set(sel.key, entry);
                const loci = Sel.toLociWithSourceUnits(selection);
                selections.push({ key: sel.key, loci });
                totalSize += StructureElement.Loci.size(loci);
            }
        }

        if (!changed) return StateTransformer.UpdateResult.Unchanged;

        (cache as object as any).entries = entries;
        b.data = selections;
        b.label = `${newParams.label || 'Multi-selection'}`;
        b.description = `${selections.length} source(s), ${totalSize} element(s) total`;

        // console.log('updated', selections);

        return StateTransformer.UpdateResult.Updated;
    }
});

type StructureSelectionFromScript = typeof StructureSelectionFromScript
const StructureSelectionFromScript = PluginStateTransform.BuiltIn({
    name: 'structure-selection-from-script',
    display: { name: 'Selection', description: 'Create a molecular structure from the specified script.' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: {
        script: PD.Script({ language: 'mol-script', expression: '(sel.atom.atom-groups :residue-test (= atom.resname ALA))' }),
        label: PD.Optional(PD.Text(''))
    }
})({
    apply({ a, params, cache }) {
        const { selection, entry } = StructureQueryHelper.createAndRun(a.data, params.script);
        (cache as any).entry = entry;

        const s = Sel.unionStructure(selection);
        const props = { label: `${params.label || 'Selection'}`, description: Structure.elementDescription(s) };
        return new SO.Molecule.Structure(s, props);
    },
    update: ({ a, b, oldParams, newParams, cache }) => {
        if (!Script.areEqual(oldParams.script, newParams.script)) {
            return StateTransformer.UpdateResult.Recreate;
        }

        const entry = (cache as { entry: StructureQueryHelper.CacheEntry }).entry;

        if (entry.currentStructure === a.data) {
            return StateTransformer.UpdateResult.Unchanged;
        }

        const selection = StructureQueryHelper.updateStructure(entry, a.data);
        StructureQueryHelper.updateStructureObject(b, selection, newParams.label);
        return StateTransformer.UpdateResult.Updated;
    }
});

type StructureSelectionFromBundle = typeof StructureSelectionFromBundle
const StructureSelectionFromBundle = PluginStateTransform.BuiltIn({
    name: 'structure-selection-from-bundle',
    display: { name: 'Selection', description: 'Create a molecular structure from the specified structure-element bundle.' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: {
        bundle: PD.Value<StructureElement.Bundle>(StructureElement.Bundle.Empty, { isHidden: true }),
        label: PD.Optional(PD.Text('', { isHidden: true }))
    }
})({
    apply({ a, params, cache }) {
        if (params.bundle.hash !== a.data.hashCode) {
            // Bundle not compatible with given structure, set to empty bundle
            params.bundle = StructureElement.Bundle.Empty
        }

        (cache as { source: Structure }).source = a.data;

        const s = StructureElement.Bundle.toStructure(params.bundle, a.data);
        if (s.elementCount === 0) return StateObject.Null;

        const props = { label: `${params.label || 'Selection'}`, description: Structure.elementDescription(s) };
        return new SO.Molecule.Structure(s, props);
    },
    update: ({ a, b, oldParams, newParams, cache }) => {
        if (!StructureElement.Bundle.areEqual(oldParams.bundle, newParams.bundle)) {
            return StateTransformer.UpdateResult.Recreate;
        }

        if (newParams.bundle.hash !== a.data.hashCode) {
            // Bundle not compatible with given structure, set to empty bundle
            newParams.bundle = StructureElement.Bundle.Empty
        }

        if ((cache as { source: Structure }).source === a.data) {
            return StateTransformer.UpdateResult.Unchanged;
        }
        (cache as { source: Structure }).source = a.data;

        const s = StructureElement.Bundle.toStructure(newParams.bundle, a.data);
        if (s.elementCount === 0) return StateTransformer.UpdateResult.Null;

        b.label = `${newParams.label || 'Selection'}`;
        b.description = Structure.elementDescription(s);
        b.data = s;
        return StateTransformer.UpdateResult.Updated;
    }
});

export const StructureComplexElementTypes = {
    'protein-or-nucleic': 'protein-or-nucleic',

    'protein': 'protein',
    'nucleic': 'nucleic',
    'water': 'water',

    'branched': 'branched', // = carbs
    'ligand': 'ligand',
    'modified': 'modified',

    'coarse': 'coarse',

    // Legacy
    'atomic-sequence': 'atomic-sequence',
    'atomic-het': 'atomic-het',
    'spheres': 'spheres'
} as const
export type StructureComplexElementTypes = keyof typeof StructureComplexElementTypes

const StructureComplexElementTypeTuples = PD.objectToOptions(StructureComplexElementTypes);

type StructureComplexElement = typeof StructureComplexElement
const StructureComplexElement = PluginStateTransform.BuiltIn({
    name: 'structure-complex-element',
    display: { name: 'Complex Element', description: 'Create a molecular structure from the specified model.' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: { type: PD.Select<StructureComplexElementTypes>('atomic-sequence', StructureComplexElementTypeTuples, { isHidden: true }) }
})({
    apply({ a, params }) {
        // TODO: update function.

        let query: StructureQuery, label: string;
        switch (params.type) {
            case 'protein-or-nucleic': query = StructureSelectionQueries.proteinOrNucleic.query; label = 'Sequence'; break;

            case 'protein': query = StructureSelectionQueries.protein.query; label = 'Protein'; break;
            case 'nucleic': query = StructureSelectionQueries.nucleic.query; label = 'Nucleic'; break;
            case 'water': query = Queries.internal.water(); label = 'Water'; break;

            case 'branched': query = StructureSelectionQueries.branchedPlusConnected.query; label = 'Branched'; break;
            case 'ligand': query = StructureSelectionQueries.ligandPlusConnected.query; label = 'Ligand'; break;

            case 'modified': query = StructureSelectionQueries.modified.query; label = 'Modified'; break;

            case 'coarse': query = StructureSelectionQueries.coarse.query; label = 'Coarse'; break;

            case 'atomic-sequence': query = Queries.internal.atomicSequence(); label = 'Sequence'; break;
            case 'atomic-het': query = Queries.internal.atomicHet(); label = 'HET Groups/Ligands'; break;
            case 'spheres': query = Queries.internal.spheres(); label = 'Coarse Spheres'; break;

            default: throw new Error(`${params.type} is a not valid complex element.`);
        }

        const result = query(new QueryContext(a.data));
        const s = Sel.unionStructure(result);

        if (s.elementCount === 0) return StateObject.Null;
        return new SO.Molecule.Structure(s, { label, description: Structure.elementDescription(s) });
    }
});

type CustomModelProperties = typeof CustomModelProperties
const CustomModelProperties = PluginStateTransform.BuiltIn({
    name: 'custom-model-properties',
    display: { name: 'Custom Properties' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Model,
    params: (a, ctx: PluginContext) => {
        if (!a) return { properties: PD.MultiSelect([], [], { description: 'A list of property descriptor ids.' }) };
        return { properties: ctx.customModelProperties.getSelect(a.data) };
    }
})({
    apply({ a, params }, ctx: PluginContext) {
        return Task.create('Custom Props', async taskCtx => {
            await attachModelProps(a.data, ctx, taskCtx, params.properties);
            return new SO.Molecule.Model(a.data, { label: 'Model Props', description: `${params.properties.length} Selected` });
        });
    }
});
async function attachModelProps(model: Model, ctx: PluginContext, taskCtx: RuntimeContext, names: string[]) {
    for (const name of names) {
        try {
            const p = ctx.customModelProperties.get(name);
            await p.attach(model).runInContext(taskCtx);
        } catch (e) {
            ctx.log.warn(`Error attaching model prop '${name}': ${e}`);
        }
    }
}

type CustomStructureProperties = typeof CustomStructureProperties
const CustomStructureProperties = PluginStateTransform.BuiltIn({
    name: 'custom-structure-properties',
    display: { name: 'Custom Structure Properties' },
    from: SO.Molecule.Structure,
    to: SO.Molecule.Structure,
    params: (a, ctx: PluginContext) => {
        return ctx.customStructureProperties.getParams(a?.data || Structure.Empty)
    }
})({
    apply({ a, params }, ctx: PluginContext) {
        return Task.create('Custom Props', async taskCtx => {
            await attachStructureProps(a.data, ctx, taskCtx, params);
            return new SO.Molecule.Structure(a.data, { label: 'Structure Props' });
        });
    }
});
async function attachStructureProps(structure: Structure, ctx: PluginContext, taskCtx: RuntimeContext, params: PD.Values<PD.Params>) {
    for (const name of Object.keys(params)) {
        const property = ctx.customStructureProperties.get(name)
        const props = params[name as keyof typeof params]
        if (props.autoAttach) {
            await property.attach(structure, props).runInContext(taskCtx)
        } else {
            property.setProps(structure, props)
        }
    }
}

export { ShapeFromPly }
type ShapeFromPly = typeof ShapeFromPly
const ShapeFromPly = PluginStateTransform.BuiltIn({
    name: 'shape-from-ply',
    display: { name: 'Shape from PLY', description: 'Create Shape from PLY data' },
    from: SO.Format.Ply,
    to: SO.Shape.Provider,
    params(a) {
        return { };
    }
})({
    apply({ a, params }) {
        return Task.create('Create shape from PLY', async ctx => {
            const shape = await shapeFromPly(a.data, params).runInContext(ctx)
            const props = { label: 'Shape' };
            return new SO.Shape.Provider(shape, props);
        });
    }
});