/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { List } from 'immutable';
import { Canvas3D } from '../mol-canvas3d/canvas3d';
import { CustomPropertyRegistry, CustomStructureProperty } from '../mol-model-props/common/custom-property-registry';
import { StructureRepresentationRegistry } from '../mol-repr/structure/registry';
import { VolumeRepresentationRegistry } from '../mol-repr/volume/registry';
import { State, StateTransform, StateTransformer } from '../mol-state';
import { Task, Progress } from '../mol-task';
import { ColorTheme } from '../mol-theme/color';
import { SizeTheme } from '../mol-theme/size';
import { ThemeRegistryContext } from '../mol-theme/theme';
import { Color } from '../mol-util/color';
import { ajaxGet } from '../mol-util/data-source';
import { LogEntry } from '../mol-util/log-entry';
import { RxEventHelper } from '../mol-util/rx-event-helper';
import { merge } from 'rxjs';
import { BuiltInPluginBehaviors } from './behavior';
import { PluginBehavior } from './behavior/behavior';
import { PluginCommand, PluginCommands } from './command';
import { PluginLayout, LeftPanelTabName } from './layout';
import { PluginSpec } from './spec';
import { PluginState } from './state';
import { DataFormatRegistry } from './state/actions/data-format';
import { StateTransformParameters } from '../mol-plugin-ui/state/common';
import { LociLabelEntry, LociLabelManager } from './util/loci-label-manager';
import { TaskManager } from './util/task-manager';
import { PLUGIN_VERSION, PLUGIN_VERSION_DATE } from './version';
import { StructureElementSelectionManager } from './util/structure-element-selection';
import { SubstructureParentHelper } from './util/substructure-parent-helper';
import { ModifiersKeys } from '../mol-util/input/input-observer';
import { isProductionMode, isDebugMode } from '../mol-util/debug';
import { Model } from '../mol-model/structure';
import { Interactivity } from './util/interactivity';
import { StructureRepresentationHelper } from './util/structure-representation-helper';
import { StructureSelectionHelper } from './util/structure-selection-helper';
import { StructureOverpaintHelper } from './util/structure-overpaint-helper';
import { PluginToastManager } from './state/toast';
import { StructureMeasurementManager } from './util/structure-measurement';
import { ViewportScreenshotHelper } from './util/viewport-screenshot';
import { StructureRepresentationManager } from './state/representation/structure';

interface Log {
    entries: List<LogEntry>
    readonly entry: (e: LogEntry) => void
    readonly error: (msg: string) => void
    readonly message: (msg: string) => void
    readonly info: (msg: string) => void
    readonly warn: (msg: string) => void
}

export class PluginContext {
    private disposed = false;
    private ev = RxEventHelper.create();
    private tasks = new TaskManager();

    readonly state = new PluginState(this);
    readonly commands = new PluginCommand.Manager();

    readonly events = {
        state: {
            cell: {
                stateUpdated: merge(this.state.dataState.events.cell.stateUpdated, this.state.behaviorState.events.cell.stateUpdated),
                created: merge(this.state.dataState.events.cell.created, this.state.behaviorState.events.cell.created),
                removed: merge(this.state.dataState.events.cell.removed, this.state.behaviorState.events.cell.removed),
            },
            object: {
                created: merge(this.state.dataState.events.object.created, this.state.behaviorState.events.object.created),
                removed: merge(this.state.dataState.events.object.removed, this.state.behaviorState.events.object.removed),
                updated: merge(this.state.dataState.events.object.updated, this.state.behaviorState.events.object.updated)
            },
            cameraSnapshots: this.state.cameraSnapshots.events,
            snapshots: this.state.snapshots.events,
        },
        log: this.ev<LogEntry>(),
        task: this.tasks.events,
        canvas3d: {
            initialized: this.ev(),
            settingsUpdated: this.ev()
        },
        interactivity: {
            propsUpdated: this.ev(),
            selectionUpdated: this.ev()
        }
    } as const

    readonly behaviors = {
        state: {
            isAnimating: this.ev.behavior<boolean>(false),
            isUpdating: this.ev.behavior<boolean>(false)
        },
        interaction: {
            hover: this.ev.behavior<Interactivity.HoverEvent>({ current: Interactivity.Loci.Empty, modifiers: ModifiersKeys.None, buttons: 0, button: 0 }),
            click: this.ev.behavior<Interactivity.ClickEvent>({ current: Interactivity.Loci.Empty, modifiers: ModifiersKeys.None, buttons: 0, button: 0 })
        },
        labels: {
            highlight: this.ev.behavior<{ entries: ReadonlyArray<LociLabelEntry> }>({ entries: [] })
        },
        layout: {
            leftPanelTabName: this.ev.behavior<LeftPanelTabName>('root')
        }
    } as const

    readonly canvas3d: Canvas3D | undefined;
    readonly layout = new PluginLayout(this);
    readonly toasts = new PluginToastManager(this);
    readonly interactivity: Interactivity;

    readonly lociLabels: LociLabelManager;

    readonly structureRepresentation = {
        registry: new StructureRepresentationRegistry(),
        themeCtx: { colorThemeRegistry: ColorTheme.createRegistry(), sizeThemeRegistry: SizeTheme.createRegistry() } as ThemeRegistryContext,
        manager: void 0 as any as StructureRepresentationManager
    } as const

    readonly volumeRepresentation = {
        registry: new VolumeRepresentationRegistry(),
        themeCtx: { colorThemeRegistry: ColorTheme.createRegistry(), sizeThemeRegistry: SizeTheme.createRegistry() } as ThemeRegistryContext
    } as const

    readonly dataFormat = {
        registry: new DataFormatRegistry()
    } as const

    readonly customModelProperties = new CustomPropertyRegistry<Model>();
    readonly customStructureProperties = new CustomStructureProperty.Registry();
    readonly customParamEditors = new Map<string, StateTransformParameters.Class>();

    readonly helpers = {
        measurement: new StructureMeasurementManager(this),
        structureSelectionManager: new StructureElementSelectionManager(this),
        structureSelection: new StructureSelectionHelper(this),
        structureRepresentation: new StructureRepresentationHelper(this),
        structureOverpaint: new StructureOverpaintHelper(this),
        substructureParent: new SubstructureParentHelper(this),
        viewportScreenshot: void 0 as ViewportScreenshotHelper | undefined
    } as const;

    /**
     * Used to store application specific custom state which is then available
     * to State Actions and similar constructs via the PluginContext.
     */
    readonly customState: unknown = Object.create(null);

    initViewer(canvas: HTMLCanvasElement, container: HTMLDivElement) {
        try {
            this.layout.setRoot(container);
            if (this.spec.layout && this.spec.layout.initial) this.layout.setProps(this.spec.layout.initial);

            (this.canvas3d as Canvas3D) = Canvas3D.fromCanvas(canvas, {}, t => this.runTask(t));
            this.events.canvas3d.initialized.next()
            this.events.canvas3d.initialized.isStopped = true // TODO is this a good way?
            const renderer = this.canvas3d!.props.renderer;
            PluginCommands.Canvas3D.SetSettings.dispatch(this, { settings: { renderer: { ...renderer, backgroundColor: Color(0xFCFBF9) } } });
            this.canvas3d!.animate();
            (this.helpers.viewportScreenshot as ViewportScreenshotHelper) = new ViewportScreenshotHelper(this);
            return true;
        } catch (e) {
            this.log.error('' + e);
            console.error(e);
            return false;
        }
    }

    readonly log: Log = {
        entries: List<LogEntry>(),
        entry: (e: LogEntry) => this.events.log.next(e),
        error: (msg: string) => this.events.log.next(LogEntry.error(msg)),
        message: (msg: string) => this.events.log.next(LogEntry.message(msg)),
        info: (msg: string) => this.events.log.next(LogEntry.info(msg)),
        warn: (msg: string) => this.events.log.next(LogEntry.warning(msg)),
    };

    /**
     * This should be used in all transform related request so that it could be "spoofed" to allow
     * "static" access to resources.
     */
    readonly fetch = ajaxGet

    runTask<T>(task: Task<T>) {
        return this.tasks.run(task);
    }

    requestTaskAbort(progress: Progress, reason?: string) {
        this.tasks.requestAbort(progress, reason);
    }

    dispose() {
        if (this.disposed) return;
        this.commands.dispose();
        this.canvas3d?.dispose();
        this.ev.dispose();
        this.state.dispose();
        this.tasks.dispose();
        this.layout.dispose();
        this.disposed = true;
    }

    applyTransform(state: State, a: StateTransform.Ref, transformer: StateTransformer, params: any) {
        const tree = state.build().to(a).apply(transformer, params);
        return PluginCommands.State.Update.dispatch(this, { state, tree });
    }

    updateTransform(state: State, a: StateTransform.Ref, params: any) {
        const tree = state.build().to(a).update(params);
        return PluginCommands.State.Update.dispatch(this, { state, tree });
    }

    private initBehaviorEvents() {
        merge(this.state.dataState.events.isUpdating, this.state.behaviorState.events.isUpdating).subscribe(u => {
            this.behaviors.state.isUpdating.next(u);
        });
    }

    private initBuiltInBehavior() {
        BuiltInPluginBehaviors.State.registerDefault(this);
        BuiltInPluginBehaviors.Representation.registerDefault(this);
        BuiltInPluginBehaviors.Camera.registerDefault(this);
        BuiltInPluginBehaviors.Misc.registerDefault(this);

        merge(this.state.dataState.events.log, this.state.behaviorState.events.log).subscribe(e => this.events.log.next(e));
    }

    private async initBehaviors() {
        const tree = this.state.behaviorState.build();

        for (const cat of Object.keys(PluginBehavior.Categories)) {
            tree.toRoot().apply(PluginBehavior.CreateCategory, { label: (PluginBehavior.Categories as any)[cat] }, { ref: cat, state: { isLocked: true } });
        }

        for (const b of this.spec.behaviors) {
            tree.to(PluginBehavior.getCategoryId(b.transformer)).apply(b.transformer, b.defaultParams, { ref: b.transformer.id });
        }

        await this.runTask(this.state.behaviorState.updateTree(tree, { doNotUpdateCurrent: true, doNotLogTiming: true }));
    }

    private initDataActions() {
        for (const a of this.spec.actions) {
            this.state.dataState.actions.add(a.action);
        }
    }

    private initAnimations() {
        if (!this.spec.animations) return;
        for (const anim of this.spec.animations) {
            this.state.animation.register(anim);
        }
    }

    private initCustomParamEditors() {
        if (!this.spec.customParamEditors) return;

        for (const [t, e] of this.spec.customParamEditors) {
            this.customParamEditors.set(t.id, e);
        }
    }

    constructor(public spec: PluginSpec) {
        this.events.log.subscribe(e => this.log.entries = this.log.entries.push(e));

        this.initBehaviorEvents();
        this.initBuiltInBehavior();

        this.initBehaviors();
        this.initDataActions();
        this.initAnimations();
        this.initCustomParamEditors();

        this.interactivity = new Interactivity(this);
        this.lociLabels = new LociLabelManager(this);

        (this.structureRepresentation.manager as StructureRepresentationManager)= new StructureRepresentationManager(this);

        this.log.message(`Mol* Plugin ${PLUGIN_VERSION} [${PLUGIN_VERSION_DATE.toLocaleString()}]`);
        if (!isProductionMode) this.log.message(`Development mode enabled`);
        if (isDebugMode) this.log.message(`Debug mode enabled`);

    }
}