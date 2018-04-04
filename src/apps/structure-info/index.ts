/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as argparse from 'argparse'
import fetch from 'node-fetch'
require('util.promisify').shim();

// import { Table } from 'mol-data/db'
import CIF from 'mol-io/reader/cif'
import Computation from 'mol-util/computation'
import { Model } from 'mol-model/structure'

function showProgress(tag: string, p: Computation.Progress) {
    console.log(`[${tag}] ${p.message} ${p.isIndeterminate ? '' : (p.current / p.max * 100).toFixed(2) + '% '}(${p.elapsedMs | 0}ms)`)
}

async function parseCif(data: string|Uint8Array) {
    const comp = CIF.parse(data)
    const ctx = Computation.observable({
        updateRateMs: 250,
        observer: p => showProgress(`cif parser ${typeof data === 'string' ? 'string' : 'binary'}`, p)
    });
    const parsed = await comp(ctx);
    if (parsed.isError) throw parsed;
    return parsed
}

async function getPdb(pdb: string) {
    const data = await fetch(`https://files.rcsb.org/download/${pdb}.cif`)
    const parsed = await parseCif(await data.text())
    return CIF.schema.mmCIF(parsed.result.blocks[0])
}

function atomLabel(model: Model, aI: number) {
    const { atoms, residues, chains, residueSegments, chainSegments } = model.hierarchy
    const { label_atom_id } = atoms
    const { label_comp_id, label_seq_id } = residues
    const { label_asym_id } = chains
    const rI = residueSegments.segmentMap[aI]
    const cI = chainSegments.segmentMap[aI]
    return `${label_asym_id.value(cI)} ${label_comp_id.value(rI)} ${label_seq_id.value(rI)} ${label_atom_id.value(aI)}`
}

function printBonds(model: Model) {
    const { count, offset, neighbor } = Model.bonds(model)
    for (let i = 0; i < count; ++i) {
        const start = offset[i];
        const end = offset[i + 1];
        for (let bI = start; bI < end; bI++) {
            console.log(`${atomLabel(model, i)} -- ${atomLabel(model, neighbor[bI])}`)
        }
    }
}

async function run(pdb: string) {
    const mmcif = await getPdb(pdb)
    const models = Model.create({ kind: 'mmCIF', data: mmcif });
    // const structure = Structure.ofModel(models[0])
    // console.log(structure)
    printBonds(models[0])
}

const parser = new argparse.ArgumentParser({
  addHelp: true,
  description: 'Print info about a structure, mainly to test and showcase the mol-model module'
});
parser.addArgument([ '--pdb', '-p' ], {
    help: 'Pdb entry id'
});
interface Args {
    pdb: string
}
const args: Args = parser.parseArgs();

run(args.pdb)