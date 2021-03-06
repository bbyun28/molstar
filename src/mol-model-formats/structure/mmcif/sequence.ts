/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { mmCIF_Database as mmCIF } from '../../../mol-io/reader/cif/schema/mmcif'
import StructureSequence from '../../../mol-model/structure/model/properties/sequence'
import { Column } from '../../../mol-data/db';
import { AtomicHierarchy } from '../../../mol-model/structure/model/properties/atomic';
import { Entities } from '../../../mol-model/structure/model/properties/common';
import { Sequence } from '../../../mol-model/sequence';
import { CoarseHierarchy } from '../../../mol-model/structure/model/properties/coarse';

export function getSequence(cif: mmCIF, entities: Entities, atomicHierarchy: AtomicHierarchy, coarseHierarchy: CoarseHierarchy, modResMap: ReadonlyMap<string, string>): StructureSequence {
    if (!cif.entity_poly_seq._rowCount) {
        return StructureSequence.fromHierarchy(entities, atomicHierarchy, coarseHierarchy, modResMap);
    }

    const { entity_id, num, mon_id } = cif.entity_poly_seq;

    const byEntityKey: StructureSequence['byEntityKey'] = {};
    const sequences: StructureSequence.Entity[] = [];
    const count = entity_id.rowCount;

    let i = 0;
    while (i < count) {
        const start = i;
        while (i < count - 1 && entity_id.areValuesEqual(i, i + 1)) i++;
        i++;

        const id = entity_id.value(start);
        const compId = Column.window(mon_id, start, i);
        const seqId = Column.window(num, start, i);
        const entityKey = entities.getEntityIndex(id);

        byEntityKey[entityKey] = {
            entityId: id,
            sequence: Sequence.ofResidueNames(compId, seqId, modResMap)
        };

        sequences.push(byEntityKey[entityKey]);
    }

    return { byEntityKey, sequences };
}